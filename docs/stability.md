# API stability

What each public surface of VALANCE promises. The tiers have one meaning each, shared with MESH and NEXUS.

| Tier | Meaning |
|---|---|
| **Stable** | In a released version. VALANCE is pre-1.0, so a minor version may change it, but only with the change named in that version's release notes, never silently. |
| **Unreleased** | On the development branch and not in any release. May change before one. |
| **Provisional** | Named so in the documentation. |
| **Internal** | Not a contract. Exists for binding authors and tests; may change in any release without notice. |

## By surface

| Entry | Tier |
|---|---|
| `@valancex/valance` (`define`, `start`, `mount`, `hydrate`, `command`, `entry` and their types) | Stable |
| `@valancex/valance/web` (`Web.target`, `Web.history`, `Web.run`, `Web.link`, `Web.event`, the PORT table helpers) | Stable |
| `@valancex/valance/web/server` (`renderToHtml`) | Stable |
| `@valancex/valance/web/build` (`manifest` and its helpers) | Stable |
| `@valancex/valance/web/plugin` (`Plugin`, `RouteTable`, `HeadTags`, `Navigation`, `Delivery`, `compose`, `mergePlatforms`, `mergeHeads`, `renderHead`, `applyHead`, `deliveryOf`, `staticPaths`), and the `plugins` option of `Web.run`, `renderToHtml` and `manifest` | Stable (since 0.8.0) |
| `HistoryOptions.head` and `HistoryOptions.onNavigated`; `renderToHtml`'s `head` option and `Served.head`; `RunOptions.primitives` and `renderToHtml`'s `primitives` becoming optional | Stable (since 0.8.0) |
| `ValanceErrorCode` `plugin-conflict` and `invalid-head` | Stable (since 0.8.0) |
| `command(state).waiting`: `work` may return an `Effect` that requires the application's environment (a capability), as well as a Promise | Stable (since 0.8.0) |
| `@valancex/common` (0.11, prepared): `defineApp`, `component`, `field` and their types; the `components` list and the `override` list; `Schema` is not exported (import it from `effect`). Its `./client` and `./server` entries are what the generated build entries run, and `./internal` is the build tools' (not an application's) | **Provisional** (since 0.11.0): proved by `examples/docs-app`; may change in any 0.x release, with the change named in its notes |
| `@valancex/cli` (0.11, prepared): the `vlx` command (`init`, `dev`, `build`, `check`, `sync`, `generate page\|component`, `help`; global, running the project's own install; an Ink interface in a terminal), `valance.json` / `valance.web.json`, the project layout and the layout scope (`docs/application-model/`), and the `./node` entry | **Provisional** (since 0.11.0): as above |
| Deriving a manifest declares no element for conditional or repeated structure (blocks `{#if}`, `{#each}` are MESH's, built in); the retired names `mesh-if`, `mesh-each`, `mesh-switch`, `mesh-case`, `mesh-default` are refused when derived | Stable (since 0.9.0) |
| `@valancex/valance/internal` | **Internal**: the composition protocol for binding authors and tests, unstable by design |
| `ValanceError`, `ValanceErrorCode`, `isValanceError`, `isRefusal` (the defects' stable `code`s) (since 0.6.0) | Stable |
| A start-time command's failure is **logged** (`Effect.logError`, message `start-time work failed`, with the whole cause) (since 0.6.0) | Stable |
| A finished event dispatch leaves a mount's `pending` list at once (since 0.6.0) | Stable (observable only through memory and the tracer tests) |
| `StartOptions.shutdown` (`grace`) of `start` and `Web.run` (since 0.7.0) | Stable |
| `Target.patch` (optional): a later render of the same view reaches a target that has it as MESH's patches, and `update` otherwise (since 0.7.0) | Stable |

## What is logged

VALANCE writes to Effect's logger in these places: a failed `head`/`titleOf` application and a throwing `onNavigated` (since 0.8.0, message `history synchronization failed` / `navigation hook failed`), and, as before, a failed popstate or link navigation (C28) and a start-time command that fails (C35). Both log **the whole `Cause`**, which includes whatever the failing command's errors carry. VALANCE does not inspect or redact it: an application whose errors can hold secrets or personal data keeps them out of the errors it lets escape a command, or installs a logger that redacts. A failure the application wants the user to see is state, not a log line.
