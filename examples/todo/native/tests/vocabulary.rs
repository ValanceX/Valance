//! The application's copy of the Desktop PORT's vocabulary is the PORT's: a change in the PORT shows here as a failure to update the copy.
#[test]
fn the_vendored_vocabulary_is_the_ports() {
    let ours = std::fs::read_to_string(format!(
        "{}/../src/desktop-vocabulary.json",
        env!("CARGO_MANIFEST_DIR")
    ))
    .expect("the copy exists");
    let ours: serde_json::Value = serde_json::from_str(&ours).unwrap();
    let theirs: serde_json::Value = serde_json::from_str(port_desktop::vocabulary::JSON).unwrap();

    assert_eq!(
        ours, theirs,
        "copy the PORT's vocabulary.json to examples/todo/src/desktop-vocabulary.json"
    );
}
