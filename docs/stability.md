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
| `@valancex/valance/web/plugin` (`Plugin`, `RouteTable`, `HeadTags`, `Navigation`, `Delivery`, `compose`, `mergePlatforms`, `mergeHeads`, `renderHead`, `applyHead`, `deliveryOf`, `staticPaths`), and the `plugins` option of `Web.run`, `renderToHtml` and `manifest` | **Unreleased** (0.8) |
| `HistoryOptions.head` and `HistoryOptions.onNavigated`; `renderToHtml`'s `head` option and `Served.head`; `RunOptions.primitives` and `renderToHtml`'s `primitives` becoming optional | **Unreleased** (0.8) |
| `ValanceErrorCode` `plugin-conflict` and `invalid-head` | **Unreleased** (0.8) |
| `command(state).waiting`: `work` may return an `Effect` that requires the application's environment (a capability), as well as a Promise | **Unreleased** (0.8) |
| `@valancex/app` (private, unpublished): `defineApp`, `Schema`, the `valance` command (`dev`, `build`, `check`), `valance.json` / `valance.web.json`, the project layout and the layout scope (`docs/application-model/`) | **Provisional**: a proposal proved by `examples/docs-app`; not a contract, not in any release |
| `@valancex/valance/internal` | **Internal**: the composition protocol for binding authors and tests, unstable by design |
| `ValanceError`, `ValanceErrorCode`, `isValanceError`, `isRefusal` (the defects' stable `code`s) (since 0.6.0) | Stable |
| A start-time command's failure is **logged** (`Effect.logError`, message `start-time work failed`, with the whole cause) (since 0.6.0) | Stable |
| A finished event dispatch leaves a mount's `pending` list at once (since 0.6.0) | Stable (observable only through memory and the tracer tests) |
| `StartOptions.shutdown` (`grace`) of `start` and `Web.run` (since 0.7.0) | Stable |
| `Target.patch` (optional): a later render of the same view reaches a target that has it as MESH's patches, and `update` otherwise (since 0.7.0) | Stable |

## What is logged

VALANCE writes to Effect's logger in these places: a failed `head`/`titleOf` application and a throwing `onNavigated` (0.8, unreleased, message `history synchronization failed` / `navigation hook failed`), and, as before, a failed popstate or link navigation (C28) and a start-time command that fails (C35). Both log **the whole `Cause`**, which includes whatever the failing command's errors carry. VALANCE does not inspect or redact it: an application whose errors can hold secrets or personal data keeps them out of the errors it lets escape a command, or installs a logger that redacts. A failure the application wants the user to see is state, not a log line.
