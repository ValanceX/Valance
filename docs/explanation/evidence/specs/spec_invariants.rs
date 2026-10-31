//! Spec-invariant checker over the AccessKit TreeUpdate the Port produces (prototype, scratch copy).
#![cfg(feature = "window")]
use accesskit::{NodeId, Role, TreeUpdate};
use port_desktop::tree::Tree;
use port_desktop::view::{Output, View};
use std::collections::{HashMap, HashSet};

fn drawn(tree: &Tree) -> TreeUpdate {
    let ctx = egui::Context::default();
    ctx.enable_accesskit();
    let mut view = View::default();
    let mut out: Vec<Output> = Vec::new();
    ctx.run(egui::RawInput::default(), |ctx| {
        egui::CentralPanel::default().show(ctx, |ui| view.show(ui, &tree.root, &mut out));
    })
    .platform_output
    .accesskit_update
    .expect("the accessibility tree")
}

/// Structural invariants stated in accesskit's TreeUpdate docs and enforced (by panic) in accesskit_consumer, returned as messages instead of panics, plus ones neither checks.
fn violations(u: &TreeUpdate) -> Vec<String> {
    let mut v = vec![];
    let by_id: HashMap<NodeId, &accesskit::Node> = u.nodes.iter().map(|(i, n)| (*i, n)).collect();
    if by_id.len() != u.nodes.len() { v.push("duplicate node id in update".into()); }
    match &u.tree { None => v.push("initial update lacks Tree (TreeUpdate::tree must be Some)".into()),
        Some(t) => if !by_id.contains_key(&t.root) { v.push(format!("root {:?} not in nodes", t.root)); } }
    if !by_id.contains_key(&u.focus) { v.push(format!("focus {:?} not in nodes", u.focus)); }
    let mut parent: HashMap<NodeId, NodeId> = HashMap::new();
    for (id, n) in &u.nodes {
        let mut seen = HashSet::new();
        for c in n.children() {
            if !seen.insert(*c) { v.push(format!("{id:?} lists child {c:?} twice")); }
            if !by_id.contains_key(c) { v.push(format!("{id:?} child {c:?} missing")); }
            if let Some(p) = parent.insert(*c, *id) { v.push(format!("{c:?} has two parents {p:?} and {id:?}")); }
        }
    }
    if let Some(t) = &u.tree { for (id, _) in &u.nodes { if *id != t.root && !parent.contains_key(id) { v.push(format!("{id:?} is an orphan")); } } }
    // reachability / cycles
    if let Some(t) = &u.tree {
        let mut reach = HashSet::new(); let mut st = vec![t.root];
        while let Some(i) = st.pop() { if reach.insert(i) { if let Some(n) = by_id.get(&i) { st.extend(n.children().iter().copied()); } } }
        for (id, _) in &u.nodes { if !reach.contains(id) { v.push(format!("{id:?} unreachable from root")); } }
    }
    // role/property rules from the ARIA-derived contract in bets/accessibility.md
    for (id, n) in &u.nodes {
        let named = n.label().map_or(false, |s| !s.is_empty()) || n.value().map_or(false, |s| !s.is_empty());
        match n.role() {
            Role::CheckBox | Role::TextInput | Role::RadioGroup | Role::Table if !named && n.labelled_by().is_empty() =>
                v.push(format!("{id:?} {:?} has no accessible name", n.role())),
            Role::Heading if n.level().is_none() => v.push(format!("{id:?} Heading has no level")),
            _ => {}
        }
    }
    v
}

fn sample() -> Tree {
    serde_json::from_value(serde_json::json!({"format":"mesh-render","version":1,"root":{"type":"node","key":"c","component":"column","props":{},"events":{},"children":[
      {"type":"node","key":"a","component":"checkbox","props":{"checked":true,"label":"Done"},"events":{},"children":[]},
      {"type":"node","key":"x","component":"checkbox","props":{"checked":false},"events":{},"children":[]},
      {"type":"node","key":"h","component":"heading","props":{"level":2},"events":{},"children":[{"type":"text","key":"t","text":"Title"}]},
      {"type":"node","key":"b","component":"textfield","props":{"value":"","label":"New item"},"events":{},"children":[]}]}})).unwrap()
}

#[test]
fn real_update_through_consumer_and_invariants() {
    let u = drawn(&sample());
    println!("nodes: {}", u.nodes.len());
    for (id, n) in &u.nodes { println!("  {:?} {:?} label={:?} value={:?} level={:?}", id, n.role(), n.label(), n.value(), n.level()); }
    let v = violations(&u);
    println!("violations: {v:#?}");
    // the consumer panics on structural errors; building a Tree from the real update proves it passes
    let t = accesskit_consumer::Tree::new(u.clone(), true);
    println!("consumer built tree, root={:?}", t.state().root().id());
}

#[test]
fn corrupted_updates_are_caught() {
    let mut u = drawn(&sample());
    // dangle a child id
    let (_, root) = u.nodes.iter_mut().next().unwrap();
    root.push_child(NodeId(999_999));
    let v = violations(&u);
    println!("{v:?}");
    assert!(v.iter().any(|m| m.contains("missing")));
    let r = std::panic::catch_unwind(|| accesskit_consumer::Tree::new(u.clone(), true));
    println!("consumer panicked on dangling child: {}", r.is_err());
    assert!(r.is_err());
    let mut u2 = drawn(&sample()); u2.focus = NodeId(424242);
    assert!(violations(&u2).iter().any(|m| m.contains("focus")));
    assert!(std::panic::catch_unwind(|| accesskit_consumer::Tree::new(u2.clone(), true)).is_err());
}
