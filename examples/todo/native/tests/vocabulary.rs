//! The application's own vocabulary is a subset of the Desktop PORT's: a change in the PORT to a word the application uses shows here.
use serde_json::{json, Value};

/// What is wrong with `ours` as a subset of `theirs`: a word the PORT lacks, or a prop or an event of ours that the PORT lacks or defines differently. A word, a prop or an event the PORT has and `ours` does not is not a difference (the PORT may grow).
fn differences(ours: &Value, theirs: &Value) -> Vec<String> {
    let their_words = theirs["components"]
        .as_object()
        .expect("the PORT's vocabulary has components");
    let mut found = Vec::new();

    for (word, ours) in ours["components"]
        .as_object()
        .expect("our vocabulary has components")
    {
        match their_words.get(word) {
            None => found.push(format!("`{word}` is not in the PORT's vocabulary")),
            Some(theirs) => {
                for part in ["props", "events"] {
                    for (name, ours) in ours[part].as_object().into_iter().flatten() {
                        if theirs[part].get(name) != Some(ours) {
                            found.push(format!(
                                "`{word}`: its {part} `{name}` is missing or differs in the PORT"
                            ));
                        }
                    }
                }
            }
        }
    }

    found
}

fn ours() -> Value {
    let text = std::fs::read_to_string(format!(
        "{}/../src/desktop-vocabulary.json",
        env!("CARGO_MANIFEST_DIR")
    ))
    .expect("the copy exists");

    serde_json::from_str(&text).unwrap()
}

fn theirs() -> Value {
    serde_json::from_str(port_desktop::vocabulary::JSON).unwrap()
}

#[test]
fn every_word_of_the_application_is_in_the_ports_vocabulary_with_the_same_props_and_events() {
    assert_eq!(
        differences(&ours(), &theirs()),
        Vec::<String>::new(),
        "update examples/todo/src/desktop-vocabulary.json from the PORT's vocabulary.json (or the word the application uses has changed in the PORT)"
    );
}

#[test]
fn the_application_has_seven_words() {
    assert_eq!(
        ours()["components"].as_object().unwrap().len(),
        7,
        "examples/todo uses seven words; a change here is a change to its screens"
    );
}

/// The check finds each way a word can differ (the controls: a guard that never fails guards nothing).
#[test]
fn a_changed_word_is_found() {
    let theirs = theirs();
    let word = ours()["components"]
        .as_object()
        .unwrap()
        .keys()
        .next()
        .unwrap()
        .clone();

    // a prop's type changed
    let mut changed = ours();
    let first_prop = changed["components"][&word]["props"]
        .as_object()
        .and_then(|props| props.keys().next().cloned());

    if let Some(prop) = first_prop {
        changed["components"][&word]["props"][&prop] =
            json!({ "type": { "kind": "number" }, "required": true });
        assert_eq!(differences(&changed, &theirs).len(), 1, "a prop changed");
    }

    // an event the PORT does not have
    let mut extra_event = ours();
    extra_event["components"]["button"]["events"]["invented"] = json!({});
    assert_eq!(
        differences(&extra_event, &theirs),
        ["`button`: its events `invented` is missing or differs in the PORT"]
    );

    // an event the application uses, removed by the PORT
    let mut removed = theirs.clone();
    removed["components"]["button"]["events"] = json!({});
    assert_eq!(
        differences(&ours(), &removed),
        ["`button`: its events `click` is missing or differs in the PORT"]
    );

    // a word the PORT does not have
    let mut unknown = ours();
    unknown["components"]["marquee"] = json!({ "props": {}, "events": {} });
    assert_eq!(
        differences(&unknown, &theirs),
        ["`marquee` is not in the PORT's vocabulary"]
    );

    // a word renamed
    let mut renamed = ours();
    let moved = renamed["components"]
        .as_object_mut()
        .unwrap()
        .remove(&word)
        .unwrap();
    renamed["components"]
        .as_object_mut()
        .unwrap()
        .insert(format!("{word}x"), moved);
    assert_eq!(
        differences(&renamed, &theirs),
        [format!("`{word}x` is not in the PORT's vocabulary")]
    );
}

/// The PORT may add a prop or an event to a word the application uses: the application's seven are still a subset.
#[test]
fn a_prop_or_an_event_the_port_adds_is_not_a_difference() {
    let mut grown = theirs();
    grown["components"]["button"]["props"]["invented"] =
        json!({ "type": { "kind": "string" }, "required": false });
    grown["components"]["button"]["events"]["invented"] = json!({});

    assert_eq!(differences(&ours(), &grown), Vec::<String>::new());
}

/// The PORT may add words: the application's seven are still a subset.
#[test]
fn a_word_the_port_adds_is_not_a_difference() {
    let mut grown = theirs();
    grown["components"]["carousel"] = json!({ "props": {}, "events": {} });

    assert_eq!(differences(&ours(), &grown), Vec::<String>::new());
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
