//! The host protocol (PROTOCOL.md): what the engine sends, what this renderer sends back.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub const PROTOCOL: u64 = 1;

/// A node of MESH's render tree.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Node {
    Text {
        key: String,
        text: String,
    },
    Node {
        key: String,
        component: String,
        #[serde(default)]
        props: BTreeMap<String, Value>,
        /// Event name → the opaque handler identifier to report.
        #[serde(default)]
        events: BTreeMap<String, String>,
        #[serde(default)]
        children: Vec<Node>,
    },
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Tree {
    pub root: Node,
}

#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum FromEngine {
    Hello {
        protocol: u64,
        app: String,
    },
    Draw {
        tree: Tree,
    },
    Update {
        tree: Tree,
    },
    Unmount,
    /// The answer to `CloseRequested`: when not allowed, the window stays open.
    #[serde(rename = "closeAnswer")]
    CloseAnswer {
        allowed: bool,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum ToEngine {
    Event {
        handler: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        payload: Option<Value>,
    },
    Close,
    /// The person asked to close the window; the engine answers with `closeAnswer`.
    #[serde(rename = "closeRequested")]
    CloseRequested,
}

impl Node {
    /// The text of a node and everything under it: a button's label.
    pub fn text(&self) -> String {
        match self {
            Node::Text { text, .. } => text.clone(),
            Node::Node { children, .. } => children.iter().map(Node::text).collect(),
        }
    }
}

pub fn parse(line: &str) -> Result<FromEngine, serde_json::Error> {
    serde_json::from_str(line)
}
