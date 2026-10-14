# `vlx` release notes

`@valancex/cli` (the `vlx` command) and `@valancex/common` (what an application's `src/main.ts` imports), released together under one tag, `cli-v0.1.0` ([`release-cli.yml`](../../.github/workflows/release-cli.yml)). Both are **Provisional** (see [`stability.md`](../stability.md)): before 1.0 a minor may change them, with the change named here.

## 0.1.0

*Prepared 2026-10-14 (nothing tagged or published).* The first release of both. Release order: `@valancex/valance@0.10.0` first ([release set](./release-set-2026-10-b.md)), since both depend on `^0.10.0`; the workflow refuses to publish before it is on the registry.

### What it is

`vlx` is the way into Valance: it makes an application (`vlx init`), serves it as you edit (`vlx dev`), builds the static site (`vlx build`), checks it (`vlx check`) and adds to it (`vlx generate`). An application is Markdown content, a layout, components and styles; the project writes no compiler step, manifest, server, hydration script or bundler configuration.

### `@valancex/common`

The authoring API moved out of the command-line package. An application's `src/main.ts` imports `defineApp`, `component` and `field` from `@valancex/common`, which has no Node, bundler or terminal dependency, and `Schema` from `effect`. `@valancex/cli` no longer exports `.`. A new project depends on `@valancex/common` and `effect`, with `@valancex/cli` as a dev dependency.

### Changes in the application model

- **`components` replaces `uses`.** A component is registered once, in `defineApp({ components: [...] })`. Which components a template uses is read from the template (`src/outline.ts`), so the per-component `uses` list, and its two errors (`component-undeclared`, `component-unused`), are gone. A file under `src/` that is not registered is still `template-unused`. A registered component that no template writes yet is not part of the program, and is not an error.
- **`Schema` is not re-exported.** Import it from `effect`.
- **Slots** (`<mesh-slot />`, `<mesh-slot name="…" />`, `<mesh-fill slot="…">`) work in components and are documented in the CLI guide.

### New commands

- `vlx generate page <path>` and `vlx generate component <name>` (alias `g`): add a Markdown page, or a component (`src/<name>.mprx`, `src/<name>.ts`) imported and registered in `src/main.ts`. Nothing is overwritten.
- `vlx help [command]`, and `--help` for every command.
- `vlx init` now writes a `tsconfig.json` (it documented one and did not write it), so typed template imports and `typecheck` work in a new project.

### Publication

- Both packages are public with provenance; `@valancex/cli` ships `dist`, `bin`, `views`, `schemas` and `templates`, `@valancex/common` ships `dist` and `types`.
- `vlx init` writes `^0.1.0` ranges. Run from a clone of the repository (where the dependencies are `workspace:`), it writes paths to the clone instead, as before.
- `@valancex/cli` depends on `@valancex/mesh-compiler` and `@valancex/mesh-runtime` `^0.11.0`, and on `@valancex/valance@^0.10.0`, whose peer range also admits MESH 0.12; moving the CLI to MESH 0.12 is a later release.

### Upgrading from the workspace version

Replace `import { component, defineApp, field, Schema } from "@valancex/cli"` with `import { component, defineApp, field } from "@valancex/common"` and `import { Schema } from "effect"`; list every component in `components` and delete each `uses`; add `@valancex/common` and `effect` to `dependencies`.
