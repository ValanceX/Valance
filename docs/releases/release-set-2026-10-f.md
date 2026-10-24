# Release set: VALANCE 0.14.0 (`@valancex/valance`, `@valancex/style`, `@valancex/router`, `@valancex/common`, `@valancex/cli`)

Prepared 2026-10-24. Nothing is tagged or published. The earlier set ([`release-set-2026-10-e.md`](./release-set-2026-10-e.md): VALANCE 0.13.0) is released. **Everything this set needs is already released:** MESH 0.17.0 (nine packages), NEXUS 0.16.0 and PORT 0.14.0 (`@valancex/port-web`, `@valancex/port-desktop-vocabulary`; the Desktop crate stays 0.6.0). Nothing in MESH, NEXUS or PORT changes.

| # | What | Kind | Tag | Notes file |
|---|---|---|---|---|
| 1 | `@valancex/valance`, `@valancex/style`, `@valancex/router`, `@valancex/common`, `@valancex/cli` 0.14.0 | minor: units and forms, themes (`@valancex/style`, first published), layers, replay and recording, budgets and the start-up path, generated UI, renames | `v0.14.0` | `docs/releases/v0.14.md` |

The VALANCE extension for VS Code (`editors/vscode`) is not part of this set; it is released on its own tag (`vscode-v<version>`) and nothing in it changed for this release.

## What differs from the 0.13 set

* **Five packages, not four.** `@valancex/style` is new on npm (it was versioned 0.13.0 in the repository and never published); the token must be allowed to create a package under `@valancex`.
* **Publish order is by dependency:** `valance`, `style`, `router`, `common`, `cli`. `common` depends on `router` and `cli` on `common` and `style`. The 0.13 workflow published the router last, and `@valancex/router` 0.13.1 had to be published by hand to correct its peer range ([the notes](./v0.14.md#valancexrouter-0131)).
* **The release workflow now has two jobs that have never run on a runner:** `conformance` (eleven verifiers, `--check --require`) and `budgets` (the tree and the previous release measured, held to `packages/cli/src/budgets.json`). The first run is the proof of decision R17. They were run here with the same commands (`docs/direction/implementation.md`, the release status paragraph): what could not be run is listed there.

## Before tagging

1. Merge the release branch; CI is green on it.
2. `npm view @valancex/valance@0.14.0 version` is a 404 for each of the five (the workflow refuses a version already on npm when publishing).
3. Run the workflow as a dry run from the branch (Actions > Release > Run workflow, `publish` unticked) and read `conformance` and `budgets`: a failure there is a defect to fix before the tag, not a reason to skip them.
4. The npm token is current and may create `@valancex/style`.

## After the tag

1. `npm view @valancex/valance@0.14.0 @valancex/style@0.14.0 @valancex/router@0.14.0 @valancex/common@0.14.0 @valancex/cli@0.14.0 version`.
2. In an empty directory: `npm install -g @valancex/cli && vlx init demo --web --yes && cd demo && npm run build`; the project passes `vlx check`.
3. Mark the notes "released" (`docs/releases/v0.14.md`, this file), set `PUBLISHED` in `scripts/measure-footprint.mjs` to 0.14.0, and say in `docs/direction/implementation.md` what the runner's dry run showed.
