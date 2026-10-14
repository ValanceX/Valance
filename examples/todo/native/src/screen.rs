//! What is on the screen, as plain data and independent of any window: the current tree, a way to find what a person could press or type into, and the events they produce. The window
//! (`view.rs`) draws it; a test drives it directly.
use crate::protocol::{FromEngine, Node, Tree, PROTOCOL};
use serde_json::Value;

#[derive(Debug, Default)]
pub struct Screen {
    pub tree: Option<Tree>,
    pub app: Option<String>,
    pub draws: usize,
    pub updates: usize,
    pub gone: bool,
    /// The engine said the window may not close yet (unsaved edits); cleared by the next screen it sends.
    pub close_refused: bool,
}

#[derive(Debug, PartialEq)]
pub enum Applied {
    Changed,
    Closed,
    /// The engine speaks a protocol this renderer does not.
    Incompatible(u64),
}

impl Screen {
    pub fn apply(&mut self, message: FromEngine) -> Applied {
        match message {
            FromEngine::Hello { protocol, app } => {
                if protocol != PROTOCOL {
                    return Applied::Incompatible(protocol);
                }
                self.app = Some(app);
            }
            FromEngine::Draw { tree } => {
                self.tree = Some(tree);
                self.draws += 1;
                self.close_refused = false;
            }
            FromEngine::Update { tree } => {
                self.tree = Some(tree);
                self.updates += 1;
                self.close_refused = false;
            }
            FromEngine::CloseAnswer { allowed } => self.close_refused = !allowed,
            FromEngine::Unmount => {
                self.tree = None;
                self.gone = true;
                return Applied::Closed;
            }
        }
        Applied::Changed
    }

    fn all(&self) -> Vec<&Node> {
        fn walk<'a>(node: &'a Node, into: &mut Vec<&'a Node>) {
            into.push(node);
            if let Node::Node { children, .. } = node {
                for child in children {
                    walk(child, into);
                }
            }
        }
        let mut found = Vec::new();
        if let Some(tree) = &self.tree {
            walk(&tree.root, &mut found);
        }
        found
    }

    /// The window's title, from the root `window` component.
    pub fn title(&self) -> Option<String> {
        self.tree.as_ref().and_then(|tree| match &tree.root {
            Node::Node {
                component, props, ..
            } if component == "window" => props
                .get("title")
                .and_then(Value::as_str)
                .map(str::to_owned),
            _ => None,
        })
    }

    /// The handler to report for pressing the nth enabled button whose label starts with `label`.
    pub fn press(&self, label: &str, nth: usize) -> Option<String> {
        self.all()
            .into_iter()
            .filter_map(|node| match node {
                Node::Node {
                    component,
                    props,
                    events,
                    ..
                } if component == "button" && node.text().starts_with(label) => Some((
                    props
                        .get("disabled")
                        .and_then(Value::as_bool)
                        .unwrap_or(false),
                    events.get("press"),
                )),
                _ => None,
            })
            .nth(nth)
            .and_then(|(disabled, handler)| if disabled { None } else { handler.cloned() })
    }

    /// The handler for typing into the field with this placeholder.
    pub fn field(&self, placeholder: &str) -> Option<String> {
        self.all().into_iter().find_map(|node| match node {
            Node::Node {
                component,
                props,
                events,
                ..
            } if component == "field"
                && props.get("placeholder").and_then(Value::as_str) == Some(placeholder) =>
            {
                events.get("change").cloned()
            }
            _ => None,
        })
    }

    /// The labels of every button, in order.
    pub fn buttons(&self) -> Vec<String> {
        self.all()
            .into_iter()
            .filter(|node| matches!(node, Node::Node { component, .. } if component == "button"))
            .map(Node::text)
            .collect()
    }

    /// Every piece of text and field value on the screen, in order: what a person could read.
    pub fn readable(&self) -> Vec<String> {
        self.all()
            .into_iter()
            .filter_map(|node| match node {
                Node::Text { text, .. } => Some(text.clone()),
                Node::Node {
                    component, props, ..
                } if component == "field" => props
                    .get("value")
                    .and_then(Value::as_str)
                    .map(str::to_owned),
                _ => None,
            })
            .collect()
    }
}
