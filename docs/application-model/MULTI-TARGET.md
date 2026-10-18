# One application, more than one target: an experiment

> **Status (2026-10-15):** this is the experiment's findings. What came of them is released in 0.13: see [`MULTI-TARGET-PLAN.md`](MULTI-TARGET-PLAN.md) (the plan and what was done), [`NAVIGATION.md`](NAVIGATION.md) and the [v0.13 release notes](../releases/v0.13.md).

**Status:** an experiment, to find the gaps and plan their fillings. Nothing here is a promise yet. The vertical slice is `examples/todo-multi`, made with `vlx init todo-multi --web --desktop` and then written into a to-do application; its test builds both targets and uses each the way a person would (`pnpm --filter @valancex/todo-multi run test:smoke`).

## What the experiment made

- A project has the targets whose settings file it has: `valance.web.json`, `valance.desktop.json`. `vlx init --web --desktop` makes both.
- `src/main.ts` is the application, once: the state (`items`, `entry`, ...), the commands (`setEntry`, `addItem`, `setDone`, `removeItem`, `clearDone`) and the content in `content/`.
- What differs is the templates, because each target draws with its own vocabulary. `defineApp({ targets: { web: { layout, components }, desktop: { layout } } })` gives each target its templates, kept in `src/web/` and `src/desktop/`. A target's `layout` replaces the top-level one; its `components` and `override` are added.
- Each target is compiled against its own vocabulary: a `<div>` in `src/desktop/` is an error that names the file, and nothing in `src/web/` can break the desktop.
- `vlx build` builds every target (`dist/web/`, `dist/desktop/`), or the ones named (`vlx build --desktop`). `vlx dev` serves one at a time (`vlx dev --web`, `vlx dev --desktop`). `vlx check` checks all.

## What worked, as evidence

| | Evidence |
|---|---|
| The commands are written once and both targets run them | the same five commands, the same `setDone(it.id, $event)` in both layouts; a browser test (typing, adding, ticking, clearing) and an engine test over the host protocol do the same things and reach the same state |
| An event's payload is the same on both targets | `change` carries a string from a textfield and a boolean from a checkbox on the web (PORT Web's table) and on the desktop; `$event` is used identically |
| The content is shared | one `content/`; the web draws it as a page, the desktop as the content layer |
| A mistake is reported per target and per file | the desktop layout with a `<div>`: every diagnostic is in `src/desktop/` |

**Update:** gaps 1 (partly), 3, 4, 5, 8 and 13 have fillings; see [the plan](./MULTI-TARGET-PLAN.md#decisions-made-and-progress-2026-10-14).

## The gaps, and the filling each suggests

| # | Gap | Seen as | Filling to plan |
|---|---|---|---|
| 1 | **The two vocabularies share no names**, so no template is shared | both layouts restate the same to-do UI in different words (`<list>/<listitem>/<span>` against `<column>/<row>/<text>`) | converge the web table on the portable names (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`): the "web table renaming" already deferred. Then a component written once runs on both |
| 2 | **PORT Web cannot give an element a fixed attribute**, so `type="checkbox"` is a prop every web template writes | `<checkbox type="checkbox" label="Done" ...>` against the desktop's `<checkbox checked=...>` | element constants in PORT Web's table (already recorded in NATIVE-VOCABULARY.md) |
| 3 | **A prop a web tag declares is required at every use** (MESH has no optional prop in a realization table) | `<button class="todo-button" pressed="false" ...>`: two props that mean nothing here, where the desktop's `button` has `disabled?` only | optional props in the realization table (MESH D1), then drop the boilerplate |
| 4 | **One target's presentation state lives in the shared state** | `theme` (web only) and `navigation` (desktop only) sit beside `items` | either accept it (state is the application's), or a `targets.<id>.state` for fields only one target reads |
| 5 | **No derived values in a `vlx` template**: only state fields and commands are names, so "2 of 5 open" cannot be written | the desktop to-do example has a `scope` function; a `vlx` project has none | a `derived` section in `defineApp`: `(state) => ({ open: ... })`, names a template can read |
| 6 | **From one target to two is a restructure**, not an addition | a one-target project has `src/layout.mprx`; a two-target one has `src/web/layout.mprx` and `src/desktop/layout.mprx` and `targets` | `vlx add target desktop`, which moves the files and writes the `targets` section |
| 7 | **The output directory depends on the number of targets**: `dist/` for a web-only project, `dist/web/` for a project with two | a project that gains a target changes where its site is | `dist/<target>/` always, at the next breaking release |
| 8 | **Stylesheets are found by walking `src/`**, so a stylesheet in `src/desktop/` would be loaded by the web | `src/web/styles.css` works only because the desktop has none | read stylesheets from the target's own directory (or declare them in `targets.web`) |
| 9 | **Editors see one target**: `.valance/editor.json` lists every target but `model` and `wiring` are the first one's | the VS Code extension reads those two | the extension reads `targets` |
| 10 | **`vlx dev` is one target at a time**, and the desktop reopens its window on every save | two terminals for both; the window flashes | a combined dev, and a window that reloads the engine without closing |
| 11 | **The desktop build is an engine and a separate window**; one executable is the to-do example's script, not `vlx` | `dist/desktop/engine.mjs` needs `node` and `vlx-window` | `vlx package --desktop` (the single executable, Linux and Windows) |
| 12 | **Public files and images**: `public/` is the web's (the desktop bundle took it until this experiment stopped it), and a content image is described, not drawn, on the desktop | `logo.svg` | an images loader in the Desktop PORT; `public/` per target |
| 13 | **Accessibility names differ**: the web checkbox needs a `label`, the desktop's has none | `<checkbox label="Done">` against `<checkbox>` beside a `<text>` | a `label` in the desktop vocabulary (every toolkit surveyed has one) |

## What was not tried

The window itself was not opened here (the engine was driven over the host protocol, as the to-do example's tests do); macOS; hosting the two outputs together; a second application state shape per target; mobile.
