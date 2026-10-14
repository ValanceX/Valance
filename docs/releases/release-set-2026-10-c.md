# Release set: VALANCE 0.11.0 (`@valancex/valance`, `@valancex/common`, `@valancex/cli`)

Prepared 2026-10-14. Nothing is tagged or published. The earlier set ([`release-set-2026-10-b.md`](./release-set-2026-10-b.md): MESH 0.12.0, NEXUS 0.12.3, PORT Web 0.4.2, VALANCE 0.10.0) is released; this set needs none of NEXUS, PORT or MESH to change (the new packages name MESH `^0.11.0` and PORT Web `^0.4.0`, which are on the registry).

| # | Repository | Packages | Kind | Tag | Notes file |
|---|---|---|---|---|---|
| 1 | Valance | `@valancex/valance` 0.11.0, `@valancex/common` 0.11.0, `@valancex/cli` 0.11.0 | minor: two new packages (Provisional) and three small security changes to the boundary | `v0.11.0` | `docs/releases/v0.11.md` |

One tag, one workflow ([`release.yml`](../../.github/workflows/release.yml)): all of CI on the tagged commit, the three packages packed, then published to npm with provenance **in dependency order** (`valance`, `common`, `cli`), and a GitHub release with the three tarballs. The workflow refuses to run if the three versions differ, if the tag is not `v` plus that version, if a packed manifest still has a `workspace:` range, or if a version is already on npm. It uses the `NPM_ACCESS_TOKEN` secret (an npm granular token for the `@valancex` organisation; it expires, so check it first). A manual run of the workflow without `publish` is a dry run of everything but the publishing.

## Before the tag

- The branch is merged to the default branch; the tag is its merge commit.
- `pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`, `pnpm test:examples`, and the extension's suites (`pnpm test` in `editors/vscode`; `pnpm test:host` opens a window) pass.
- A dry run of the workflow (a manual run without `publish`) is green.
- `examples/docs-verifier` still names `@valancex/valance` 0.10.0 exactly and is unaffected; move it when it needs the new packages.

## After the tag

1. Check on the registry: `npm view @valancex/valance@0.11.0 @valancex/common@0.11.0 @valancex/cli@0.11.0 version`.
2. In an empty directory: `npm install -g @valancex/cli && vlx init demo --web --yes && cd demo && npm run build`. The new project passes `vlx check` and `tsc --noEmit`, and `npm ls @valancex/valance @valancex/mesh-runtime effect` shows one copy of each.
3. Mark the notes "released" (`docs/releases/v0.11.md`, this file, the Provisional rows in `docs/stability.md`).

## What changes for users, in one place

- A new way in: `npm install -g @valancex/cli`, then `vlx init`, `vlx dev`, `vlx build`, `vlx generate`.
- `@valancex/valance` changes in three small security ways (plain-text titles, a redacted start-failure log with an opt-in sink, a title not rewritten when unchanged). An application that embeds it directly changes its version, and anything that read the cause from the log.
