# Findings (friction log) and decisions

Principle: the user writes the application, never system config (JSON, TS or JS) unless a custom config or plugin is genuinely needed. Resources are spent only on what changed.

| # | Finding | Verdict | Direction |
|---|---------|---------|-----------|
| F1 | Composites are not in Valance's derived manifest; `views/composites.json` is hand-written. | **Gap** | Derive composite entries from the templates (below). |
| F2 | `mesh-slot` must be declared in the manifest by hand. | **Gap** | Reserved structural tag, like `mesh-if`: declared by the toolchain, never by the user. |
| F3 | Inline marks (strong, code, link). | **Model gap, not a feature gap.** Expressed here as `spans` rendered by `runs`/`inline` composites (see `test/site.test.ts`). Cost: every run is a wrapper element, because a composite has exactly one root element and a `mesh-if` body must be an element (no text or fragment). | Consider a fragment root (below). |
| F4 | Lists are flattened to `item` blocks. | **Partly a gap.** A fixed-depth list is expressible (`mesh-each` inside `mesh-each`). Arbitrary nesting is not: composites cannot recurse. | Decide on bounded recursion (below). |
| F5 | Valance 0.6.0 redraws the whole tree on every change. | **Gap** | Use `update`/`patch` (below). |
| F6 | Kind dispatch needs seven sibling `mesh-if`s. | **Gap** | `mesh-switch` (below). |
| F7 | One unnamed slot per template. | **Gap** | Named slots (below). |
| F8 | Copy-to-clipboard needs a platform capability. | Open | Port capability design. |
| F9 | No on-page TOC (no anchor or scroll support). | Open | Port capability design. |
| F10 | No search in the slice. | App work | Later slice. |
| F11 | Dev checkouts need sibling `link:` overrides. | Tooling | Goes away once Mesh and Port release. |

Learned while probing F3: `mesh-if` already takes a second element child as its else branch, and `mesh-if` may not be directly nested, so an else-if chain cannot be written.

## How other frameworks solve these

**Dispatch on a value (F6).** Vue: `v-if` / `v-else-if` / `v-else`. Svelte: `{#if}{:else if}{:else}`. Angular 17+: `@if` / `@else if` and `@switch` / `@case` / `@default`. Solid: `<Switch><Match when>` with a `fallback`. React/JSX: a JS `switch` or a map of components. Common shape: one construct, ordered branches, the first match wins, an optional default, and it is a single node for identity.

**Slots (F7).** Web components and Vue: named slots (`<slot name="header">`, filled by `<template #header>`). Angular: `<ng-content select="[header]">`. Svelte 5: snippets passed as props. React: any prop can be a node. Common shape: a caller fills named regions; an unnamed region is the default; content is written in the caller's scope.

**Fragments (F3).** React `<>…</>`, Vue 3 multi-root, Svelte (any number of nodes), Angular (`ng-container`). A component may return several nodes without a wrapper.

**Recursion (F4).** Every framework lets a component reference itself; the data is finite, so rendering terminates.

## Proposals (not built yet)

1. **F1/F2, no hand-written config.** The toolchain infers each composite's contract from its template and its occurrences, and checks it with the rules Mesh already has:
   - props are the names the template reads that no `mesh-each` binds; their types come from the arguments at the occurrences (all occurrences must agree);
   - events are the handler names that are not commands, with the payload type from the command called at the occurrence;
   - `mesh-slot` and `mesh-if`/`mesh-each` are declared by the toolchain;
   - an explicit declaration stays possible for a custom contract, and overrides inference.
   Open question: do this in the Rust compiler (one source of truth, usable from every host) or in a JS pass. Recommendation: the compiler, as an opt-in `infer` mode over `compileProgram`, so Valance passes templates only.
2. **F5, only redraw what changes.** Valance calls Mesh `update`/`updateChanges` and Port `patch` instead of redrawing. This needs a Mesh and Port release first (Valance builds against released packages).
3. **F6, `mesh-switch`.** `<mesh-switch><mesh-case when=…>…</mesh-case>…<mesh-default>…</mesh-default></mesh-switch>`: ordered, first match wins, one node for identity.
4. **F7, named slots.** `<mesh-slot name="header" />` in the composite, `<mesh-fill slot="header">…</mesh-fill>` in the occurrence; the unnamed slot stays the default. Keys gain the slot name.
5. **F3, fragment root.** Allow a composite template or `mesh-if` body to be text or several nodes. This is the most invasive change (identity and render shape), so it goes last.
