# What a native target needs: findings from the to-do app

Written 2026-10-14 from `examples/todo`: one application (lists, items, editing; four routes with guards) that runs headless, behind a stdin/stdout protocol, in a native window (Rust, egui) on Linux, and as a cross-built Windows app. Everything below was **run** unless it says otherwise. The Windows executables were built and inspected (PE header, injected blob, fuse flipped), **not run**: there is no Windows machine here.

## What worked unchanged

| Part | Result |
|---|---|
| NEXUS state and commands, MESH templates with blocks and event payloads, `{#each}` with keys | The application never names a platform. The same definition ran on a text target in tests and in a native window. |
| `@valancex/router` core: `match`, `decide`, guards, `go`, `canDeactivate` | Used as is. A refused leave over the wire (unsaved edit) held; discard released it. |
| The `Target` seam (`draw`, `update`, `unmount`, `report`) | Enough for a target that is a process: a serializing target is 40 lines (`host.ts`). |
| A vocabulary of its own | `window`, `column`, `row`, `heading`, `text`, `button`, `checkbox`, `field`: eight components in a manifest, compiled by the published MESH compiler. The web's tag table was not needed. |

## What it found (and what was done)

| # | Finding | Status |
|---|---|---|
| F1 | **`router.match` does not ask the entering guards**, so an application opened at a stale address (a list that was deleted) started on a screen with nothing to show. The web has the same gap for a direct load. | **Fixed**: `router.enter(address, state)` runs the guards, follows redirects, starts on not-found if refused (`NavigationKind` gains `"initial"`). |
| F2 | **A command cannot navigate through the router.** `go` is a command a template calls; `saveItem` needs to save *and* go to the list, and the to-do app does it by writing `route` into state itself, which skips every guard. | **Open.** Proposal: `router.moveTo(state, to, { replace? })`, an Effect a command can run, and `go`/`replace` become thin wrappers over it. |
| F3 | **Closing the window skips `canDeactivate`.** A person can close the native window with unsaved text and lose it. The web has the same hole (`beforeunload`, deferred). | **Open.** Proposal: the renderer sends `{"op":"closeRequested"}`; the engine asks the current route's guard and answers `{"op":"close"}` or keeps the window; the router exposes `router.mayLeave(state)`. |
| F4 | **There is no back stack.** The app has explicit "Back to list" buttons (hierarchical: up, not back), which is right for a desktop but not for mobile's system back, or Alt+Left. Nothing in state or the router remembers where the person came from. | **Open, as expected.** This is the `Navigation` capability: a stack the application can read and `back`/`forward` commands, with the web's `history` as one implementation and a state-held stack as another. Next cycle. |
| F5 | **Templates cannot build addresses.** `go("/lists/" + id)` is not MPRX, so every address a template needs comes from the scope (`href` on each row). It works, and `hrefs` lives in one place, but each screen's scope grows. | Noted. `router.href(name, params)` already exists for scope functions; a typed helper in the vocabulary would cut the repetition. |
| F6 | **A controlled text field races the engine.** The engine answers a keystroke after the next one was typed; taking its answer at face value deleted a letter ("Groceries" became "Goceries", seen in the window). The renderer now tracks what it reported and not yet had answered, and keeps the person's text unless the engine changed the value itself. | **Fixed in the renderer** (`Field`, three tests). It is a rule every target with text input will need; it belongs in whatever documents PORT renderers (`rendering-mesh-output.md` says nothing about it). |
| F7 | **Route titles do nothing on native.** The window title came from the screen's own `window title=…`; the router's per-route `title` was unused, and `delivery`/`staticParams` are web-only configuration on a route definition. | Noted. A native target reads `router.titleOf(route)` if it wants one; the web-only route options should be named as such in the docs. |
| F8 | **State does not survive closing the app.** Lists vanish on exit. | **Open.** It is a capability (a store) the platform supplies, like `Http`: not a router matter, but the first thing a person would ask. |
| F9 | **The renderer is a separate program, so its input is untrusted.** `parseInbound` bounds lines (64 KiB), handlers (256), payload depth (8), and refuses `__proto__` and non-finite numbers; ignored lines are counted. | Done, tested. |

## Packaging, measured

| | Linux x64 | Windows x64 |
|---|---|---|
| Renderer (`todo-desktop`) | 5.4 MB | 3.5 MB |
| Engine (`todo-engine`, Node single executable with the app, its screens and the MESH WebAssembly runtime as assets) | 126 MB | 88 MB |
| Archive | 44 MB (`.tar.gz`) | 35 MB (`.zip`) |
| Run | **yes**: packaged app under a virtual display, created a list by typing and clicking | **no**: cross-built only |

The engine is almost entirely the Node binary. That is the cost of keeping the application in JavaScript with the runtime Valance already has; a smaller engine would mean a different JavaScript runtime or running MESH and NEXUS elsewhere, which is a decision for a product, not for this experiment.

## What this says about the router

1. **The core is not web-shaped.** Definitions, matching, guards, `decide`, `enter` and `go` needed no window and no URL. Only `plugin` (history) is the web's, as designed.
2. **Two things are missing for any non-web target, and both are small:** `moveTo` for commands (F2) and a leave check for the window closing (F3).
3. **The one big thing is a back stack (F4)**, and it is a capability, not a router feature: the router decides *whether* a move is allowed, something else remembers *where from*.
4. **Do not copy `delivery`, `staticParams` and `replaceQuery` into other targets**; they are the web's.

## Recommended next steps

1. `router.moveTo` (F2) and `router.mayLeave` with a `closeRequested` message (F3), with tests on the to-do app (small).
2. The `Navigation` capability (F4), implemented twice: the web's history and a state-held stack, proved on this app and the docs site.
3. A store capability (F8) and persist the lists.
4. Decide what the Windows run needs: a person with a Windows machine to run `todo-win32-x64.zip`, or a CI job on a Windows runner (the cross-build can be replaced by a native one there).
