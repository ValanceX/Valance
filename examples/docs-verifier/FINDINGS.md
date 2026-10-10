# Findings (friction log) and decisions

Principle: the user writes the application, never system config (JSON, TS or JS) unless a custom config or plugin is genuinely needed. Resources are spent only on what changed.

| # | Finding | Verdict | Status |
|---|---------|---------|--------|
| F1 | Composites were not in Valance's derived manifest; `views/composites.json` was hand-written. | Gap | **Fixed (Mesh dev).** `compileProgram` infers each composite's contract from the templates; the verifier has no composite config. |
| F2 | `mesh-slot` had to be declared in the manifest by hand. | Gap | **Fixed (Mesh dev).** Reserved tags (`mesh-slot`, `mesh-fill`, `mesh-switch`, `mesh-case`, `mesh-default`, `mesh-if`, `mesh-each`) are declared by the toolchain when a template uses them. |
| F3 | Inline marks (strong, code, link) cost a wrapper element per run. | Gap (the principle: MESH makes no node a template did not write) | **Fixed (Mesh dev).** `mesh-fragment`: `runs` and `inline` are fragments, so a heading's text and marks are its own children, and a block is no `section`. The page holds only elements the templates name, which `test/site.test.ts` checks. |
| F4 | Lists are flattened to `item` blocks. | Partly a gap. A fixed-depth list is expressible (`mesh-each` inside `mesh-each`). Arbitrary nesting is not: composites cannot recurse. | Open: bounded recursion. |
| F5 | Valance 0.6.0 redraws the whole tree on every change. | Gap | **Fixed (Valance 0.7 prepared).** A later render of a view is MESH's `update` of the previous one, applied with PORT's `patch`; the smoke test compares the patched page with the server's HTML for the same URL. |
| F6 | Kind dispatch needed seven sibling `mesh-if`s. | Gap | **Fixed (Mesh dev).** `block.mprx` is one `mesh-switch`. |
| F7 | One unnamed slot per template. | Gap | **Fixed (Mesh dev).** `layout.mprx` has a `nav` slot and the default; `page.mprx` fills `nav`. |
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

## What was built for these

1. **Inferred contracts (F1/F2).** The compiler reads each composite's props from the arguments its occurrences pass and its events from the handlers it forwards, callers first for props and callees first for event payloads. A manifest entry, when written, wins. Reserved tags are declared when used.
2. **`mesh-switch` (F6).** Written by the compiler as the `mesh-if`s it stands for, so the runtime, identity and updates are unchanged.
3. **Named slots (F7).** `mesh-slot name` and `mesh-fill slot`; a named slot's identity step carries its name, so no existing key changes.

4. **Valance on `update`/`patch` (F5).** `Nexus.Mesh.update` (NEXUS 0.12) and an optional `Target.patch` (VALANCE 0.7); a target without `patch` is given `update` as before.

5. **Fragments (F3).** `mesh-fragment` places content without a node, as a composite's root, a case body, a conditional alternative or a repeat item; nothing wraps content on the author's behalf.
6. **Shutdown.** `Web.run` takes `shutdown: { grace }`; NEXUS 0.12 settles the work it tracks (grace, then interrupt) before releasing resources.

Still to build: bounded recursion (F4).

## Found by validating the prepared set (the packs, in a clean project and in this repository)

| # | Finding | Status |
|---|---------|--------|
| V1 | `WebPort` gained members (`patch`, `inspect`, `[Symbol.dispose]`), so code that implements the interface stops typechecking; VALANCE's own tracer had about thirty wrappers typed `TargetFactory<WebPort>`. | Named in the PORT 0.4 and VALANCE 0.7 notes; the tracer is typed as the contract it needs. |
| V2 | Tripwires that pinned the old model (every commit renders in full; `Web.run` without `init()` rejects) failed, as they should. | Updated: they count and gate `update` as well as `render`, and the uninitialized-runtime test now expects the new message and code. |
| V3 | A stale Vite dependency cache after swapping packages made three real-page browser tests fail once. | Environment, not a defect; delete `node_modules/.vite`. |
| V4 | NEXUS's lockfile test needs the lockfile to name the installed runtime, which can only be written once MESH 0.10 is published. | Open until the set is published, in order. |
| V5 | MESH's two browser test files hang here unless `MESH_CHROMIUM=/opt/pw-browsers/chromium` is set; with it they pass (1 and 5 tests). | Environment. |
| V6 | Text runs on either side of a conditional or repeat that chose nothing were two runs, not one (the tree's runs are maximal, so the server's single text node could not be matched on the client). | Fixed in MESH: runs are merged whatever made them adjacent. |
| V7 | The substrate route `Application.shutdown(running.nexus)` used to release a resource under an admitted command; the tracer pinned that as characterised behavior. | NEXUS 0.12 interrupts the command first; the two tripwires now pin that. |
| V8 | `shutdown.grace` of 0 must not wait even a turn in VALANCE (a command admitted in the step the close began is interrupted before it runs), while NEXUS waits one turn so subscription consumers end with the bus. | Both pinned by tests. |
