# Release set: VALANCE 0.12.0 (`@valancex/valance`, `@valancex/common`, `@valancex/cli`, `@valancex/router`)

Prepared 2026-10-14; **released** (tag `v0.12.0`, on npm 2026-10-14). The next set is [`release-set-2026-10-e.md`](./release-set-2026-10-e.md). The earlier set ([`release-set-2026-10-c.md`](./release-set-2026-10-c.md): VALANCE 0.11.0 with `common` and `cli`) is released. This set needs none of NEXUS, PORT or MESH to change.

| # | Repository | Packages | Kind | Tag | Notes file |
|---|---|---|---|---|---|
| 1 | Valance | `@valancex/valance` 0.12.0, `@valancex/common` 0.12.0, `@valancex/cli` 0.12.0, `@valancex/router` 0.12.0 | minor: one new package (Provisional), two route-table seams and three small security changes to the boundary | `v0.12.0` | `docs/releases/v0.12.md` |

One tag, one workflow ([`release.yml`](../../.github/workflows/release.yml)): all of CI on the tagged commit, the four packages packed, then published to npm with provenance **in dependency order** (`valance`, `common`, `cli`, `router`), and a GitHub release with the four tarballs. The workflow refuses to run if the four versions differ, if the tag is not `v` plus that version, if a packed manifest still has a `workspace:` range, or if a version is already on npm. It uses the `NPM_ACCESS_TOKEN` secret. A manual run of the workflow without `publish` is a dry run of everything but the publishing.

## After the tag

1. Check on the registry: `npm view @valancex/valance@0.12.0 @valancex/common@0.12.0 @valancex/cli@0.12.0 @valancex/router@0.12.0 version`.
2. In an empty directory: `npm install -g @valancex/cli && vlx init demo --web --yes && cd demo && npm run build`; the project passes `vlx check` and `tsc --noEmit`.
3. Mark the notes "released" (`docs/releases/v0.12.md`, this file, the Provisional rows in `docs/stability.md`).
