# Bet 1: The primitive specification

| | |
|---|---|
| **Stage** | 1 Evidence. A design is drafted below for review; it is not accepted |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | Nothing. Bets 2, 6, 7, 8, 9, 10 and 11 depend on this one |

## Question

Can one declarative record per primitive be the only place a primitive is defined, with every other artifact (manifests, realization tables, documentation, editor help, tests, a gallery) generated from it or checked against it?

## Why, and who is hurt

### A primitive is defined in many places today

MESH has no primitive set of its own: "each application's manifest declares its own" ([MESH architecture](https://github.com/ValanceX/Mesh/blob/main/docs/ARCHITECTURE.md), and F6 of the [PORT integration audit](https://github.com/ValanceX/Port/blob/main/docs/architecture/2026-09-27-port-integration-audit.md)). That was the right call for MESH. The consequence is that the facts about one primitive are spread out and kept by hand:

| Fact about a primitive | Where it lives today |
|---|---|
| Name, prop types, event payloads (what a template may write) | Web: derived by `manifest()` from the realization table (`packages/valance/src/web-manifest.ts`). Desktop: `vocabulary.json` and `content.json` in the Desktop PORT, hand-kept MESH manifests |
| Which props are optional | Web: a side table, `webVocabulary.optional` (`packages/common/src/vocabulary.ts`), because the realization table has no requiredness (finding D1 in [`application-model/FINDINGS.md`](../../application-model/FINDINGS.md)). Desktop: `required` in the manifest |
| How it is realized on the web | `packages/common/src/primitives.ts`, in the `WebPrimitive` shape of `@valancex/port-web` |
| How it is realized on the Desktop | Rust, drawn in `src/view.rs` of `valancex-port-desktop`, named by `vocabulary.json` |
| Layout of `column` and `row` on the web | A generated `core.css` (`packages/cli/src/emit.ts`) beside custom elements `vlx-column` and `vlx-row` |
| Accessible name, role, state | Per-prop mappings in each realization (`label` becomes `aria-label` on the web; AccessKit on the Desktop). No shared model |
| Documentation | Hand-written pages, for example [`docs/use/desktop-vocabulary.md`](../../use/desktop-vocabulary.md) |
| Editor hover and completion | `.valance/manifest.json`, derived |

### The copies have already drifted

The web file says its first seven entries are "the portable core (the same names, props, events and payloads as the Desktop PORT's vocabulary: a component written with only these runs on both targets)". Comparing that file with `vocabulary.json`:

| Name | Web props and events | Desktop props and events | Differs |
|---|---|---|---|
| `column`, `row` | none | none | no |
| `heading` | `level` | `level` | no |
| `text` | none | `id` | yes |
| `button` | `class`, `pressed`, `disabled`; `click` | `disabled`, `label`; `click` | yes |
| `checkbox` | `checked`, `label`; `change` | `checked`, `label`, `invalid`, `describedby`; `change` | yes |
| `textfield` | `value`, `placeholder`, `label`; `change`, `submit`, `cancel` | `value`, `placeholder`, `label`, `kind`, `invalid`, `describedby`; `change`, `submit`, `cancel`, `focus`, `blur` | yes |

Four of the seven differ, so "runs on both targets" is not true for a template that uses the Desktop's `invalid`, `describedby` or `kind`, or the web's `pressed`.

The same names also mean different things where the web table and the Desktop's content layer overlap: `image` takes `alt` on the web and `label` on the Desktop; the web's `list` is only unordered (`olist` is the ordered one) while the Desktop's `list` has an `ordered` prop; the web's `link` carries `class` and `current`. The web table has 32 entries and the Desktop vocabulary 17 plus 9 content names; only the seven above are meant to be shared.

The hand-kept documentation drifted too. `docs/use/desktop-vocabulary.md` lists seven components in its main table, while `vocabulary.json` declares seventeen, and it says the web has "26 tags", where the table now has 32.

None of this is carelessness. Each change was made for a good reason, in a different repository, at a different time. The structure invites it: nothing connects the copies, so nothing says when they disagree.

### Who is hurt now

- Whoever adds the next primitive edits several files in several repositories, and nothing tells them when they miss one.
- A template author cannot tell from any one place what is portable.
- A library author, later, would have no way to say "this component needs a primitive with these props and this behavior" that a tool can check.

## Prior art

Reliability: **P** is a primary source, read through a fetch agent; **S** is a secondary summary. See [prior art](../prior-art.md).

| Who | What they decided and why | Architecture or patch | Lesson here |
|---|---|---|---|
| React Spectrum (**P**, [v3 architecture RFC](https://raw.githubusercontent.com/adobe/react-spectrum/main/rfcs/2019-v3-architecture.md)) | Split each component into "platform agnostic state management, theme agnostic behavior, and themed components", with "the underlying implementation... swappable per platform" | Architecture, in use since 2019 | The meaning of a component (state and behavior) is separable from how a platform draws it. A specification of meaning is the same cut |
| Radix (**P**, [philosophy](https://raw.githubusercontent.com/radix-ui/primitives/main/philosophy.md)) | "A single component only renders a single DOM element"; "composition is preferred over configuration"; "zero presentational styles applied by default" | Architecture | One primitive, one node, no styling baked in. A specification can state this as a rule |
| WAI-ARIA Authoring Practices (**P**, [read me first](https://raw.githubusercontent.com/w3c/aria-practices/main/content/practices/read-me-first/read-me-first-practice.html)) | "A role is a promise" that the author also supplies the keyboard behavior; "ARIA roles do not cause browsers to provide keyboard behaviors" | Guidance | A role and its keyboard contract must be recorded together, or the role is an unkept promise |
| TC39 (**P**, [process](https://tc39.es/process-document/)) | A feature is final only with "two compatible implementations which pass the Test262 acceptance tests" | Process | Conformance tests are what make a specification real. Ours are the [identity and event vectors](https://github.com/ValanceX/Mesh/blob/main/examples/conformance/README.md) MESH already ships |
| Angular Material MDC migration (**S**) | Reported to have changed DOM and CSS class structure, with "style-related issues" for many consumers | A rewrite that broke consumers tied to internals | When structure is not a stated contract, everything built on it breaks when it moves |
| This repository | NATIVE-VOCABULARY chose names from eight toolkits' own sources and corrected three of its own first recommendations | Architecture-grade method | Method is not the gap. What is missing is a place where the result lives as data |

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 4, 5, 7 and 8 in particular:

- MESH stays free of a built-in primitive set. The format may live near MESH; the portable core is a Valance decision.
- A PORT decides how a target realizes a primitive. A specification states what a primitive means and must not name a DOM element or a widget.
- A primitive is portable only if two targets realize it. The specification therefore carries a status that includes "web only" or "desktop only".
- The specification is data. It holds no code.

## Design (a sketch, not accepted)

### Meaning and realization are separate documents

| Document | Says | Owned by |
|---|---|---|
| **Primitive specification** (`primitive-v1`) | What a primitive is: its role, props with types and requiredness, events with payloads, what it may contain, its keyboard contract, its states and parts, and its status | Valance (the portable core), or the author of a target-specific primitive |
| **Realization** | How one target draws it: web element, attributes, controlled slots, event mapping; or Desktop widget and accessibility mapping | Each PORT, as data it already half has (`WebPrimitive`, `vocabulary.json`) |

A tool joins them by name. A PORT that lacks a realization for a specification says so; it does not silently skip it.

### A specification, sketched

Reserved fields are filled by other bets and are shown here so the shape is visible. They are not decided.

```json
{
  "version": 1,
  "name": "checkbox",
  "status": "stable",
  "role": "checkbox",
  "summary": "A box that is ticked or not. The application owns the value.",
  "props": {
    "checked": { "type": { "kind": "boolean" }, "required": true, "controlled": true },
    "label": { "type": { "kind": "string" }, "required": false, "a11y": "name" },
    "invalid": { "type": { "kind": "boolean" }, "required": false, "a11y": "state" },
    "describedby": { "type": { "kind": "string" }, "required": false, "a11y": "relationship" }
  },
  "events": {
    "change": { "payload": { "kind": "boolean" }, "meaning": "The person changed the value; carries the new value." }
  },
  "content": "none",
  "keyboard": [{ "key": "Space", "raises": "change" }],
  "nameRule": "label",
  "states": ["focus-visible", "hovered", "pressed", "disabled", "checked", "invalid"],
  "parts": ["root", "indicator"]
}
```

`keyboard` and `nameRule` belong to [Bet 7](README.md), `states` and `parts` to [Bet 6](style-contract.md), and `describedby` as a string is a placeholder until Bet 7 decides how relationships are expressed. `controlled` states the contract the Web PORT already enforces (the slot holds exactly what the application last rendered) in the specification, where today it is only in a realization.

### What gets generated or checked

| Artifact | Today | From the specification |
|---|---|---|
| MESH manifest for a target | Derived on the web, hand-kept on the Desktop | Generated for both. The `optional` side table disappears because requiredness is stated once |
| Parity report between targets | Does not exist | Generated: for each shared name, which props, events and states each realization covers |
| Realization completeness | Discovered when a template fails | Checked: every specification has a realization or a declared gap per PORT |
| Documentation tables (`desktop-vocabulary.md` and its web counterpart) | Hand-written | Generated |
| Editor hover and completion | From the manifest | From the specification, adding role, name rule and keys |
| Conformance vectors | Per feature, hand-written | One generated set per primitive, plus hand-written edge cases |
| Gallery | Does not exist | Every primitive in every state, from data ([Bet 2](README.md)) |

### Alternatives considered

| Alternative | Why not (yet) |
|---|---|
| Make the Desktop `vocabulary.json` the shared format and have the web consume it | It is a MESH manifest: types and events, but no role, keyboard, state or part. It would need the same extensions this sketch adds, and it would leave realization-only facts (controlled slots) with nowhere to live |
| Put realization inside the specification | Breaks fixed point 4: a PORT decides how a target realizes meaning, and a specification that names a DOM element is a web specification |
| One shared TypeScript package of primitives | The PORT roadmap already rejected a shared package: a TypeScript package every PORT depends on would force a TypeScript shape on a Rust PORT. Data does not |
| Keep hand-kept tables and add a test that compares them | It finds drift but leaves four places to edit. It is a good first step (see the experiment) and a poor end state |

## Experiment

Each phase has an output that can be checked.

1. **Parity report, no new format.** Write a script that compares the web table with `vocabulary.json` and prints the table above. Make it a test that fails on an unlisted difference. This costs a day and turns the drift into a visible list. Output: the report, with each divergence marked *close* or *waive (reason)*.
2. **Describe the seven shared names** as `primitive-v1` documents, with a JSON Schema published beside `manifest-v1`.
3. **Generate the manifests** for both targets from those documents and compare them with the current ones after normalization. Output: identical, or a list of intended differences.
4. **Extend** to the remaining Desktop primitives (`radiogroup`, `radio`, `label`, the table family) and the content layer, and to the web-only tags marked `web only`.
5. **Generate the documentation tables** and delete the hand-written ones.

## Success

- Phases 3 and 5: today's manifests regenerate with no change to any existing test, except for divergences deliberately closed in phase 1.
- The parity report has no unexplained row.
- Adding a primitive means writing one specification and one realization per target, and the tooling says if one is missing.
- A template author can answer "is this portable?" from one generated page.

## Kill

- If expressing a fact needs code in the specification, the format is wrong. Stop and reconsider whether that fact belongs in a realization.
- If the generated manifests need hand edits to pass the existing tests, the specification does not carry enough.
- If the portable core shrinks to less than the seven names because divergences cannot be closed, then the portable core is not a real concept yet. Record that and fall back to per-target vocabularies with a parity report only.

## Breaks (allowed in the free window)

Closing the divergences changes templates and realizations. A proposal per row, to be decided in phase 1:

| Divergence | Proposal | Reason |
|---|---|---|
| `text.id` (Desktop only) | Owner to say what it is for; keep it in both or drop it | Not documented in the places I read |
| `button.label` (Desktop only) | Add to the web as `aria-label` | An accessible name; see [Bet 7](README.md) |
| `button.class` (web only) | Leaves the portable core; becomes the web's style hook | See [Bet 6](style-contract.md) |
| `button.pressed` (web only) | Split out a separate toggle primitive | A button that stays pressed is a boolean control; the toolkits NATIVE-VOCABULARY read call it `Toggle` (SwiftUI) or `Switch` (React Native) |
| `checkbox.invalid`, `describedby` (Desktop only) | Add to the web | `aria-invalid` and `aria-describedby` |
| `textfield.kind`, `invalid`, `describedby`, `focus`, `blur` (Desktop only) | Add to the web | `type`, the same two ARIA attributes, and the DOM events |
| `image.alt` or `label`; `list` and `olist` or `ordered` | Choose one set of names | The content layer already uses ARIA's names by decision D10 in [NATIVE-VOCABULARY](../../application-model/NATIVE-VOCABULARY.md) |

The web table's short names (`para`, `item`, `olist`, `quote`, `em`) versus the ARIA names the content layer uses is the same question, which the maintainer deferred on 2026-10-14. The free window is the cheapest time to settle it.

## Open questions

1. **Where does the format live, and where do the portable specifications live?** Options: (a) the schema beside `manifest-v1` in MESH, the portable core in Valance, realizations in each PORT; (b) a new repository for all three; (c) everything in Valance. (a) matches who owns what today; (b) is simplest to version together; (c) risks Valance becoming the owner of every target's meaning.
2. **How are web-only primitives named?** A status field on the specification, or a distinct namespace so a template cannot accidentally depend on one.
3. **Does a specification list the states and parts a theme may target, or does the style contract own them?** This brief reserves the fields; [Bet 6](style-contract.md) decides.
4. **How should relationships such as `describedby` be typed** so they cannot point at nothing? That needs identity-derived ids, which is [Bet 7](README.md).
5. **What is `text.id` for?** I could not find it described.
