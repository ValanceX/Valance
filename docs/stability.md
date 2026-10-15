# API stability

What each public surface of VALANCE promises. The tiers have one meaning each, shared with MESH and NEXUS.

| Tier | Meaning |
|---|---|
| **Stable** | In a released version. VALANCE is pre-1.0, so a minor version may change it, but only with the change named in that version's release notes, never silently. |
| **Unreleased** | On the development branch and not in any release, or published as data or a package whose content is still subject to change (named in its row). May change before a release. |
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
| `@valancex/common` (0.13): `defineApp` (`state`, `commands`, `components`, `override`, `http`, `derived`, `persist`, `appearance`, `guard`, `targets`), `component`, `field`, and their types; the `Store` and `Open` capabilities and `Navigation`; the portable core of the web vocabulary (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`). `Schema` is not exported (import it from `effect`). Its `./client`, `./server`, `./desktop` and `./http` entries are what the generated build entries run, and `./internal` is the build tools' (not an application's) | **Provisional** (since 0.11.0): proved by `examples/docs-app` and `examples/todo-multi`; may change in any 0.x release, with the change named in its notes |
| `@valancex/router` (0.12 released; 0.13 adds `History` and `permit`): `createRouter`, `route`, `redirect`, `permit`; typed path and query parameters, `canMatch`/`canActivate`/`canDeactivate`/`beforeEach` guards, `go`/`replace`/`navigate` commands, a title per route; and `History`, the list of places visited and its moves (`start`, `push`, `replace`, `go`, `canGo`, `restore`), with the guard kind `"history"` (`docs/application-model/NAVIGATION.md`). Needs the engine seams `modeOf` and `guard` on the route table | **Provisional** (since 0.12.0; `History` and `permit` since 0.13.0): proved by its integration tests in a page and by `defineApp`'s own navigation; may change in any 0.x release, with the change named in its notes |
| `@valancex/valance/native`: `run`, `serve`, `parseInbound` and the protocol's types (§20 of the contract), including `onNavigate` for the window's Back and Forward; Node only | **Provisional** (since 0.13.0): the protocol (version 1) is the Desktop PORT's, and the PORT crate is not yet published, so a window is built from its source |
| `vlx init --desktop`, `valance.desktop.json`, the desktop build (`dist/desktop/engine.mjs`), `vlx package --desktop` (with `--archive`; unsigned) and `vlx dev`'s window (`vlx-window`), and `@valancex/common/desktop` | **Provisional** (since 0.13.0): depends on the Desktop PORT, which is built from source until it is published |
| The desktop vocabulary (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`; events `click`, `change`, `submit` and `cancel`) and its content layer (`paragraph`, `list`, `listitem`, `code`, `blockquote`, `image`, `strong`, `emphasis`, `link`), published as `@valancex/port-desktop-vocabulary` (which `@valancex/cli` reads), and the host protocol (version 1) between an engine and a window (`examples/todo`, the PORT's architecture note) | **Unreleased** in content: the package is published, but the vocabulary and the protocol may change before the crate's 0.1 |
| `@valancex/cli` (0.13): the `vlx` command (`init`, `dev`, `build`, `check`, `sync`, `package`, `generate page\|component\|target`, `help`; global, running the project's own install; an Ink interface in a terminal), `valance.json` / `valance.web.json` / `valance.desktop.json`, the project layout (each target builds to `dist/<target>/`) and the layout scope (`docs/application-model/`), and the `./node` entry | **Provisional** (since 0.11.0): as above |
| The VALANCE extension for VS Code (`editors/vscode`, `valancex.valance`): its commands and settings (`valance.meshLsp.path`, `valance.codeLens`) | **Provisional** (since 0.1.0): versioned and released on its own tag, `vscode-v<version>` |
| Deriving a manifest declares no element for conditional or repeated structure (blocks `{#if}`, `{#each}` are MESH's, built in); the retired names `mesh-if`, `mesh-each`, `mesh-switch`, `mesh-case`, `mesh-default` are refused when derived | Stable (since 0.9.0) |
| `@valancex/valance/internal` | **Internal**: the composition protocol for binding authors and tests, unstable by design |
| `ValanceError`, `ValanceErrorCode`, `isValanceError`, `isRefusal` (the defects' stable `code`s) (since 0.6.0) | Stable |
| A start-time command's failure is **logged** (`Effect.logError`, message `start-time work failed`) (since 0.6.0); *since 0.12.0* with the failure's identity only (annotation `failure`), the whole cause going to `StartOptions.onStartFailure` | Stable (the log's content changed in 0.12.0: it no longer carries the cause) |
| A document title, meta `content` and link `title` are plain text: control and bidirectional override/isolate characters removed, whitespace collapsed, a title cut at 200 characters; `cleanTitle`, `plainText` and `TITLE_LIMIT` from `./web/plugin` (since 0.12.0) | Stable (since 0.12.0) |
| A finished event dispatch leaves a mount's `pending` list at once (since 0.6.0) | Stable (observable only through memory and the tracer tests) |
| `StartOptions.shutdown` (`grace`) of `start` and `Web.run` (since 0.7.0) | Stable |
| `Target.patch` (optional): a later render of the same view reaches a target that has it as MESH's patches, and `update` otherwise (since 0.7.0) | Stable |

## What is logged

VALANCE writes to Effect's logger in these places: a failed `head`/`titleOf` application and a throwing `onNavigated` (since 0.8.0, message `history synchronization failed` / `navigation hook failed`), and, as before, a failed popstate or link navigation (C28) and a start-time command that fails (C35). Both log **the whole `Cause`**, which includes whatever the failing command's errors carry. VALANCE does not inspect or redact it: an application whose errors can hold secrets or personal data keeps them out of the errors it lets escape a command, or installs a logger that redacts. A failure the application wants the user to see is state, not a log line.
