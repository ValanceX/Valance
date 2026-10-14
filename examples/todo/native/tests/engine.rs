//! The Desktop PORT against the real engine: a child `node` process running the to-do application. No window; `Session` is what the window draws. Needs `pnpm build` in `examples/todo` first
//! (it writes `dist/`).
use port_desktop::host::{Applied, Engine, FromEngine, Session, ToEngine};
use port_desktop::port::inspect;
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

struct Harness {
    engine: Engine,
    session: Session,
}

impl Harness {
    fn start(address: &str) -> Harness {
        let engine = Engine::spawn(
            "node",
            &[main_js().to_string_lossy().into_owned(), address.to_owned()],
            || {},
        )
        .expect("node starts");
        let mut harness = Harness {
            engine,
            session: Session::default(),
        };

        harness.until(|session| session.port.tree().is_some());
        harness
    }

    /// Applies what the engine sends until `done` holds.
    fn until(&mut self, done: impl Fn(&Session) -> bool) {
        let deadline = Instant::now() + Duration::from_secs(10);

        while !done(&self.session) {
            let wait = deadline.saturating_duration_since(Instant::now());
            let message = self.engine.messages.recv_timeout(wait).unwrap_or_else(|_| {
                panic!(
                    "timed out; the screen is {:?}",
                    inspect::readable(&self.session.port)
                )
            });

            assert!(!matches!(
                self.session.apply(message),
                Applied::Incompatible(_) | Applied::Refused(_)
            ));
        }
    }

    /// What is there to read right now, after applying whatever the engine has already sent.
    fn drain(&mut self) {
        while let Ok(message) = self.engine.messages.try_recv() {
            self.session.apply(message);
        }
    }

    fn click(&mut self, label: &str, until: impl Fn(&Session) -> bool) {
        let report = inspect::click(&self.session.port, label, 0).unwrap_or_else(|| {
            panic!(
                "no enabled button {label}: {:?}",
                inspect::buttons(&self.session.port)
            )
        });

        self.engine.send(&report.into());
        self.until(until);
    }

    fn type_into(&mut self, placeholder: &str, text: &str, until: impl Fn(&Session) -> bool) {
        let report = inspect::type_into(&self.session.port, placeholder, text)
            .unwrap_or_else(|| panic!("no textfield {placeholder}"));

        self.engine.send(&report.into());
        self.until(until);
    }
}

fn shows(text: &'static str) -> impl Fn(&Session) -> bool {
    move |session| {
        inspect::readable(&session.port)
            .iter()
            .any(|line| line.contains(text))
            || inspect::buttons(&session.port)
                .iter()
                .any(|label| label.contains(text))
    }
}

fn updated(session: &Session) -> bool {
    session.port.counts().1 > 0
}

/// The lists, one named list with one item, opened on the item's edit screen.
fn on_an_item_edit(harness: &mut Harness) {
    harness.type_into("New list", "Groceries", updated);
    harness.click("Add list", shows("Groceries (0 of 0 open)"));
    harness.click("Groceries", shows("Nothing to do"));
    harness.type_into("New item", "Milk", |session| {
        inspect::readable(&session.port)
            .iter()
            .any(|line| line == "Milk")
    });
    harness.click("Add item", shows("1 of 1 open"));
    harness.click("Milk", shows("Edit item"));
}

#[test]
fn speaks_the_protocol_and_draws_the_lists() {
    let harness = Harness::start("/");

    assert_eq!(harness.session.app.as_deref(), Some("todo"));
    assert_eq!(harness.session.title.as_deref(), Some("To-do"));
    assert!(shows("Your lists")(&harness.session));
    assert!(shows("No lists yet")(&harness.session));
}

#[test]
fn makes_a_list_and_an_item() {
    let mut harness = Harness::start("/");

    harness.type_into("New list", "Groceries", updated);
    harness.click("Add list", shows("Groceries (0 of 0 open)"));
    harness.click("Groceries", shows("Nothing to do"));
    assert_eq!(harness.session.title.as_deref(), Some("Groceries · To-do"));
    assert_eq!(harness.session.port.counts().0, 2); // the lists, then the list

    harness.type_into("New item", "Milk", |session| {
        inspect::readable(&session.port)
            .iter()
            .any(|line| line == "Milk")
    });
    harness.click("Add item", shows("1 of 1 open"));
    assert!(inspect::buttons(&harness.session.port)
        .iter()
        .any(|label| label == "Milk"));
}

#[test]
fn an_address_that_names_nothing_starts_on_the_lists() {
    // Opened at the address of an item that does not exist: the engine starts on the lists instead.
    let stale = Harness::start("/lists/nope/items/nope");

    assert!(shows("Your lists")(&stale.session));
}

#[test]
fn the_guard_holds_over_the_wire_and_discard_releases_it() {
    let mut harness = Harness::start("/");

    on_an_item_edit(&mut harness);
    harness.type_into("What needs doing?", "Oat milk", shows("Unsaved changes"));

    // Back to the list is refused by the application's guard; the screen is still the edit.
    let back =
        inspect::click(&harness.session.port, "Back to list", 0).expect("the button is there");

    harness.engine.send(&back.into());
    std::thread::sleep(Duration::from_millis(300));
    harness.drain();
    assert!(shows("Edit item")(&harness.session));
    assert!(shows("Unsaved changes")(&harness.session));

    harness.click("Discard", |session| !shows("Unsaved changes")(session));
    harness.click("Back to list", shows("1 of 1 open"));
}

#[test]
fn closing_the_window_ends_the_engine() {
    let mut harness = Harness::start("/");

    harness.engine.close();

    let mut unmounted = false;

    while let Ok(message) = harness.engine.messages.recv_timeout(Duration::from_secs(5)) {
        unmounted |= matches!(message, FromEngine::Unmount);
    }

    assert!(
        unmounted,
        "the engine unmounts the screen, then exits and its stream ends"
    );
}

#[test]
fn closing_is_refused_while_an_edit_is_unsaved_and_allowed_after() {
    let mut harness = Harness::start("/");

    on_an_item_edit(&mut harness);
    harness.type_into("What needs doing?", "Oat milk", shows("Unsaved changes"));

    harness.engine.send(&ToEngine::CloseRequested);
    harness.until(|session| session.close_refused);
    assert!(
        shows("Unsaved changes")(&harness.session),
        "the window stays open on the edit"
    );

    harness.click("Discard", |session| {
        !shows("Unsaved changes")(session) && !session.close_refused
    });
    harness.engine.send(&ToEngine::CloseRequested);

    let mut unmounted = false;

    while let Ok(message) = harness.engine.messages.recv_timeout(Duration::from_secs(5)) {
        unmounted |= matches!(harness.session.apply(message), Applied::Closed);
    }

    assert!(
        unmounted,
        "an allowed close ends the engine, and the PORT sees the screen go"
    );
}

#[test]
fn a_reported_event_carries_only_the_handler_and_the_payload() {
    let harness = Harness::start("/");
    let typed =
        inspect::type_into(&harness.session.port, "New list", "x").expect("the textfield is there");
    let line = serde_json::to_value(ToEngine::from(typed)).unwrap();

    assert_eq!(line["op"], "event");
    assert_eq!(line["payload"], json!("x"));
    assert_eq!(
        line.as_object().unwrap().len(),
        3,
        "op, handler, payload and nothing else"
    );
}
