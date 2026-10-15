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

/// `vlx` compiles a desktop project against the vocabulary the PORT publishes as a package (`@valancex/port-desktop-vocabulary`, installed under `packages/cli`); that package is the PORT's own
/// files for the crate this application is built with, or a template could pass `vlx check` and fail in the window. (A new PORT revision here needs the package version that was made from it.)
#[test]
fn the_vocabularies_vlx_compiles_against_are_the_ports() {
    for (file, theirs) in [
        ("vocabulary.json", port_desktop::vocabulary::JSON),
        ("content.json", port_desktop::vocabulary::CONTENT_JSON),
    ] {
        let ours = std::fs::read_to_string(format!(
            "{}/../../../packages/cli/node_modules/@valancex/port-desktop-vocabulary/{file}",
            env!("CARGO_MANIFEST_DIR")
        ))
        .expect("the package is installed (pnpm install)");
        let ours: serde_json::Value = serde_json::from_str(&ours).unwrap();
        let theirs: serde_json::Value = serde_json::from_str(theirs).unwrap();

        assert_eq!(
            ours, theirs,
            "@valancex/port-desktop-vocabulary's {file} differs from the PORT revision this application is built with: use the package version made from that revision"
        );
    }
}
