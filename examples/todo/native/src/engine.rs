//! The engine, as a child process: its stdout is read on a thread, its stdin written to.
use crate::protocol::{parse, FromEngine, ToEngine};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{channel, Receiver};
use std::thread;

pub struct Engine {
    child: Child,
    stdin: Option<ChildStdin>,
    pub messages: Receiver<FromEngine>,
}

impl Engine {
    /// Starts `program args…`. `wake` is called after each message arrives (a window asks for a repaint).
    pub fn spawn(
        program: &str,
        args: &[String],
        wake: impl Fn() + Send + 'static,
    ) -> std::io::Result<Engine> {
        let mut command = Command::new(program);

        command
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: the engine has no console of its own
        }

        let mut child = command.spawn()?;
        let stdin = child.stdin.take();
        let stdout = child.stdout.take().expect("piped");
        let (send, messages) = channel();

        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };

                match parse(&line) {
                    Ok(message) => {
                        if send.send(message).is_err() {
                            break;
                        }
                        wake();
                    }
                    Err(error) => {
                        eprintln!("renderer: ignoring a line that is not a message: {error}")
                    }
                }
            }
        });

        Ok(Engine {
            child,
            stdin,
            messages,
        })
    }

    pub fn send(&mut self, message: &ToEngine) {
        if let Some(stdin) = self.stdin.as_mut() {
            let line = serde_json::to_string(message).expect("a message serializes");

            if writeln!(stdin, "{line}")
                .and_then(|_| stdin.flush())
                .is_err()
            {
                self.stdin = None; // the engine is gone
            }
        }
    }

    /// Tells the engine the window is closing, then waits for it.
    pub fn close(&mut self) {
        self.send(&ToEngine::Close);
        self.stdin = None;
        let _ = self.child.wait();
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.stdin = None;
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
