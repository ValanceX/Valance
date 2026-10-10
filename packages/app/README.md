# @valancex/app

> **Provisional and unpublished.** The name, the conventions and the `defineApp` API are this cycle's proposal (see [`docs/application-model/`](../../docs/application-model/)). Use it inside this workspace; it is not on npm.

The VALANCE application model and the commands that run it: you write **content**, a **layout**, **components** and **styles**; `valance dev` serves them as you edit and `valance build` produces a website. You do not write a compiler step, a manifest, a server, a hydration script or a bundler config.

```console
$ valance dev       # serve the project, rebuild as files change
$ valance build     # write the site to dist/
$ valance check     # find mistakes in your files without building (--json for tools)
```

The worked example is [`examples/docs-app`](../../examples/docs-app): about 200 lines of authored files.

## How do I create an application, run it, and change a page?

1. A project is a directory with a **`valance.json`**:
   ```json
   { "version": 1, "name": "Notes" }
   ```
   and a `package.json` that depends on `@valancex/app` and has `"dev": "valance dev"`, `"build": "valance build"`.
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
| `src/layout.mprx` | The shell around every page. Optional (a default ships). | you |
| `src/*.mprx` | Your components, each named by its file (`src/callout.mprx` is `<callout>`). A file named like a built-in (`runs`, `block`, `heading`…) replaces it. | you |
| `src/**/*.css` | Styles. Every stylesheet is loaded. | you |
| `src/main.ts` | Optional. `defineApp`: state of your own and the commands that change it. | you |
| `.valance/` | Generated: content, compiled templates, the entries, and for editors `manifest.json` (what a template may use) and `editor.json` (which file is which component). Git-ignored by a `.gitignore` inside it. | the tools |
| `dist/` | The built site. | the tools |

Settings are validated, unknown keys are errors, and editors can use the JSON Schemas in `schemas/` (`"$schema": "./node_modules/@valancex/app/schemas/valance.schema.json"`).

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

Templates are MPRX. A layout reads these names (the framework's) and any field of your state:

| Name | Is |
|---|---|
| `site`, `home` | The application's name; the first page's address |
| `title`, `description`, `found` | The current page; `found` is false on the not-found page |
| `sections` | `[{ id, title, items: [{ id, href, label, current }] }]` navigation; `current` is `"page"` or `"false"` |
| `hasToc`, `toc` | The `##`/`###` headings of this page: `[{ id, href, label, level }]` |
| `blocks` | The page body. `<blocks items={blocks} />` draws it |
| `prev`, `next` | `{ href, label }`, empty `href` when there is none |

Tags you may use: `shell` (`class`, `theme`), `div`, `header`, `footer`, `nav` (`class`, `label`), `aside`, `section`, `article`, `main` (`id`, `tabindex`), `h1`–`h3` (`id`), `para`, `quote`, `list`, `olist`, `item`, `pre`, `code`, `strong`, `em`, `span`, `image`, `a` (`href`), `link` (`href`, `class`, `current`), `button` (`class`, `pressed`, `on.click`), plus your components and the built-ins (`blocks`, `block`, `heading`, `list-block`, `list-items`, `runs`, `inline`). A prop a tag declares must be written wherever the tag is used; that is why there are many narrow tags rather than a few wide ones. The attribute each prop becomes is in [`src/primitives.ts`](src/primitives.ts).

A component is a file; nothing registers it. One that nothing uses is an error (the compiler would refuse it).

## State and commands

```ts
// src/main.ts
import { defineApp, Schema } from "@valancex/app";

export default defineApp({
  state: { schema: Schema.Struct({ theme: Schema.Literal("light", "dark") }), initial: { theme: "light" } },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
  }),
});
```

`theme` is now a name the layout reads (`<shell theme={theme}>`) and `toggleTheme()` a command it runs (`on.click={toggleTheme()}`). A component forwards an event (`on.click={toggle()}`) and its user binds it (`<theme-toggle on.toggle={toggleTheme()} />`). A state field may not reuse a framework name (`site`, `title`, `blocks`…), and `go` is the framework's command. Both are errors that say so.

## What `valance dev` does when you save

| You change | It does |
|---|---|
| `content/**` | rebuilds the content, reloads the page |
| `src/*.mprx`, `src/main.ts` | recompiles the templates, reloads the page |
| `src/**/*.css` | updates the style in the open page, no reload |
| `public/**` | reloads |
| a new or removed stylesheet or `src/main.ts` | rewrites the entry, reloads |
| `valance.json`, `valance.web.json` | restarts the server (the name and the base are fixed at startup) |

A mistake leaves the last good build serving and appears in the terminal and as an overlay in the page, as `file:line:column code: message`. Fixing it reloads the page. There is no hot swap of the compiled templates yet: a reload is the correct, reliable update, and the browser keeps its address.

## Diagnostics

Every mistake the tools can attribute to a file has one shape: `{ file, line, column, code, message }`. `valance check --json` prints them for editors and CI; codes are stable (`link-broken`, `md-html`, `front-unknown`, `config-unknown`, `template-unused`, `entry-export`, and the MESH compiler's own for templates).

## Limits (this cycle)

- The whole content model ships in the page bundle. Fine for tens of pages; a per-page payload is the known answer for hundreds (the documentation verifier does it).
- The Markdown dialect is a subset; no syntax highlighting, tables, callouts, tabs, search, versions or languages (the verifier has these as stand-ins).
- The tag table is fixed. An application cannot declare new primitives.
- Only the web target exists, delivered as a static site. No server rendering command, no `preview` command.
- Updates are reloads, not hot swaps (except styles).
