# Release set: MESH 0.12.0, NEXUS 0.12.3, PORT Web 0.4.2, VALANCE 0.10.0

Prepared 2026-10-13. VALANCE 0.10.0 is published on npm (checked 2026-10-14: `latest`). The earlier set ([`release-set-2026-10.md`](./release-set-2026-10.md): MESH 0.10, PORT 0.4, NEXUS 0.12, VALANCE 0.7, and VALANCE 0.8 and 0.9 with MESH 0.11) is released.

| # | Repository | Version | Kind | Tag | Notes file |
|---|---|---|---|---|---|
| 1 | Mesh | 0.12.0 | minor: formatting and indentation of MPRX | `v0.12.0` | `docs/releases/v0.12.md` |
| 2 | Nexus | 0.12.3 | patch: the peer range accepts MESH 0.11 and 0.12 | `v0.12.3` | `docs/releases/v0.12.3.md` |
| 3 | Port | 0.4.2 | patch: the peer range accepts MESH 0.11 and 0.12 | `v0.4.2` | `docs/releases/v0.4.md` (section v0.4.2) |
| 4 | Valance | 0.10.0 | minor: supports MESH 0.11 and 0.12 | `v0.10.0` | `docs/releases/v0.10.md` |

NEXUS and PORT Web are patches because they change only an install range (and tests); VALANCE is the minor the project asked for: its peer range is a new range, and its tooling grew. The order matters: NEXUS 0.12.2 and PORT Web 0.4.1, which are on the registry today, name MESH `^0.10.0` and `^0.6.0 || … || ^0.10.0`, so an application on MESH 0.11 (VALANCE 0.9) gets a peer warning until 2 and 3 are published.

Every repository's `release.yml` publishes on a pushed `v*` tag, with provenance, using the `NPM_ACCESS_TOKEN` secret (an npm granular token for the `@valancex` organisation; it expires, so check it first). A manual run of the workflow without `publish` is a dry run of everything but the publishing.

## Before the first tag

- The pull requests are merged to each default branch: Mesh and Valance (the feature work and this preparation), Nexus and Port (this preparation). The release workflow runs the repository's CI on the tagged commit.
- Each repository's tag is the merge commit of its pull request.

## 1. MESH 0.12.0

1. Tag `v0.12.0`. The workflow builds the five `mesh-lsp` binaries, the WebAssembly modules and the npm packages (`@valancex/mesh-compiler`, `mesh-runtime`, `mesh-lsp` and its five platform packages) and publishes them with the GitHub release.
2. Check on the registry: `@valancex/mesh-lsp@0.12.0` starts and answers `textDocument/formatting` (an `initialize` result with `documentFormattingProvider`); `@valancex/mesh-runtime@0.12.0` and `@valancex/mesh-compiler@0.12.0` install in an empty project.
3. Mark the "prepared" status lines "released" (README, `docs/README.md`, the specification's status line, `docs/releases/v0.12.md`), as was done for 0.11.

## 2. NEXUS 0.12.3

1. No lockfile change is needed: the development dependencies stay on MESH 0.11 (`^0.11.0`), which the lockfile already resolves. `pnpm install --frozen-lockfile && pnpm typecheck && pnpm test && pnpm build` pass; tag `v0.12.3`.
2. Check: `@valancex/nexus@0.12.3` installs next to `@valancex/mesh-runtime@0.11.0` and `0.12.0` with no peer warning.
3. Mark the notes and README "released".

## 3. PORT Web 0.4.2

1. No lockfile change is needed. `pnpm -r test` passes (333 and 28; the integration test builds against a MESH checkout, see its header); tag `v0.4.2`.
2. Check: `@valancex/port-web@0.4.2` installs next to MESH 0.11 and 0.12 with no peer warning.
3. Mark the notes, changelog and README "released".

## 4. VALANCE 0.10.0

1. After 1 to 3 are on the registry, refresh the lockfile at the repository root for the new NEXUS and PORT Web (`pnpm update @valancex/nexus @valancex/port-web`; `pnpm install`), and commit it. Nothing in the package source changes. `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` must name any version newer than the age gate.
2. `examples/docs-verifier`: its `package.json` names VALANCE 0.10.0, NEXUS and PORT Web; use `node scripts/with-local-packs.mjs` against packs of the prepared branches until they are published, then `pnpm install`, `pnpm test`, `pnpm test:smoke`.
3. `pnpm build && pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`, `pnpm test:browser`, `pnpm test:examples`, and the extension's suites pass; tag `v0.10.0`.
4. Check: a clean project installs `@valancex/valance@0.10.0` with the registry's NEXUS 0.12.3, MESH 0.12 and PORT Web 0.4.2 and resolves one copy of each (`npm ls @valancex/nexus @valancex/mesh-runtime effect`).
5. Mark the notes "released".

`@valancex/common` and `@valancex/cli` (the `vlx` command) are not in this set. They are prepared as [`cli-v0.1`](./cli-v0.1.md), released by their own tag after this set: both depend on `@valancex/valance@^0.10.0`, which must be on the registry first.

## Gates that were run on the prepared set

MESH: `cargo test --workspace` (934 tests), clippy, fmt, `cargo doc` with warnings as errors, the editor's grammar and indentation tests, and the JavaScript package tests with the WebAssembly rebuilt at 0.12.0 (the browser tests need Playwright's browsers, which CI installs). NEXUS: typecheck and 513 tests. PORT: 333 package tests and 28 integration tests against the MESH 0.12 build. VALANCE: see `docs/releases/v0.10.md`.

## What changes for users, in one place

- MESH 0.12: `mesh-lsp` formats and indents MPRX (Format Document, Format Selection, indentation after Enter); only whitespace between tokens changes.
- NEXUS 0.12.3 and PORT Web 0.4.2: the MESH runtime peer range accepts 0.11 and 0.12, so an application on either has one runtime.
- VALANCE 0.10: supports MESH 0.11 and 0.12; formatted and linted with OXC; the (private) `vlx` tooling gains a global command, `vlx init`, and a terminal interface.
