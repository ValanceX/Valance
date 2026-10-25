# Glossary

Words that mean more than one thing across Valance, Nexus, Mesh and Port. Each entry gives the meaning in each repo, where it is defined, and the name to use **going forward**. Renames are deferred to 1.0 unless an entry says otherwise; until then the code keeps its names and the docs use the qualifier shown.

Paths are relative to the repo named (`valance/`, `nexus/`, `mesh/`, `port/`), all under the ValanceX organization.

## `scope`

Five senses. In prose, always qualify.

| Sense | Where | Meaning |
|---|---|---|
| view scope | `valance/packages/valance/src/web-manifest.ts` (a view's `scope` Schema and function) | Every name a view's template may read. |
| layout scope | `valance/packages/common/src/app.ts` (`scopeSchema`) | The names the layout is compiled against: the framework's names plus the author's state fields. |
| redaction scope | `valance/docs/use/replay.md` (`record.redact.scope`) | Paths in state kept out of the replay log. |
| Effect `Scope` | `effect` package; Valance `start` needs one | The lifetime resources and fibers are tied to. |
| host `scope` option | `nexus/src/mesh/index.ts` (`Mesh.host`) | The selector handle the host renders from, already shaped to the manifest. |

Canonical: "view scope", "layout scope", "redaction paths" (for the replay option), "Effect `Scope`", "host scope". The option and field names stay until 1.0.

## `start`

| Where | Meaning |
|---|---|
| `Valance.start` | Builds and runs an application inside a `Scope`; returns a handle. |
| `define.start` key (`valance/packages/valance/src/index.ts`) | Names the command run once at start-time, admitted like any command. |
| `History.start` (`valance/packages/router/src/history.ts`) | Constructs a history holding one entry. |

Canonical: `Valance.start` is "start". Call the `define` key "the start-time command" and the router function "`History.start`". Router rename (e.g. `History.of`) is a 1.0 candidate.

## `Host`

| Where | Meaning |
|---|---|
| `Host<S, E>` (`valance/packages/valance/src/web.ts`) | What `Web.run` resolves to: the running page (handle, `mounted`). |
| `HostOptions` (`valance/packages/valance/src/native.ts`) | The native host's options. |
| `Mesh.host` (`nexus/src/mesh/index.ts`) | A render-and-dispatch adapter pairing a Mesh program with Nexus commands. |

Canonical: "host" means the party that renders a Mesh program and dispatches its events. For Valance's `Host<S, E>` say "the running page" or "web host" where confusion is possible. No code rename planned before 1.0.

## Identity fields: `id`, `name`, `_tag`, `code`

| Field | Where | Meaning |
|---|---|---|
| `name` | `nexus/src/command/index.ts` | A command's name. |
| `id` | `nexus/src/capability/index.ts` | A capability's identifier. |
| `_tag` | `nexus/src/event/index.ts`; Valance typed failures | Discriminant of an event; and of a typed failure. |
| `code` | `valance/packages/valance/src/errors.ts` (`ValanceError`); Nexus `Runtime.Refusal`; Mesh and Port diagnostics | Stable machine-readable code of a refusal, defect or diagnostic. Never renamed or reused. |

Rule: `_tag` for values you match on (events, typed failures); `code` for refusals, defects and diagnostics; `name`/`id` name a definition. Canonical going forward is these roles, with no code change before 1.0.

## unit

| Where | Meaning |
|---|---|
| Nexus (`nexus/docs/semantic.md`) | The execution unit: a part of an application NEXUS runs as a whole (the start unit, an admitted unit), which owns requirements. |
| Mesh (`mesh/docs/manual/runtime.md`, "Units") and Valance (`define`'s `units`) | Per-occurrence component state and commands, such as whether a disclosure is open. |

Canonical: "execution unit" for Nexus, "component unit" for the Mesh/Valance sense. Code names stay until 1.0.

## occurrence and instance

| Term | Where | Meaning |
|---|---|---|
| instance, component sense | `mesh/docs/MPRX-SPEC.md` section 9.1 | An element of a manifest component. |
| instance, repeat key | `mesh/docs/MPRX-SPEC.md` section 9.10.2 | The declared key of one item at a repeated site. |
| instance, unit sense | `mesh/docs/manual/runtime.md` (`render.instances`, `raise(render, instance, ...)`, intent `instance`) | One occurrence of a component that has a unit. |
| occurrence | `mesh/docs/MPRX-SPEC.md` section 9.10.2 | A rendered copy of a site, identified by its path of (site, instance) steps. |

Canonical: **occurrence** for the unit sense, **instance** only for a repeat key and for the spec section 9.1 element sense (qualify: "component element"). The refinements doc (C-4) plans renaming the unit sense of `instance` to `occurrence`; this is **not done yet**, so `render.instances` and intent `instance` still exist. Code and schema rename is planned as one coordinated set (Mesh 0.18, then Nexus and Valance), per refinements C-4 (section 5): rename now, not deferred to 1.0.

## `Render`

`mesh/packages/mesh-runtime/src/engine.ts`: a class holding one render's frozen tree and the snapshot dispatch evaluates against. It is an entity named after a process. Canonical meaning: "a render" is the result of rendering; the class stays `Render`. Renaming (e.g. `Rendering`) is deferred to 1.0.

## Tier 1 / 2 / 3

North star sense only (`valance/docs/DESIGN_NORTH_STAR.md`): Tier 1 minimal zero-config; Tier 2 opt-in tuning; Tier 3 explicit constrained escape hatch. These are layers of an API's disclosure.

Different scheme: Mesh `mesh/docs/manual/stability.md` and Valance `valance/docs/stability.md` use "tier" for Stable/Unreleased/Provisional/Internal. Call those **stability levels**. Doc wording that says "stability tier" is to be changed to "stability level" when those pages are next edited; the north-star tiers keep the word "tier".
