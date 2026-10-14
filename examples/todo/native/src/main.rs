//! The to-do desktop app: a window that draws what the engine sends and reports what the person does.
//!
//! The engine is the program named by `TODO_ENGINE` (a command line, for development: `node dist/main.js`) or else `todo-engine` next to this executable.
use eframe::egui;
use renderer::engine::Engine;
use renderer::protocol::ToEngine;
use renderer::screen::{Applied, Screen};
use renderer::view::View;

struct App {
    engine: Engine,
    screen: Screen,
    view: View,
    title: String,
    problem: Option<String>,
}

fn engine_command() -> (String, Vec<String>) {
    if let Ok(line) = std::env::var("TODO_ENGINE") {
        let mut parts = line.split_whitespace().map(str::to_owned);

        if let Some(program) = parts.next() {
            return (program, parts.collect());
        }
    }

    let sibling = std::env::current_exe()
        .ok()
        .and_then(|exe| {
            exe.parent().map(|dir| {
                dir.join(if cfg!(windows) {
                    "todo-engine.exe"
                } else {
                    "todo-engine"
                })
            })
        })
        .unwrap_or_else(|| "todo-engine".into());

    (sibling.to_string_lossy().into_owned(), Vec::new())
}

impl eframe::App for App {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        while let Ok(message) = self.engine.messages.try_recv() {
            let replaced = matches!(message, renderer::protocol::FromEngine::Draw { .. });

            match self.screen.apply(message) {
                Applied::Changed => {
                    if replaced {
                        self.view.reset();
                    }
                }
                Applied::Closed => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
                Applied::Incompatible(found) => {
                    self.problem = Some(format!(
                        "The engine speaks protocol {found}; this app speaks {}.",
                        renderer::protocol::PROTOCOL
                    ));
                }
            }
        }

        if let Some(title) = self.screen.title() {
            if title != self.title {
                ctx.send_viewport_cmd(egui::ViewportCommand::Title(title.clone()));
                self.title = title;
            }
        }

        let mut events: Vec<ToEngine> = Vec::new();

        egui::CentralPanel::default().show(ctx, |ui| {
            egui::ScrollArea::vertical().show(ui, |ui| {
                if let Some(problem) = &self.problem {
                    ui.colored_label(egui::Color32::LIGHT_RED, problem);
                } else if let Some(tree) = &self.screen.tree {
                    self.view.show(ui, &tree.root, &mut events);
                } else {
                    ui.label("Starting…");
                }
            });
        });

        for event in events {
            self.engine.send(&event);
        }
    }

    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        self.engine.close();
    }
}

fn main() -> eframe::Result {
    let (program, args) = engine_command();
    // The engine's thread asks the window to repaint when a message arrives; the window exists only after the engine starts, so it hands its context over once it does.
    let window: std::sync::Arc<std::sync::OnceLock<egui::Context>> =
        std::sync::Arc::new(std::sync::OnceLock::new());
    let engine = match Engine::spawn(&program, &args, {
        let window = window.clone();

        move || {
            if let Some(ctx) = window.get() {
                ctx.request_repaint();
            }
        }
    }) {
        Ok(engine) => engine,
        Err(error) => {
            eprintln!("could not start the engine ({program}): {error}");
            std::process::exit(2);
        }
    };

    eframe::run_native(
        "To-do",
        eframe::NativeOptions {
            viewport: egui::ViewportBuilder::default()
                .with_inner_size([480.0, 640.0])
                .with_title("To-do"),
            ..Default::default()
        },
        Box::new(move |cc| {
            let _ = window.set(cc.egui_ctx.clone());

            Ok(Box::new(App {
                engine,
                screen: Screen::default(),
                view: View::default(),
                title: String::new(),
                problem: None,
            }))
        }),
    )
}
