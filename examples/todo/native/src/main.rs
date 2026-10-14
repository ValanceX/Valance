#![cfg_attr(all(windows, not(debug_assertions)), windows_subsystem = "windows")]

//! The to-do desktop app. The window, the drawing and the conversation with the engine are the Desktop PORT's; this program says what the app is called and where its engine is.
//!
//! The engine is the program named by `TODO_ENGINE` (a command line, for development: `node dist/main.js`) or else `todo-engine` next to this executable.
use port_desktop::app::{run, Options};

fn main() -> eframe::Result {
    run(Options {
        title: "To-do".into(),
        engine_env: "TODO_ENGINE".into(),
        engine_sibling: "todo-engine".into(),
        size: [480.0, 640.0],
    })
}
