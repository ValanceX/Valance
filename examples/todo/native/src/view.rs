//! Drawing a render tree with egui. Every component of the screen vocabulary (PROTOCOL.md) becomes a widget; the person's actions come back as events to report. A component this renderer does not
//! know is drawn as a visible marker with its children, not dropped.
use crate::protocol::{Node, ToEngine};
use egui::{Button, RichText, TextEdit, Ui};
use serde_json::Value;
use std::collections::HashMap;

/// One text field: what the engine last said it holds, what the person sees and has typed, and what was reported that the engine has not yet answered. The engine owns the value, but it
/// answers a keystroke after the next one may have been typed; taking its answer at face value would delete the keystroke that came in between.
#[derive(Debug, Clone, PartialEq)]
pub struct Field {
    pub shown: String,
    pub buffer: String,
    pending: Vec<String>,
}

impl Field {
    pub fn new(value: &str) -> Field {
        Field {
            shown: value.to_owned(),
            buffer: value.to_owned(),
            pending: Vec::new(),
        }
    }

    /// The engine says the field's value is `value`. An answer to something typed leaves the buffer alone (the person may be ahead of it); a value that is not an answer, because the engine changed
    /// it (a save, a discard, a clear), replaces what was typed.
    pub fn incoming(&mut self, value: &str) {
        if value == self.shown {
            return;
        }

        self.shown = value.to_owned();

        match self.pending.iter().position(|sent| sent == value) {
            Some(at) => {
                self.pending.drain(..=at);
            }
            None => {
                self.pending.clear();
                self.buffer = value.to_owned();
            }
        }
    }

    /// The person changed the buffer: this is what to report.
    pub fn typed(&mut self) -> String {
        self.pending.push(self.buffer.clone());
        self.buffer.clone()
    }
}

#[derive(Default)]
pub struct View {
    fields: HashMap<String, Field>,
}

impl View {
    pub fn show(&mut self, ui: &mut Ui, node: &Node, out: &mut Vec<ToEngine>) {
        match node {
            Node::Text { text, .. } => {
                ui.label(text);
            }
            Node::Node {
                key,
                component,
                props,
                events,
                children,
            } => match component.as_str() {
                "window" | "column" => {
                    ui.vertical(|ui| self.each(ui, children, out));
                }
                "row" => {
                    ui.horizontal_wrapped(|ui| self.each(ui, children, out));
                }
                "heading" => {
                    ui.heading(RichText::new(node.text()).strong());
                }
                "text" => {
                    ui.label(node.text());
                }
                "button" => {
                    let enabled = !props
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    if ui.add_enabled(enabled, Button::new(node.text())).clicked() {
                        report(events, "press", None, out);
                    }
                }
                "checkbox" => {
                    let mut checked = props
                        .get("checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);

                    // The engine owns the value: a click is reported, and the box shows what comes back.
                    if ui.checkbox(&mut checked, "").changed() {
                        report(events, "toggle", None, out);
                    }
                }
                "field" => {
                    let shown = props.get("value").and_then(Value::as_str).unwrap_or("");
                    let hint = props
                        .get("placeholder")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned();
                    let field = self
                        .fields
                        .entry(key.clone())
                        .or_insert_with(|| Field::new(shown));

                    field.incoming(shown);

                    if ui
                        .add(
                            TextEdit::singleline(&mut field.buffer)
                                .hint_text(hint)
                                .desired_width(240.0),
                        )
                        .changed()
                    {
                        let text = field.typed();

                        report(events, "change", Some(Value::String(text)), out);
                    }
                }
                other => {
                    ui.vertical(|ui| {
                        ui.colored_label(egui::Color32::LIGHT_RED, format!("<{other}>"));
                        self.each(ui, children, out);
                    });
                }
            },
        }
    }

    fn each(&mut self, ui: &mut Ui, children: &[Node], out: &mut Vec<ToEngine>) {
        for child in children {
            self.show(ui, child, out);
        }
    }

    /// Forgets the fields of a screen that was replaced.
    pub fn reset(&mut self) {
        self.fields.clear();
    }
}

fn report(
    events: &std::collections::BTreeMap<String, String>,
    name: &str,
    payload: Option<Value>,
    out: &mut Vec<ToEngine>,
) {
    if let Some(handler) = events.get(name) {
        out.push(ToEngine::Event {
            handler: handler.clone(),
            payload,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::Field;

    #[test]
    fn a_stale_answer_does_not_delete_what_was_typed_after() {
        let mut field = Field::new("");

        field.buffer = "G".into();
        assert_eq!(field.typed(), "G");
        field.buffer = "Gr".into();
        assert_eq!(field.typed(), "Gr");

        field.incoming("G"); // the answer to the first keystroke, after the second was typed
        assert_eq!(field.buffer, "Gr");
        field.incoming("Gr");
        assert_eq!(field.buffer, "Gr");
    }

    #[test]
    fn a_value_the_engine_changed_replaces_what_was_typed() {
        let mut field = Field::new("Milk");

        field.buffer = "Oat milk".into();
        field.typed();
        field.incoming("Oat milk");
        field.incoming("Milk"); // a discard
        assert_eq!(field.buffer, "Milk");

        field.incoming(""); // cleared after an add
        assert_eq!(field.buffer, "");
    }

    #[test]
    fn skipped_answers_are_tolerated() {
        let mut field = Field::new("");

        for text in ["a", "ab", "abc"] {
            field.buffer = text.into();
            field.typed();
        }

        field.incoming("abc"); // the engine skipped the first two
        assert_eq!(field.buffer, "abc");
        field.incoming("");
        assert_eq!(field.buffer, "");
    }
}
