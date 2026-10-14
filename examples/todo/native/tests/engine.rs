//! The renderer's side of the wire against the real engine: a child `node` process running the to-do application. No window; `Screen` is what the window draws. Needs `pnpm build` in
//! `examples/todo` first (it writes `dist/`).
use renderer::engine::Engine;
use renderer::protocol::{FromEngine, ToEngine};
use renderer::screen::{Applied, Screen};
use serde_json::json;
use std::path::PathBuf;
use std::time::{Duration, Instant};

fn main_js() -> PathBuf {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist/main.js");

    assert!(
        path.exists(),
        "build the engine first: pnpm --filter @valancex/todo build ({} is missing)",
        path.display()
    );
    path
}

struct Session {
    engine: Engine,
    screen: Screen,
}

impl Session {
    fn start(address: &str) -> Session {
        let engine = Engine::spawn(
            "node",
            &[main_js().to_string_lossy().into_owned(), address.to_owned()],
            || {},
        )
        .expect("node starts");
        let mut session = Session {
            engine,
            screen: Screen::default(),
        };

        session.until(|screen| screen.tree.is_some());
        session
    }

    /// Applies what the engine sends until `done` holds.
    fn until(&mut self, done: impl Fn(&Screen) -> bool) {
        let deadline = Instant::now() + Duration::from_secs(10);

        while !done(&self.screen) {
            let wait = deadline.saturating_duration_since(Instant::now());
            let message = self.engine.messages.recv_timeout(wait).unwrap_or_else(|_| {
                panic!("timed out; the screen is {:?}", self.screen.readable())
            });

            assert_ne!(
                matches!(self.screen.apply(message), Applied::Incompatible(_)),
                true
            );
        }
    }

    fn press(&mut self, label: &str, until: impl Fn(&Screen) -> bool) {
        let handler = self
            .screen
            .press(label, 0)
            .unwrap_or_else(|| panic!("no enabled button {label}: {:?}", self.screen.buttons()));

        self.engine.send(&ToEngine::Event {
            handler,
            payload: None,
        });
        self.until(until);
    }

    fn type_into(&mut self, placeholder: &str, text: &str, until: impl Fn(&Screen) -> bool) {
        let handler = self
            .screen
            .field(placeholder)
            .unwrap_or_else(|| panic!("no field {placeholder}"));

        self.engine.send(&ToEngine::Event {
            handler,
            payload: Some(json!(text)),
        });
        self.until(until);
    }
}

fn shows(text: &'static str) -> impl Fn(&Screen) -> bool {
    move |screen| {
        screen.readable().iter().any(|line| line.contains(text))
            || screen.buttons().iter().any(|label| label.contains(text))
    }
}

#[test]
fn speaks_the_protocol_and_draws_the_lists() {
    let session = Session::start("/");

    assert_eq!(session.screen.app.as_deref(), Some("todo"));
    assert_eq!(session.screen.title().as_deref(), Some("To-do"));
    assert!(shows("Your lists")(&session.screen));
    assert!(shows("No lists yet")(&session.screen));
}

#[test]
fn makes_a_list_and_an_item_and_ticks_it_off() {
    let mut session = Session::start("/");

    session.type_into("New list", "Groceries", |screen| screen.updates > 0);
    session.press("Add list", shows("Groceries (0 of 0 open)"));
    session.press("Groceries", shows("Nothing to do"));
    assert_eq!(session.screen.title().as_deref(), Some("Groceries"));
    assert_eq!(session.screen.draws, 2); // the lists, then the list

    session.type_into("New item", "Milk", |screen| {
        screen.readable().iter().any(|line| line == "Milk")
    });
    session.press("Add item", shows("1 of 1 open"));
    assert!(session.screen.buttons().iter().any(|label| label == "Milk"));
}

#[test]
fn an_address_that_names_nothing_starts_on_the_lists() {
    // Opened at the address of an item that does not exist: the engine starts on the lists instead.
    let stale = Session::start("/lists/nope/items/nope");

    assert!(shows("Your lists")(&stale.screen));
}

#[test]
fn the_guard_holds_over_the_wire_and_discard_releases_it() {
    let mut session = Session::start("/");

    session.type_into("New list", "Groceries", |screen| screen.updates > 0);
    session.press("Add list", shows("Groceries (0 of 0 open)"));
    session.press("Groceries", shows("Nothing to do"));
    session.type_into("New item", "Milk", |screen| {
        screen.readable().iter().any(|line| line == "Milk")
    });
    session.press("Add item", shows("1 of 1 open"));
    session.press("Milk", shows("Edit item"));
    session.type_into("What needs doing?", "Oat milk", shows("Unsaved changes"));

    // Back to the list is refused by the application's guard; the screen is still the edit.
    let back = session
        .screen
        .press("Back to list", 0)
        .expect("the button is there");

    session.engine.send(&ToEngine::Event {
        handler: back,
        payload: None,
    });
    std::thread::sleep(Duration::from_millis(300));
    while let Ok(message) = session.engine.messages.try_recv() {
        session.screen.apply(message);
    }
    assert!(shows("Edit item")(&session.screen));
    assert!(shows("Unsaved changes")(&session.screen));

    session.press("Discard", |screen| !shows("Unsaved changes")(screen));
    session.press("Back to list", shows("1 of 1 open"));
}

#[test]
fn closing_the_window_ends_the_engine() {
    let mut session = Session::start("/");

    session.engine.close();

    let mut unmounted = false;

    while let Ok(message) = session.engine.messages.recv_timeout(Duration::from_secs(5)) {
        unmounted |= matches!(message, FromEngine::Unmount);
    }

    assert!(
        unmounted,
        "the engine unmounts the screen, then exits and its stream ends"
    );
}

#[test]
fn closing_is_refused_while_an_edit_is_unsaved_and_allowed_after() {
    let mut session = Session::start("/");

    session.type_into("New list", "Groceries", |screen| screen.updates > 0);
    session.press("Add list", shows("Groceries (0 of 0 open)"));
    session.press("Groceries", shows("Nothing to do"));
    session.type_into("New item", "Milk", |screen| {
        screen.readable().iter().any(|line| line == "Milk")
    });
    session.press("Add item", shows("1 of 1 open"));
    session.press("Milk", shows("Edit item"));
    session.type_into("What needs doing?", "Oat milk", shows("Unsaved changes"));

    session.engine.send(&ToEngine::CloseRequested);
    session.until(|screen| screen.close_refused);
    assert!(
        shows("Unsaved changes")(&session.screen),
        "the window stays open on the edit"
    );

    session.press("Discard", |screen| {
        !shows("Unsaved changes")(screen) && !screen.close_refused
    });
    session.engine.send(&ToEngine::CloseRequested);

    let mut unmounted = false;

    while let Ok(message) = session.engine.messages.recv_timeout(Duration::from_secs(5)) {
        unmounted |= matches!(session.screen.apply(message), Applied::Closed);
    }

    assert!(
        unmounted,
        "an allowed close ends the engine, and the renderer sees the screen go"
    );
}
