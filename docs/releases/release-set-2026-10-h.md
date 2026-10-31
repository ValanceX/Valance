# Release set: MESH 0.18.0, NEXUS 0.17.0, PORT 0.15.0, VALANCE 0.16.0

Prepared 2026-10-31. Nothing is tagged or published. The earlier set ([`release-set-2026-10-g.md`](./release-set-2026-10-g.md): VALANCE 0.15.0) is released. **Release in this order:** each repository needs the one before it on npm.

| # | Repository | Version | Kind | Tag | Notes file |
|---|---|---|---|---|---|
| 1 | Mesh | 0.18.0 (b6b54a8 and 118e341; PR open) | minor: the context channel, occurrence names | `v0.18.0` | `docs/releases/v0.18.md` |
| 2 | Nexus | 0.17.0 (caf5928) | minor: `context` on the MESH adapter; the peer range admits MESH 0.18 | `v0.17.0` | `docs/releases/v0.17.md` |
| 3 | Port | 0.15.0 (cce902d): `@valancex/port-web` and `@valancex/port-desktop-vocabulary` | minor: the native hatch, `composeWebPort` with context, opt-in `./vocabulary`; the peer range admits MESH 0.18 | `v0.15.0` | `docs/releases/v0.15.md` |
| 4 | Valance | 0.16.0: `@valancex/valance`, `@valancex/style`, `@valancex/router`, `@valancex/common`, `@valancex/cli` | minor: the context channel, `Web.run`'s `native` and `target`, named binding, `Redacted` state fields, `define` without `view` | `v0.16.0` | `docs/releases/v0.16.md` |

The VS Code extension is not part of this set and nothing in it changed.

## What differs from the 0.15 set

* **Four repositories.** The 0.15 set needed only VALANCE. Here VALANCE 0.16 needs `@valancex/mesh-runtime` and `@valancex/mesh-compiler` `^0.18.0`, `@valancex/nexus` `^0.17.0` and `@valancex/port-web` `^0.15.0`, so the other three come first.
* **Local packs.** The branch installs MESH, NEXUS and PORT Web from `local-packs/` through `pnpm-workspace.yaml` overrides, in five commits marked "DO NOT MERGE BEFORE THE RELEASES". The MESH packs are from b6b54a8 (118e341 changed only the generated parser).

## Before tagging VALANCE

1. MESH 0.18.0, NEXUS 0.17.0 and PORT 0.15.0 are on npm (`npm view` each).
2. Revert the five pack commits, newest first; `pnpm install` writes the registry lockfile; build, typecheck, lint and `pnpm -r test` pass.
3. `npm view @valancex/valance@0.16.0 version` is a 404 for each of the five.
4. `PORT_REF` in `.github/workflows/release.yml` is `v0.15.0`.
5. Run the workflow as a dry run from the branch (`publish` unticked) and read `conformance` and `budgets`.

## After the tag

1. `npm view` each of the five at 0.16.0.
2. Make the two repositories from `reference/` (`pnpm install` in `components/` writes its registry lockfile) and run the ecosystem CI with `tag: 0.16.0`.
3. Mark the notes "released"; set `PUBLISHED` in `scripts/measure-footprint.mjs` to 0.16.0.
