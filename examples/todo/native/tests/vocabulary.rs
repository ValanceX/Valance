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

/// `vlx` compiles a desktop project against copies of the PORT's two vocabulary files (`packages/cli/vocabularies/desktop/`); they are the PORT's, or a template could pass `vlx check` and fail in the window.
#[test]
fn the_vocabularies_vlx_compiles_against_are_the_ports() {
    for (file, theirs) in [
        ("vocabulary.json", port_desktop::vocabulary::JSON),
        ("content.json", port_desktop::vocabulary::CONTENT_JSON),
    ] {
        let ours = std::fs::read_to_string(format!(
            "{}/../../../packages/cli/vocabularies/desktop/{file}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .expect("the copy exists");
        let ours: serde_json::Value = serde_json::from_str(&ours).unwrap();
        let theirs: serde_json::Value = serde_json::from_str(theirs).unwrap();

        assert_eq!(
            ours, theirs,
            "copy the PORT's {file} to packages/cli/vocabularies/desktop/{file}"
        );
    }
}
