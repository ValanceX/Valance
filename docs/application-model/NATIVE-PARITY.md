# Web parity on native: what the web supports, and what the equivalent is

Written 2026-10-14. Every capability the web path gives an application (Valance, `@valancex/common`, `@valancex/router`, `vlx`, the VS Code extension), taken in turn, with what the native equivalent would be and where it stands. **Evidence** is marked: **run** (a test or a run on this machine), **read** (read from the code, not run on native), **reasoned** (my reading of how native platforms work; verify before building on it). The native work so far is the to-do app ([`examples/todo`](../../examples/todo/README.md): engine in Node behind a stdin/stdout protocol, renderer in Rust and egui, Linux and Windows) and one new test, `packages/cli/test/second-target.test.ts` ("navigation on a target that is not the web").

> **Since this note (2):** a content site was drawn in a native window from a native vocabulary and its links navigated: [the content layer experiment](./NATIVE-VOCABULARY.md#five-the-content-layer-tested-run). Rows #3, #4 and #15 move: the content model and its pages work, the vocabulary for them exists (promoted), and a link is reported as an address.
>
> **Since this note:** the native window is now the Desktop PORT, a package of its own in the PORT repository ([`valancex-port-desktop`](https://github.com/ValanceX/Port/tree/main/packages/port-desktop)), and the vocabulary question (#4) has an investigation and a built answer for applications written for native: [the native vocabulary](./NATIVE-VOCABULARY.md). The question for a `vlx` application (the web's tags) is still open.

## The shape of the answer

Two different applications exist, and they stand in different places:

| | The to-do app | A `vlx` application (content, layout, components, `defineApp`) |
|---|---|---|
| Runs with no DOM | **run** | **run** (the scaffolded project, with a text target; its pages, layout, component, state, theme command) |
| Draws in a native window | **run** (Linux; Windows built) | **not built**: no engine entry for it, and its tags (`shell`, `nav`, `para`, `h1`, `list`, `link`, `image`, `code`…) are the web's |
| Own vocabulary | yes, seven components | no: the web's tag table; a second vocabulary compiles it only if it keeps the web's hooks |

So the **model** (state, commands, templates, slots, blocks, events, router, content) is portable and proven so. What is not portable is exactly what the earlier investigation said: the **vocabulary**, plus a set of things the browser does for the application that nothing does yet on native. The table below is those things.

## The matrix

| # | Web capability | How the web does it | Native equivalent | Status | What it takes |
|---|---|---|---|---|---|
| **Model** |||||
| 1 | State, commands, capabilities, async work, shutdown | NEXUS, Valance | the same code | **run** | nothing |
| 2 | Templates: props, events, blocks, slots, typed scope | MESH | the same code | **run** (blocks, events with payload; slots **read**) | nothing |
| 3 | Content pages (Markdown → content model), link checks, `public/` files | `vlx`, `@valancex/common` | the same content model; a page becomes a screen | **run** headless (renders; navigates by `go`) | a renderer that draws the web's semantic tags, or a native vocabulary and layout (#4) |
| **Presentation** |||||
| 4 | Vocabulary: which tags exist | the web's tag table (`primitives.ts`) | the Desktop PORT's own, as data (`vocabulary.json`; [investigation](./NATIVE-VOCABULARY.md)) | **built** for applications written for native; **open** for `vlx` | decide the semantic core (the earlier investigation's options 1 to 3). The to-do app is evidence for "per-target templates"; nothing yet for "one template, many targets" |
| 5 | Update by key (patches) | MESH patches through PORT Web | a renderer reconciles by `key` | **run** (whole tree sent on `update`; the renderer redraws) | patches in the protocol; fine for small screens, wasteful for large ones |
| 6 | Server rendering, static export, hydration | `renderToHtml`, `vlx build` | **not applicable**: there is no server and no first-paint document | n/a | what replaces it is startup time: **run** 185 to 250 ms to the first screen from the packaged engine (3.3 s the very first time, while the executable is cached), engine memory about 79 MB |
| 7 | Styling | `class`, `theme`, CSS files, live style updates | tokens or a style vocabulary the renderer maps | **not built** (the to-do app has no styling at all) | a small style language (spacing, emphasis, intent) in the vocabulary; CSS does not carry over |
| 8 | Theme light/dark | `data-theme`, the theme toggle | the OS theme, and an application override | **not built** (**run** headless: the toggle command works) | a `theme` capability that says the OS preference and takes an override |
| 9 | Responsive layout | `viewport` (`compact`/`medium`/`expanded`) and the reserved `resize` command | the window's size | **read**: the command exists and is target-neutral | renderer sends its width; engine invokes `resize`. Small |
| 10 | Accessibility: labels, current page, pressed, focus, live announcement on page change | ARIA props, `announce`, focus to `#content` | the platform's accessibility API (egui has AccessKit) | **not built**; **reasoned** | map the components that are already semantic (`heading`, `button`, `checkbox`, `field`); define `label`/`current`/`pressed` for native; a live announcement message |
| 11 | Keyboard | click only (no key events in PORT Web either, finding F31) | shortcuts, Enter to submit, Tab order | **not built**; egui handles Tab and focus by itself | a `key` event in the vocabulary; same gap as the web |
| 12 | Text input | `Web.textField`: shows exactly the rendered value | `field`, with what was typed kept ahead of the engine's answers | **run** (the race was found and fixed in the renderer) | the two contracts differ: the web's says "exactly the rendered value", native's says "the person's text wins until the engine changes the value itself". Write the native one down in the PORT guide |
| 13 | Images | `image` with `src`, files from `public/` | decoded and drawn from files shipped with the app | **not built** | assets inside the single executable or beside it; a decoder in the renderer |
| 14 | Scroll position | reset on a new page, restored on Back | reset on a new screen | **not built**; the renderer keeps one scroll area for every screen | reset on `draw`, keep on `update` |
| **Navigation** |||||
| 15 | A link | `<a href>`; the history listener takes the click, there is no event in the tree | an address with no event: **run** (`link` nodes carry `href`, `events` empty) | **open** | a protocol message `{"op":"link","href"}`; the engine turns it into the route table's navigation fact and runs the application's `go` (done by hand in the test above) |
| 16 | An external link | the browser follows it | the system browser, through an `open` capability | **not built**; **reasoned** | allowlist the schemes (`vlx check` already refuses `javascript:`), one capability that opens `https:` and `mailto:` |
| 17 | URL, Back, Forward | `Web.history` | no URL; a back stack | **open**, F4 | the `Navigation` capability (next cycle): a stack in state, `back`/`forward` commands, the web's history as one implementation. The to-do app uses explicit "up" buttons |
| 18 | Deep links | the URL | the OS opens the app with an address (a protocol handler) | **not built**; **reasoned** | the address goes to `router.enter`, which exists and is tested |
| 19 | Guards on leaving and entering, redirects, `safeNext` | `@valancex/router` | the same code | **run** (all four of the to-do guards, over the wire) | nothing |
| 20 | Leaving the page with unsaved work | `beforeunload` (deferred) | the window's close request | **run** (`router.mayLeave`, `closeRequested`/`closeAnswer`) | the web equivalent is still missing |
| 21 | Title: page, app, status | `document.title`, the format in `valance.json` | the window title, and a badge for `status` | the to-do app **run** (a `window title` prop); a `vlx` application **not built** | a `title` message from the engine (the application already computes it) and a badge capability for the `status` part |
| 22 | Head metadata, canonical, sitemap | the document's head | **not applicable** (search and link previews) | n/a | an "About" description is the nearest thing |
| **Platform** |||||
| 23 | Backend requests, interceptors | the `Http` capability over `fetch` | the same capability | **read**: `webHttp` is plain `fetch`, which the engine's Node has; interceptors are the same code | the host does not pass a platform yet; a native base must be absolute (there is no origin); a keychain for tokens, the cookie story does not exist |
| 24 | Storage | none in the framework (the theme is not persisted) | a store capability the platform supplies | **not built**, F8 | one `Store` capability with a typed key and Schema, the web's implementation (`localStorage`) and a file in the user's data directory |
| 25 | Page lifecycle | `pagehide` stops the application with a grace period | window close, and on mobile suspend/resume | window close **run**; suspend/resume **not built** | lifecycle messages in the protocol |
| 26 | Security | CSP `_headers`, plain-text titles, safe `Http`, link-scheme check, origin checks in `safeNext` and redirects | different threats: the renderer is a separate program (**run**: bounded and validated input), unsigned executables, no updater, a bundled Node that needs a rebuild for each of its security fixes | partly | code signing (Windows Authenticode, macOS notarization), an update path, a policy for rebuilding on Node releases |
| **Tooling** |||||
| 27 | `vlx init`, `generate`, `sync`, `check` | the CLI | `check` and `sync` are target-neutral in design; `init`, `dev`, `build` are web-only | **not built** | a `desktop` target in `targets.ts`: scaffold, `build` produces the engine, the programs and the renderer; today the to-do app has hand-written `scripts/package.mjs` and `dist.sh` |
| 28 | `vlx dev` (reload, live styles, error overlay) | Vite | restart the engine and keep the window | **not built** | a dev engine the renderer can reconnect to |
| 29 | Editor support | `manifest.json` per project, the VS Code extension | the same, if the manifest is emitted | **not built**: the to-do app's manifest is a value in `vocabulary.ts`, not a file the language server reads | write `.valance/manifest.json` from the vocabulary |
| 30 | Tests | tracer-web (jsdom, Chromium), text target | text target (**run**), Rust against the real engine (**run**), a window under a virtual display (**run by hand**, not in CI) | partly | a scripted GUI test (click, type, screenshot) in the `desktop` job on Linux |
| 31 | Delivery | a static site any host serves | archives per platform (**run**: Linux, Windows in CI; macOS not built); installers, updates | partly | a `macos-latest` leg (Mach-O injection for the engine; the Rust side builds there), installers, an update channel |

## What the matrix says

1. **Three things are one small piece of work each and unblock a `vlx` application on native:** a link message (#15), a title message (#21) and a viewport message (#9). The page, navigation and responsive layout of a content application then work. The probe shows the application already does the rest: the `go` command moves between pages, and the screen follows.
2. **The vocabulary (#4) is the one real decision.** Everything a `vlx` application draws is named in the web's tags. The native renderer can draw them (it is a table of seven today; the web's has 26), but a "paragraph" or "navigation bar" with no styling language (#7) is a poor native screen. This is the question that needs a person to choose, and the to-do app only answers it for applications that are written for native.
3. **Four things the web gets from the browser that no native target gets for free:** a back stack (#17), storage (#24), accessibility (#10) and opening external addresses (#16). Each is a platform capability, each has a web implementation already (history, `localStorage`, ARIA, the browser), and none is built. They belong behind capabilities, not in the router or the renderer.
4. **Some web features are simply the web's:** server rendering, static export, head metadata, CSP, hydration (#6, #22, part of #26). They have no native counterpart and should not get one.
5. **Mobile is a different problem, not a bigger version of this one.** The engine here is Node, and a Node single executable cannot be shipped in an iOS or Android app (**reasoned**: iOS does not allow an embedded JIT runtime outside the system's; both platforms want a smaller engine). What does carry over is the render-tree protocol, MESH's WebAssembly runtime, and the router's logic. The engine would need a different JavaScript runtime (the platform's) or a rewrite of the parts of Valance the application needs. This should be investigated before anyone promises mobile.
6. **macOS was named in the first question and is not built.** The renderer is Rust and builds there; the engine needs a Mach-O injection step, code signing and notarization. It is a CI leg and a signing decision.

## A proposal, in order

1. The three messages (#15 link, #21 title, #9 viewport) and an engine entry for a `vlx` application, then draw the scaffolded project natively with the web tags mapped to widgets (a stand-in vocabulary, clearly labelled). This answers "does a `vlx` application work natively" with a run instead of a probe.
2. The `Navigation` capability (#17), the `Store` capability (#24) and the `Open` capability (#16), each with a web and a native implementation, proved on the to-do app.
3. The vocabulary decision (#4, #7, #8), made from what step 1 shows.
4. macOS (#31) and accessibility (#10).
5. A mobile investigation (#5 above), before any commitment.

## Re-baseline, 2026-10-16 (partial)

The matrix above was written on 2026-10-14. These rows were checked against the code in this repository and the Port repository; **rows not listed here were not re-checked and still read as written** (marked, so that nobody mistakes the table for a current one).

| # | Was | Now | Evidence |
|---|---|---|---|
| 4 | open for `vlx` | **Built.** `vlx` has a `desktop` target with its own built-in views and the Desktop PORT's vocabulary and content vocabulary as data; the web-only hooks (`class`, `theme`, `width`, `height`, …) are refused on it, by test | `cli/src/targets.ts`, `cli/views-desktop/`, `cli/test/second-target.test.ts` |
| 8 | not built | **Built**: `appearance` in `defineApp`, and `colorScheme` is told to the layout | `common/src/desktop.ts` (`appearanceOf`, `onScheme`) |
| 9 | read | **Built (2026-10-16)**: the window sends `resize` (its width in points, when it opens and when it changes); the engine turns it into `viewport`. Engine side tested with a stand-in window; the Rust side's message tested; **driven in a real window (2026-10-16)**: a window 500 wide gives `viewport` compact, one 1000 wide expanded | Port `app.rs`, `host.rs`, `tests/protocol.rs`; `valance/src/native.ts` (`onResize`), `common/src/desktop.ts`, `cli/test/desktop-host.test.ts` |
| 11 | click only | **Partly built**: events by one key (Enter, Escape), `focus` and `blur` on the web and in the Desktop PORT (unreleased) | `FORM-PRIMITIVES.md` |
| 13 | not built | **Built in the PORT**: `image` in the content vocabulary, decoded from local files; `vlx build` copies `public/` beside the engine. Image sizes (WA-9) are the web's | Port `content.json`, `view.rs` `local_image`; `common/src/desktop.ts` `withAssets` |
| 15, 16 | open / not built | **Built**: a link is an address, `onLink` turns it into `go`; an external one goes to the `Open` capability | `common/src/desktop.ts`, `common/src/open-system.ts` |
| 17 | open | **Built**: the `Navigation` capability with the engine owning the list; `back` and `forward` commands; optionally kept between runs | `common/src/navigation.ts`, `common/src/app.ts` |
| 19 | run | **Run, and larger**: per-route `canActivate`, `canDeactivate` and `redirectTo` on declared routes | ROUTES.md 6f |
| 20 | web missing | **Web built** (`beforeunload` asks a guard that answers at once); the desktop's `mayClose` is wired to the route guards and tested through the protocol with a stand-in window (a page with edits refuses, a clean one allows, the engine ends on an allowed answer); **driven in a real window (2026-10-16)**: a close request on a page with edits left the window open, on a clean page it closed | ROUTES.md "Implementation status, slices 6e and 6f" |
| 21 | not built | **Built**: the window's title follows the page, in the project's format | `common/src/desktop.ts` (`titleOf`) |
| 24 | not built | **Built**: `Store` with a file in the user's data directory; `persist` in `defineApp` | `common/src/store-file.ts` |
| 27 | not built | **Partly built**: `init`, `check`, `info` and `build` know the desktop target; `dev` is web only | `cli/src/targets.ts`, `cli/src/build.ts` |

## Driven in a real window, 2026-10-16

The Desktop PORT's window (`vlx-window`, `valancex-port-desktop` 0.2.0 built from the Port repository) was run under Xvfb against an engine built by `vlx build` from a desktop project, and driven with real X input (`xdotool`, `wmctrl`, screenshots with ImageMagick's `import`). The project was a probe, not an example: a `label` around a checkbox, around two radios and around a text field, a `button` with a `label`, a link to a declared route with `canDeactivate`, and the state printed as text. Mesa's software GL drew the window (`LIBGL_ALWAYS_SOFTWARE=1`); the machine needed `libxkbcommon-x11` and, for the window manager parts, `openbox`.

| What was done | What the window did |
|---|---|
| Started it | Drew the layout; the radiogroup's options in a column, each option's text beside it |
| Clicked the text "I agree" in a `label` around a checkbox | The box ticked; the application's state read `agree=true` |
| Clicked the text "Pro" in a `label` around a radio | `plan=pro`, "Free" unselected |
| Clicked the text "Email" in a `label` around a text field | The field took the cursor and raised `focus` (the application counted it); text typed after it went into the field and reached the state (`email=bobZ`) |
| Resized it to 500 wide, then 1000 | `viewport` told to the layout: `compact`, then `expanded` |
| Clicked a link to a declared route | The route was entered (its `enter` ran) and the title became that page's |
| Asked the window manager to close it, on a page with edits | The window stayed open (`canDeactivate` refused), twice |
| Asked the window manager to close it, on a clean page | The process ended |

**What this proves, and what it does not.** It proves the three rows above that were only tested with a stand-in window (`resize`, the close guard, a link to a declared route) and the `label` component on the real Rust side, with the real engine. It does not cover macOS or Windows (the Port's CI builds and tests those; nothing was drawn there), a pointer other than the mouse, a screen reader (the accessibility tree is tested headless; nothing read it), or a long session.

**Observations, not yet findings.** (1) Without a window manager, X gives the window no keyboard focus, so typing did nothing until `xdotool windowfocus` was run; this is the harness's, not the window's. (2) A declared route that names no screen and has no page is drawn as the not-found page ("Not found" in the title) while its `enter` and state still ran; the probe tripped over it, and ROUTES.md should say which of the two is meant. (3) The desktop draws a radiogroup's options in a column and a `label` as a row; the web draws both inline unless styled, so a portable layout should not depend on either.
