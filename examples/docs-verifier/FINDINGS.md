# Findings (friction log) and decisions

Principle: the user writes the application, never system config (JSON, TS or JS) unless a custom config or plugin is genuinely needed. Resources are spent only on what changed.

| # | Finding | Verdict | Status |
|---|---------|---------|--------|
| F1 | Composites were not in Valance's derived manifest; `views/composites.json` was hand-written. | Gap | **Fixed (Mesh dev).** `compileProgram` infers each composite's contract from the templates; the verifier has no composite config. |
| F2 | `mesh-slot` had to be declared in the manifest by hand. | Gap | **Fixed (Mesh dev).** Reserved tags (`mesh-slot`, `mesh-fill`, `mesh-switch`, `mesh-case`, `mesh-default`, `mesh-if`, `mesh-each`) are declared by the toolchain when a template uses them. |
| F3 | Inline marks (strong, code, link). | Model gap, not a feature gap: expressed as `spans` rendered by `runs`/`inline` composites. Cost: every run is a wrapper element, because a composite has exactly one root element and a `mesh-if` body must be an element. | Open: fragment roots. |
| F4 | Lists are flattened to `item` blocks. | Partly a gap. A fixed-depth list is expressible (`mesh-each` inside `mesh-each`). Arbitrary nesting is not: composites cannot recurse. | Open: bounded recursion. |
| F5 | Valance 0.6.0 redraws the whole tree on every change. | Gap | Open: Valance adopts `update`/`patch` once Mesh and Port release. |
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

Still to build: fragment roots (F3), bounded recursion (F4), and Valance on `update`/`patch` (F5).
