# Release set: MESH 0.10.0, PORT 0.4.0, NEXUS 0.12.0, VALANCE 0.7.0

> **Patch set (2026-10-10, prepared):** `@valancex/port-web` 0.4.1, `@valancex/nexus` 0.12.1 and `@valancex/valance` 0.7.1 are independent of each other's code; publish Port and Nexus first (Valance's CI needs nothing new, its peer ranges already admit them), then Valance. MESH has no release in this set.

Prepared 2026-10-10. Nothing is tagged or published. The four releases depend on each other, so they go out **in this order**, and each later one needs a step after the one before it is on the registry.

| # | Repository | Version | Tag | Notes file | Lockfile on the prepared branch |
|---|---|---|---|---|---|
| 1 | Mesh | 0.10.0 | `v0.10.0` | `docs/releases/v0.10.md` | consistent (`npm ci` passes) |
| 2 | Port | 0.4.0 | `v0.4.0` | `docs/releases/v0.4.md` | consistent (its dev dependency on MESH is still `^0.6.0`, which its peer range admits) |
| 3 | Nexus | 0.12.0 | `v0.12.0` | `docs/releases/v0.12.md` | **stale**: `@valancex/mesh-runtime` and `-compiler` are `^0.10.0` in the manifest |
| 4 | Valance | 0.7.0 | `v0.7.0` | `docs/releases/v0.7.md` | **stale**: needs NEXUS 0.12, PORT Web 0.4, MESH 0.10 |

Every repository's `release.yml` publishes on a pushed `v*` tag, with provenance, using the `NPM_ACCESS_TOKEN` secret (an npm granular token for the `@valancex` organisation; it expires, so check that it is current first). A manual run of the workflow without `publish` is a dry run of everything but the publishing.

## Before the first tag

- The prepared branches (`ccr-969a5158-vobqhh` in each repository) are merged to the default branch, as the earlier releases were. The release workflow runs the repository's CI on the tagged commit.
- The npm token is current, and the `@valancex` organisation accepts a publish of each package below.

## 1. MESH 0.10.0

1. Tag the merge commit `v0.10.0`. The workflow builds the five `mesh-lsp` binaries, the WebAssembly modules and the eight npm packages (`@valancex/mesh-compiler`, `mesh-runtime`, `mesh-lsp` and its five platform packages) and publishes them with the GitHub release.
2. Check on the registry: `@valancex/mesh-runtime@0.10.0` and `@valancex/mesh-compiler@0.10.0` install in an empty project, `init` is optional in a browser, `compileProgram` infers an undeclared composite.
3. Update the "prepared" status lines to "released" (README, `docs/README.md`, the specification's status line, `docs/releases/v0.10.md`, the stability page's "0.10.0 or earlier"), as `5a4aa3b` did for 0.9.

## 2. PORT 0.4.0

1. No lockfile change is needed. Tag `v0.4.0`.
2. Check: `@valancex/port-web@0.4.0` installs next to `@valancex/mesh-runtime@0.10.0` with no peer warning (the peer range names 0.6 to 0.10).
3. Mark the notes and README "released".

## 3. NEXUS 0.12.0

1. `pnpm install` in the repository to refresh `pnpm-lock.yaml` for `@valancex/mesh-runtime@0.10.0` and `@valancex/mesh-compiler@0.10.0` (the dev dependencies), and commit it. `tests/mesh-runtime-compat.test.ts` fails until this is done: it checks that the lockfile names the one runtime that is installed.
2. All of `pnpm typecheck && pnpm test && pnpm build` pass (the package's `prepublishOnly`); tag `v0.12.0`.
3. Check: `@valancex/nexus@0.12.0` installs with `@valancex/mesh-runtime@0.10.0` as its peer, `Runtime.refusalOf`, `Mesh.update` and `shutdown.grace` are exported. An application on MESH 0.8 or 0.9 stays on NEXUS 0.11 (the notes say so).
4. Mark the notes, README and roadmap "released".

## 4. VALANCE 0.7.0

1. `pnpm install` at the repository root to refresh `pnpm-lock.yaml` (VALANCE's dependency on NEXUS `^0.12.0`, its dev and peer ranges, and the two workspace examples). The `minimumReleaseAgeExclude` list in `pnpm-workspace.yaml` already names the new versions; remove them once they are older than the minimum age.
2. `examples/docs-site` is a consumer of the *published* `@valancex/valance`, so it stays on the released set (VALANCE 0.6.0, NEXUS 0.11, MESH 0.9, PORT Web 0.3) in the release commit and moves to the new set in a follow-up after 0.7.0 is published (as `a5fbe56` did for 0.6.0). Bumping it earlier makes `pnpm install` look for a VALANCE 0.7.0 that does not exist yet.
3. `examples/docs-verifier`: replace the `link:` overrides in its `package.json` with the registry versions (it already names VALANCE 0.7.0 and NEXUS 0.12.0), run `pnpm install` there, then `pnpm test` and `pnpm test:smoke`. Until then, `node scripts/with-local-packs.mjs <packs> --smoke` runs it against packed versions.
4. The package tests, the tracer (`pnpm --filter @valancex/tracer-web test`, `test:browser`, `test:smoke`) and the docs-site pass; tag `v0.7.0`.
5. Check: a clean project installs `@valancex/valance@0.7.0` with the registry's NEXUS, MESH and PORT Web and resolves one copy of each (`npm ls @valancex/nexus @valancex/mesh-runtime effect`).
6. Mark the notes "released".

## Gates that were run on the prepared set

All against packs of the prepared branches, in a clean project and in the repositories: MESH Rust (108 suites), clippy, fmt and JS (including browser, with `MESH_CHROMIUM=/opt/pw-browsers/chromium` in this environment); PORT 316; NEXUS 510 of 511 (the lockfile test, above); VALANCE 123; the tracer 548 Node, 57 Chromium and 4 smoke; the docs-site 4 and 2; the docs-verifier 22 and 2.

## What changes for users, in one place

- MESH 0.10: updates and patches, composite children, named slots and events, inferred composite contracts, `mesh-switch`, `mesh-fragment` (MESH makes no node a template did not write), maximal text runs.
- PORT Web 0.4: `patch`; `WebPort` gained members, so code that implements the interface must add them.
- NEXUS 0.12: `Runtime.refusalOf`, `Mesh.update`, a `Selector.combine.changes` fix, and a shutdown policy (the work started with `run` and `runFork` is settled, with an optional grace, before resources are released). Peer range `@valancex/mesh-runtime@^0.10.0` only.
- VALANCE 0.7: only what changed is drawn; `Target.patch`; `shutdown.grace` on `start` and `Web.run`.
