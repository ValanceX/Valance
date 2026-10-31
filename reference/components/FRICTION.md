# Friction log

Every place where building this repository as an outsider cost more than it should have (decision K17). The outsider rule: only the public documentation (`docs/how-to/libraries.md` and the pages it links) was followed; where it failed, the documentation or the product was fixed, and the fix is named here.

**Severity**: 1 = a small cost, worked around in minutes. 2 = a real cost, or something an author must know that the documentation did not say. 3 = it stopped the work, or would have shipped something wrong. A 3 is fixed in the product or recorded as a decision; none stays open.

| # | Sev | What happened | Resolution |
|---|---|---|---|
| F1 | 2 | pnpm 11 stops an install at a dependency's unapproved build script (esbuild). The workspace `vlx init library` wrote did not say it was optional. | Fixed: the scaffold's `pnpm-workspace.yaml` has `allowBuilds: { esbuild: false }`, with a test. |
| F2 | 1 | Packing the not-yet-published release set by hand and keeping the lockfile in step was slow and easy to get stale (an old packed `vlx` lacked the newest check). | Process only (`ALLOW_LOCAL_PACKS=1` and the boundary scan allow a local tarball while a release is prepared; CI is registry-only). |
| F3 | 3 | `unit()` rejected a command made with `unitCommand` that has parameters: strict TypeScript failed on the command type. | Fixed in `@valancex/common` (`unit()` accepts parametrized commands), test `unit-types.test.ts`. |
| F4 | 3 | A `controllable` field of a unit also appeared as a scope name, and the build refused the component (`manifest-unit-clash`). A controllable field is the documented way to let the caller hold state. | Fixed in the CLI's contract step, with a test (`units.test.ts`). |
| F5 | 3 | The web realization required class hooks on `paragraph`, `blockquote`, `list`, `olist`, `image` and `link` that the specification says are optional; a theme-less library using `list` could not build for the web. | Fixed: those hooks are `optional` in `web.json`, with a test (`primitive-rules.test.ts`). |
| F6 | 3 | `vlx library build` left files of a renamed or removed component in `dist/`, and they shipped. | Fixed: the build empties `dist/` first, with a test. |
| F7 | 2 | A library installed by link from outside the project cannot find its peer dependencies. | A `library-peers` diagnostic says so and what to do; documented under "Use a library". Not fixable below the package manager. |
| F8 | 2 | The state type of a unit command is not inferred through `unit()`; the author must annotate it, or gets an error far from the cause. | Documented ("Write a component"). Decision: inference through the schema map is a type-level change to `unit()`, a Tier 2 refinement, not made here. |
| F9 | 3 | The sixth component, a windowed list, cannot be written: the `window` clause and the `scroller` primitive (Bet 10) are not built, and a library cannot add a primitive. | Recorded as a decision (not built, with Bet 10); named in the README and in "What a library cannot do yet". |
| F10 | 2 | A disclosure has no `aria-expanded` and the tabs no `tablist`/`tab`/`tabpanel` roles: the portable core has no such hooks, so the components are less accessible than their names say. The e2e test asserts what is there (pressed buttons). | Recorded as a decision (an accessibility review is deferred with the accessibility maintainer, X7); documented under "What a library cannot do yet". |
| F11 | 2 | A theme cannot style a library component: recipes are for primitives only. A library component takes its look from what it composes. | Documented; recorded as a decision. |
| F12 | 1 | No index in `{#each}` and no list length in a template. | Documented in "Write a component". |
| F13 | 2 | The guide had no section on writing a component (props, events, snippets, controllable units) and none on where a theme package starts. | Fixed in `docs/how-to/libraries.md`. |
| F14 | 1 | The boundary scan flagged its own test strings and the temporary pack paths. | Fixed in the scan (strings built from parts; `local-packs/` allowed only with `ALLOW_LOCAL_PACKS=1`). |

Not claimed: the Reference Gate. The two outside parties, the accessibility maintainer and the download check are deferred (X7).
