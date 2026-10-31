# Libraries: components and themes you can install

A library is an npm package of components, or of a theme, that an application installs and uses. **Provisional** ([API stability](../stability.md)); it needs VALANCE 0.15 (`@valancex/cli` and `@valancex/common`).

* [Use a library](#use-a-library) (Tier 1: nothing to configure)
* [Make a library](#make-a-library) (`vlx init library`)
* [Write a component](#write-a-component) (props, events, snippets, a component's own state)
* [What a library declares](#what-a-library-declares) (the `valance` condition and field)
* [Targets](#targets), [styles](#styles), [themes](#theme-packages)
* [Names, collisions and overrides](#names-collisions-and-overrides) (Tier 2)
* [What a library cannot do yet](#what-a-library-cannot-do-yet)

## Use a library

```
npm install acme-ui
```

```ts
// src/main.ts
import { component, defineApp } from "@valancex/common";
import { components } from "acme-ui";   // or: import { disclosure } from "acme-ui";
import layout from "./layout.mprx";

export default defineApp({ layout: component(layout), components: [...components] });
```

```html
<!-- src/layout.mprx -->
<column>
  <disclosure label="More" open={opened} on.toggle={flip()} />
</column>
```

That is all. `vlx check`, `vlx build` and `vlx dev` find the library by what its `package.json` says about itself (below) and process it: its templates are compiled with yours, its stylesheets are put in the library layer, and a component's props and events are checked where you write the tag, with the line and column. You configure no bundler.

A library component is a component like your own: it is listed in `components`, a template writes its tag, and the contract it declares (`props`, `events`) is checked at each use. A library component is named by its template file (`disclosure.mprx` is `<disclosure>`) and has the **qualified id** `package/name` (`acme-ui/disclosure`), which diagnostics and `resolve` use.

If the library does not support a target you build for (a web-only library in a project that also builds the desktop), you get **one** diagnostic, at the tag in your template, and none from inside `node_modules`:

```
src/desktop/layout.mprx:2 unsupported-target: <disclosure> is acme-ui/disclosure, and acme-ui supports web only; this project builds for desktop. Use a component that desktop has, or build acme-ui for desktop
```

A library must be **installed**, from the registry or from a packed tarball (`npm pack`, `npm install ./acme-ui-1.0.0.tgz`). One linked from outside your project (`npm install ../acme-ui`) is not supported: it finds its peer dependencies (`@valancex/common`, `effect`) from its own directory, not yours, and `vlx check` says so (`library-peers`). Develop a library in a workspace (below) instead.

## Make a library

```
vlx init library acme-ui
cd acme-ui
npm install
cd packages/acme-ui
vlx library build      # dist/: JavaScript, declarations, and the templates and stylesheets as source
vlx library check      # the package, and the playground that uses every component
cd ../../playground && vlx dev
```

`vlx init library <name>` (a package name: `acme-ui` or `@acme/ui`) writes a workspace:

| Path | What it is |
|---|---|
| `packages/<name>/` | the library: `package.json` (marked as a library), `tsconfig.json`, `src/index.ts`, a sample component (`greeting.mprx` and `greeting.ts`, written with the portable core so it runs on the web and the desktop) |
| `playground/` | an application that depends on the library the way a consumer does, with a layout for each target the library declares |
| `package.json`, `pnpm-workspace.yaml` | the workspace (npm, yarn and bun `workspaces`; pnpm's file) |

Add a component by writing `src/<name>.mprx` and `src/<name>.ts` (a `component(template, { props, events })`, as in an application), exporting it from `src/index.ts`, and writing its tag in the playground's layout. Then `vlx library build` and `vlx library check`.

**`vlx library build`** writes `dist/`: the TypeScript compiled to JavaScript with declarations (the contract of each component is the type `component()` gives it), and every `.mprx` and `.css` under `src/` copied beside the JavaScript. **Templates ship as source**: the application's build compiles them, because a template compiled against one version of the component model is stale against the next (the compiler is the consumer's). It needs `typescript` installed in the library.

**`vlx library check`** holds the package to what a consumer's build relies on:

| Code | What it found |
|---|---|
| `library-unmarked` | no `valance` export condition |
| `library-entry` | `exports["."]` has no `valance` file, or the file is not there (run the build) |
| `library-default` | another entry (`default`, `import`, `require`, `node`) that a tool without the condition would load, and meet a `.mprx` |
| `library-peer` | no peer dependency on `@valancex/common` |
| `library-side-effects` | `sideEffects` would drop the stylesheets from a bundle |
| `library-playground` and `library-playground-target` | no playground, or it does not build a target the package declares |
| `library-unused` | the package ships a template the playground never writes, so no target has checked it |
| anything else | the playground's own `vlx check` problems, under `../../playground/` |

Every target the package declares is checked by building the playground for it. A target you do not declare is not claimed.

## Write a component

A component is a template and a contract, as in an application:

```ts
// src/data-list.ts
import { component, snippet } from "@valancex/common";
import { Schema } from "effect";
import template from "./data-list.mprx";

export const Row = Schema.Struct({ id: Schema.String, label: Schema.String, detail: Schema.String });

export const dataList = component(template, {
  props: { items: Schema.Array(Row), row: snippet(Row) },
  events: {},
});
```

```
<!-- src/data-list.mprx -->
<ul>{#each items as item (item.id)}<li>{@render row(item)}</li>{/each}</ul>
```

* A **prop** is a schema; an optional one is `Schema.UndefinedOr(…)`, or `field(schema, default)` when it has a default. An **event** names the payload it carries (`change: Schema.String`).
* **A part the caller draws** is a snippet prop: `snippet(Row)` declares `row`, the template writes `{@render row(item)}`, and the caller passes `{#snippet row(r)}…{/snippet}` inside the tag. Content between the tags is `children: snippet()`, rendered with `{@render children()}`.
* **State the component keeps for itself** (an open panel, the chosen tab) is a `unit`, one per occurrence. A field the caller may also hold is `controllable`: it needs an optional prop of the same name, and the unit then follows the prop when it is written (`open={…}` with `on.change`). The state type of a command is **annotated** (`run: (state: State, …) => …`); TypeScript does not infer it through `unit()`.

```ts
type State = { readonly open: boolean };

export const disclosure = component(template, {
  props: { label: Schema.String, open: Schema.UndefinedOr(Schema.Boolean), children: snippet() },
  events: { change: Schema.Boolean },
  unit: unit({
    state: { open: field(Schema.Boolean, false) },
    controllable: ["open"],
    commands: { toggle: unitCommand({ params: {}, run: (state: State) => ({ open: !state.open }), raises: { change: (next: State) => next.open } }) },
  }),
});
```

* The template writes only what the targets share (the portable core) unless the package says `targets: ["web"]`; `vlx library check` finds the rest.
* There is no index in `{#each}` and no way to take a list's length in a template: a component that needs either takes it as a prop.

## What a library declares

Two things in `package.json`:

```json
{
  "name": "acme-ui",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "valance": "./dist/index.js" }
  },
  "sideEffects": ["**/*.css"],
  "peerDependencies": { "@valancex/common": "^0.15.0", "effect": ">=3.10.0 <4" },
  "valance": { "kind": "components", "targets": ["web", "desktop"], "styles": ["./dist/badge.css"] }
}
```

* **The export condition `valance` is what marks a library.** It is the only thing the build looks for. With it, the application's build processes the package (the bundler loads it instead of Node, which does not know `.mprx` or `.css`) and resolves it by that condition. Keep no `default` that points at something else.
* **The `valance` field is metadata**, never a pointer to the entry:

| Key | Meaning |
|---|---|
| `kind` | `"components"` (default) or `"theme"` |
| `targets` | the targets the templates are written for: `"web"`, `"desktop"`. Default: both |
| `styles` | stylesheets inside the package, put in the library layer (web) |
| `theme` | for `"theme"`: the package's `theme.json` |

A wrong field is reported at the package's `package.json` (`library-field`), where its author can act, and a package with a `valance` field but no condition is told so (`library-unmarked`).

**What breaks consumers** (so, a new major version once the library is 1.0, a new minor before): removing an export, a component, a prop or an event; changing a prop's type to one that no longer accepts what it did; dropping the peer on `@valancex/common`. A library declares `@valancex/common` as a **peer** dependency, so an application has one copy of the framework.

## Targets

`targets` says which vocabularies the library's templates are written for. A template that uses only the portable core (`column`, `row`, `heading`, `text`, `button`, `checkbox`, `textfield`, and the other portable primitives in [the primitives](primitives.md)) runs on every target; one that uses a web tag (`div`, `span`, `section`) is web only. Declare what is true: `vlx library check` builds the playground for each target you declare and reports a tag the target does not have, inside your template, where you can fix it.

A library component cannot add a primitive: it composes the existing ones. A new primitive goes through the specification process ([the primitives](primitives.md)).

## Styles

A library lists its stylesheets in `valance.styles`. The build collects them into the **library layer** (`@layer vlx-library`), below the theme and the application's own CSS, so a theme or an application rule wins without raising its specificity. They are the web's; a window is drawn from the theme's values. Declare `"sideEffects": ["**/*.css"]`, or a bundler may drop them. A stylesheet is read as text and wrapped: a relative `url()` in it is not rewritten (put assets in `data:` URLs or leave them to the application).

Take colors, spacing and type from the theme by its custom properties (`var(--vlx-color-accent)`, `var(--vlx-space-2)`), so the library follows the application's theme. Rules reach a primitive only through its `data-vlx` hook, never a class: a rule for your own web-only element uses a class you choose, prefixed with the library's name.

## Theme packages

A package whose `valance` field has `"kind": "theme"` ships a theme as source: the same files as a project's `theme/` directory (a `theme.json`, token documents in the Design Tokens format and recipes). A project uses it by name in `valance.json`:

```json
{ "name": "Notes", "theme": "acme-theme" }
```

```json
{
  "name": "acme-theme",
  "exports": { ".": { "valance": "./index.js" } },
  "valance": { "kind": "theme", "theme": "./theme/theme.json", "targets": ["web", "desktop"] }
}
```

Write the package's `theme/` directory as [Themes](themes.md) describes it for a project (`vlx init` does not write one: a project with none uses the default theme), add the `valance` field above and an `index.js` that exports nothing (`export {};`; the condition needs an entry), and list `theme` and `index.js` in `files`. `vlx library check` holds it to the same rules as a component library (it checks the files the theme names, not a playground).

`vlx theme check` reports it as the project's theme (its contrast, and what each target applies and ignores); a project with both this setting and a `theme/` directory is refused (`theme-conflict`), and one that names a package that is not an installed theme package is told so (`theme-package`). Recipes are for the primitives ([Themes](themes.md)); a theme package cannot add a recipe for a library's own component.

## Names, collisions and overrides

Tier 2: nothing here until a name is taken.

* A component's tag is its template's file name. Two components of one name (two libraries' `disclosure`, or a library component named like a built-in such as `heading`) are a compile error that names both qualified ids. Resolve it by saying which one the tag means:

```ts
export default defineApp({
  layout: component(layout),
  components: [...acme.components, ...other.components],
  resolve: { disclosure: "other-ui/disclosure" },
});
```

The others of that name are left out of the program; a library template that writes the tag gets the one you chose (two libraries whose internals depend on different `disclosure`s need different names, so a library's internal components should have names of its own).

`vlx check`, `dev` and `build` write the qualified ids of the library components you list to `.valance/types/library-components.d.ts`, so an id `resolve` does not know is a type error in the editor. A project made by `vlx init` includes it (`"include": ["src", ".valance/types/*.d.ts"]` in `tsconfig.json`); add that to an older project's. Without it `resolve` takes any string, and the check still says `resolve-unknown`.

* To replace a component with your own, put your template of that name in `override`: it replaces a built-in and a library component alike. `override` with a name that is neither is an error.

## What a library cannot do yet

* **A recipe for its own component.** A theme maps a primitive's parts and variants to values; a library component takes its look from the primitives it composes and, on the web, from its stylesheet. A theme package styles the primitives.
* **Roles a primitive does not have.** A disclosure is a `button` and tabs are `toggle`s: the portable core has no `aria-expanded`, `tab`, `tablist` or `tabpanel`, so a screen reader hears a button and pressed buttons. Closing this takes primitives or hooks in the specification, not a library.
* **Windowed lists.** The `window` clause and the `scroller` primitive ([Bet 10](../direction/bets/collections.md)) are not built, so a virtualized list cannot be written from the public seams.
* **A library of primitives.** See Targets.
* **The desktop window's stylesheet.** `styles` are the web's.
* **Definition from a compiled library** in the editor: the editor goes from your template to a library component's contract; from a library whose templates are bundled away it does not.
