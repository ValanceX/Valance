# @valancex/cli

> **Pre-1.0.** Like VALANCE itself, the commands and conventions may change between minor releases; each change is in the [release notes](../../docs/releases/). The design record is [`docs/application-model/`](../../docs/application-model/).

`vlx` is the way into VALANCE: it makes an application, serves it as you edit, builds it, checks it and adds to it. The application model it runs: you write **content**, a **layout**, **components** and **styles**; `vlx dev` serves them as you edit and `vlx build` produces a website. You do not write a compiler step, a manifest, a server, a hydration script or a bundler config.

```console
$ vlx init my-app --web   # make a new application (asks what you leave out)
$ vlx dev       # serve the project, rebuild as files change
$ vlx build     # write the site to dist/
$ vlx check     # find mistakes in your files without building (--json for tools)
$ vlx generate component post-card    # add a component (or: generate page guide/intro)
$ vlx sync      # refresh the generated files (it runs by itself; rarely typed)
$ vlx help      # every command; `vlx help <command>` says more
```

The code an application's `src/main.ts` imports (`defineApp`, `component`, `field`) is a separate package, [`@valancex/common`](../common): the command line builds your application and is not part of it.

## Install `vlx` once, use it everywhere

`vlx` is a global command, like Angular's `ng`:

```console
$ npm install -g @valancex/cli      # or: pnpm add -g @valancex/cli
$ vlx --version
```

From a clone of this repository instead (after `pnpm install && pnpm build`):

```console
$ cd packages/cli
$ pnpm link --global                # or: npm link        (pnpm needs PNPM_HOME on your PATH: `pnpm setup`)
$ vlx --version
```

Either puts a `vlx` shim in your package manager's global bin directory, which has to be on your `PATH` (`npm config get prefix` shows npm's; on Windows the shim is `vlx.cmd` and works in PowerShell and cmd).

Inside a project, a global `vlx` does not build with its own copy: **`dev`, `build` and `check` run the `@valancex/cli` installed in that project** (the version its `package.json` names, with the MESH compiler and runtime that go with it), so the project builds the same wherever it is run from. `init` and `--help` need no project and are the global command's own. A project with no local install is run by the global one.

## Making an application: `vlx init`

```console
$ vlx init my-app --web          # the web target, every other question asked
$ vlx init                       # asks for the name and the targets too
$ vlx init my-app --yes          # no questions: every target, every default
```

In a terminal it asks (Ink), skipping whatever a flag already answered:

1. **the name** (`my-app`, or a path; it is made in a directory of that name, which must be empty or absent)
2. **the targets**: a multi-select of every target VALANCE supports (Space toggles, Enter confirms). Today that is the **web**; a target that arrives later is one more line in the list and one more flag
3. **web settings**: the base path (`/`, or `/docs/`) and where it will be published (optional; adds canonical links and a sitemap)
4. **the package manager** (npm, pnpm, yarn or bun; the one that ran `vlx` is preselected), whether to **install** the dependencies, and whether to **make a git repository**

Then it writes the project (the same files as `examples/docs-app`: a layout, a component with its stated contract, a stylesheet, two pages, typed template imports configured in `tsconfig.json`), installs, runs `git init`, and prints what to type next. The project depends on `@valancex/common` and `effect` (what `src/main.ts` imports) and has `@valancex/cli` as a dev dependency. An install that fails (no network) is a note, not an error: the project is written and the next step says what to run.

| Option | |
|---|---|
| `--web` | develop for the web (one flag per target) |
| `-y`, `--yes` | take every default, ask nothing (all targets) |
| `--pm <npm\|pnpm\|yarn\|bun>` | the package manager |
| `--no-install`, `--no-git` | skip those steps |
| `--base <path>`, `--url <address>` | the web target's settings |
| `--cli <spec>` | what to write for `@valancex/cli` in `package.json` (default: `^<version>`; from a clone of this repository, the path of this package) |
| `--plain` | no interface: plain text and never a question |

Without a terminal (a pipe, CI) it cannot ask, so it needs a name and a target: `vlx init my-app --web`.

## Adding to an application: `vlx generate`

```console
$ vlx generate page guide/getting-started   # content/guide/getting-started.md, with its front matter
$ vlx generate component post-card          # src/post-card.mprx and src/post-card.ts, registered in src/main.ts
```

`g` is short for `generate`. Nothing is overwritten: a name that is taken is refused. A component is made with a stated, empty contract (`props: {}`, `events: {}`) and a template that places its children (`<mesh-slot />`); it is imported in `src/main.ts` and listed in `components` (a `src/main.ts` that is not there is made). If `src/main.ts` is not written in the plain form `defineApp({ … })` the command cannot edit it, leaves it alone, and says what to add. Write `<post-card></post-card>` in a template to use the component: until a template writes its tag it is not part of the program.

## What the terminal shows

In a terminal `dev`, `build`, `check` and `init` draw an interface with [Ink](https://github.com/vadimdemedes/ink): `check` groups mistakes by file with line, code and message; `build` shows its stages and ends with what it wrote; `dev` shows the address, whether the project is sound, the mistakes that are open (the last good build keeps serving) and the latest changes. Anywhere else (a pipe, `CI`, `TERM=dumb`, `check --json`, or `--plain`) they print the plain text they always have, so scripts and editors read the same output as before.

Try it locally: [`docs/application-model/TRY-IT.md`](../../docs/application-model/TRY-IT.md). The worked example is [`examples/docs-app`](../../examples/docs-app): about 200 lines of authored files.

## How do I create an application, run it, and change a page?

1. A project is a directory with a **`valance.json`**:
   ```json
   { "version": 1, "name": "Notes" }
   ```
   and a `package.json` that depends on `@valancex/cli` and has `"dev": "vlx dev"`, `"build": "vlx build"`.
2. Add pages: **`content/index.md`** is the first page (`# Notes` and some text). Every other `.md` file under `content/` is a page.
3. `pnpm dev`. Open the address it prints. Edit a Markdown file and save: the page reloads with your change.
4. `pnpm build`. The site is in `dist/`; any host that serves files can serve it.

That is a complete application. It uses a built-in layout. Everything below is how you take over a part of it.

## The project

| Path | What it is | Edited by |
|---|---|---|
| `valance.json` | The project: its `name`. | you |
| `valance.web.json` | The web target: `base` (where it is served, default `/`) and `url` (where it is published; adds canonical links and `sitemap.xml`). Optional. | you |
| `content/**/*.md` | The pages. A file's path is its address. | you |
| `public/**` | Files served as they are (`public/logo.svg` is `/logo.svg`). | you |
| `src/layout.mprx` | The shell around every page. Optional: without a `layout` in `src/main.ts` a default ships. | you |
| `src/*.mprx` | Your components, each named by its file (`src/callout.mprx` is `<callout>`). Each is imported and registered in `src/main.ts`; a file nothing registers is an error. | you |
| `src/**/*.css` | Styles. Every stylesheet is loaded. | you |
| `src/main.ts` | Optional until you own a template. `defineApp`: the `layout`, your `components`, state of your own and the commands that change it. | you |
| `.valance/` | Generated: content, compiled templates, the entries, and for editors `manifest.json` (what a template may use) and `editor.json` (which file is which component). Git-ignored by a `.gitignore` inside it. | the tools |
| `dist/` | The built site. | the tools |

Settings are validated, unknown keys are errors, and editors can use the JSON Schemas in `schemas/` (`"$schema": "./node_modules/@valancex/cli/schemas/valance.schema.json"`).

## Content

```md
---
title: Writing pages        # else the first # heading
description: Shown in search results and link previews.
order: 2                    # position among its siblings (default 1000)
---

# Writing pages
```

- `content/index.md` → `/`, `content/guide/a.md` → `/guide/a`, `content/guide/index.md` → `/guide`. The first directory is the page's *section* in navigation. Pages sort by section, then `order`, then path.
- `content/404.md` (optional) is the page shown for an address that is not a page.
- **Markdown**: `#`–`###` headings, paragraphs, bulleted and numbered lists (one level), fenced code, `>` quotes, an image on its own line, and `**strong**`, `*emphasis*`, `` `code` ``, `[links](…)`. Anything else (raw HTML, tables, nested lists…) is an error naming the file and line, not something quietly mangled.
- **Links** are checked: `/guide/a`, `/guide/a#heading`, `./a.md`, `../index.md`, `#heading`, `https://…`, `mailto:`. A link that leads nowhere, or to a heading that does not exist, fails the build with `content/x.md:12 link-broken: …`. Addresses are written under the site's `base` for you.
- **Images**: `![alt](/logo.svg)` names a file in `public/` and is checked.

## Layout and components

Templates are MPRX. Conditional and repeated parts are blocks: `{#if cond}…{:else if cond}…{:else}…{/if}` and `{#each items as item (item.id)}…{/each}` (the key is required; a branch or body is one element, several are wrapped in a fragment; `mesh-if`, `mesh-each`, `mesh-switch`, `mesh-case` and `mesh-default` are retired and rejected with the block to write). A layout reads these names (the framework's) and any field of your state:

| Name | Is |
|---|---|
| `site`, `home` | The application's name; the first page's address |
| `title`, `description`, `found` | The current page; `found` is false on the not-found page |
| `sections` | `[{ id, title, items: [{ id, href, label, current }] }]` navigation; `current` is `"page"` or `"false"` |
| `hasToc`, `toc` | The `##`/`###` headings of this page: `[{ id, href, label, level }]` |
| `blocks` | The page body. `<blocks items={blocks} />` draws it |
| `prev`, `next` | `{ href, label }`, empty `href` when there is none |

Tags you may use: `shell` (`class`, `theme`), `div`, `header`, `footer`, `nav` (`class`, `label`), `aside`, `section`, `article`, `main` (`id`, `tabindex`), `h1`–`h3` (`id`), `para`, `quote`, `list`, `olist`, `item`, `pre`, `code`, `strong`, `em`, `span`, `image`, `a` (`href`), `link` (`href`, `class`, `current`), `button` (`class`, `pressed`, `on.click`), plus your components and the built-ins (`blocks`, `block`, `heading`, `list-block`, `list-items`, `runs`, `inline`). A prop a tag declares must be written wherever the tag is used; that is why there are many narrow tags rather than a few wide ones. The attribute each prop becomes is in [`src/primitives.ts`](src/primitives.ts).

## The components

Your application is the layout and the components you register in `src/main.ts`. Nothing under `src/` is part of it by being there.

```ts
// src/main.ts
import { component, defineApp } from "@valancex/common";
import layout from "./layout.mprx";
import themeToggle from "./theme-toggle.js";

export default defineApp({
  layout: component(layout),
  components: [themeToggle],
});
```

```ts
// src/theme-toggle.ts: the component states its own interface, where it is defined
import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./theme-toggle.mprx";

export default component(template, {
  props: { theme: Schema.Literal("light", "dark") },
  events: { toggle: Schema.Void },
});
```

- `import x from "./x.mprx"` names a template file; `component(x, …)` defines it. The tag is the file's name (`theme-toggle.mprx` is `<theme-toggle>`). Register it once, in `components`.
- **Which components a template uses is read from the template.** Write `<theme-toggle … />` in the layout (or in another component) and it is used; there is no list of uses to keep in step. A registered component no template writes yet is not part of the program, and is not an error. A file under `src/` that is not registered is an error (`template-unused`).
- **The contract.** `props` maps a prop name to its Effect Schema and `events` an event name to its payload Schema (`Schema.Void` is no payload). Declare either and the contract is exactly what you wrote (an omitted side is none), overriding inference; declare neither and MESH infers it from the template and where it is used. Schemas are converted by the same rules as state; a prop is optional when its schema admits `undefined`, and props have no defaults. A schema with no MESH type is a diagnostic at the declaration (`component-schema`). MESH reports an undeclared or missing prop, a prop of the wrong type and a handler for an undeclared event at the use. The layout takes no contract (`layout-contract`). That declared interface is where an editor takes you from `on.toggle=` or `theme=` at a use, and where *Find All References* starts.
- `override: [component(runs, { props: { spans: … } })]` replaces a built-in (`runs`, `heading`, …) with your template of the same name.
- `layout` is optional; without it the built-in layout draws the page. Its template must be named `layout.mprx`.

### Children and slots

A component places the content its caller writes inside it with `<mesh-slot />`, and may name several places:

```
<!-- src/card.mprx -->
<div class="card">
  <mesh-slot name="head" />
  <mesh-slot />
</div>

<!-- where it is used -->
<card>
  <mesh-fill slot="head"><para class="title">Title</para></mesh-fill>
  <para class="body">The body goes to the unnamed slot.</para>
</card>
```

The children are the caller's: `{x}` in them is the caller's `x`, never the card's. `vlx generate component` writes the single, unnamed slot for you. The rules (where a slot may be, what a fill is, the errors) are in MESH's [templates manual](https://github.com/ValanceX/Mesh/blob/main/docs/manual/templates.md#children-and-the-slot).

### Typed template imports

`vlx sync` (and `check`, `dev` and `build`) write `.valance/types/<template>.d.mprx.ts`, so a component's declaration is checked against the names its template uses: `component(template, { props: { thme: … } })` is a compile-time error. This needs two options in your `tsconfig.json`:

```json
{ "compilerOptions": { "allowArbitraryExtensions": true, "rootDirs": ["src", ".valance/types"] } }
```

Without them the import is untyped and nothing else changes. The types are regenerated by `vlx sync`, which runs by itself: after `install` (a new project's `prepare` script), after `vlx generate`, and as `dev`, `build` and `check` run; a project's `typecheck` script runs it first. You run it yourself only after changing a template with none of those running (an editor open without `vlx dev`, a template edited in another tool). Not covered: value-level agreement between a template and its component, literal values, exposing derived values, and props or events nothing uses.

Nothing is loaded lazily yet (a page ships one program).

## State and commands

```ts
// src/main.ts
import { defineApp, field } from "@valancex/common";
import { Schema } from "effect";

export default defineApp({
  // (and `layout`, if you own one: see above)
  state: { theme: field(Schema.Literal("light", "dark"), "light") },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
  }),
});
```

A state field is its type and its default in one declaration. Hand-building `state: { schema, initial }` is still accepted; giving both forms is the same definition error as a clash. `theme` is now a name the layout reads (`<shell theme={theme}>`) and `toggleTheme()` a command it runs (`on.click={toggleTheme()}`). A component raises an event (`on.click={toggle()}`, declared in `events`) and its user binds it (`<theme-toggle on.toggle={toggleTheme()} />`). A state field may not reuse a framework name (`site`, `title`, `blocks`…), and `go` is the framework's command. Both are errors that say so.

## What `vlx dev` does when you save

| You change | It does |
|---|---|
| `content/**` | rebuilds the content, reloads the page |
| `src/*.mprx`, `src/main.ts` | recompiles the templates, reloads the page |
| `src/**/*.css` | updates the style in the open page, no reload |
| `public/**` | reloads |
| a new or removed stylesheet or `src/main.ts` | rewrites the entry, reloads |
| `valance.json`, `valance.web.json` | restarts the server (the name and the base are fixed at startup) |

A mistake leaves the last good build serving and appears in the terminal and as an overlay in the page, as `file:line:column code: message`. Fixing it reloads the page. There is no hot swap of the compiled templates yet: a reload is the correct, reliable update, and the browser keeps its address.

## Editor support

`valance` writes `.valance/manifest.json` (what a template may use, your own components included) and `.valance/editor.json` (which file is which component), so an editor can run MESH's language server on your project without configuration. Add the server to the project, in the version of your MESH:

```console
$ pnpm add -D @valancex/mesh-lsp
```

The VS Code extension in [`editors/vscode`](../../editors/vscode) (not published yet) starts it, highlights `.mprx`, and shows `vlx check` mistakes in Markdown, config and `main.ts`. Neovim and Helix can use the same two files ([MESH's editor guide](https://github.com/ValanceX/Mesh/blob/main/docs/guides/editor-setup.md)).

## Diagnostics

Every mistake the tools can attribute to a file has one shape: `{ file, line, column, code, message }`. `vlx check --json` prints them for editors and CI; codes are stable (`link-broken`, `md-html`, `front-unknown`, `config-unknown`, `template-unused`, `entry-export`, and the MESH compiler's own for templates).

## Limits (this cycle)

- The whole content model ships in the page bundle. Fine for tens of pages; a per-page payload is the known answer for hundreds (the documentation verifier does it).
- The Markdown dialect is a subset; no syntax highlighting, tables, callouts, tabs, search, versions or languages (the verifier has these as stand-ins).
- The tag table is fixed. An application cannot declare new primitives.
- Only the web target exists, delivered as a static site. No server rendering command, no `preview` command.
- Updates are reloads, not hot swaps (except styles).
