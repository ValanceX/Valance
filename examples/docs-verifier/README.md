# docs-verifier — the features verifier

A thin vertical slice of a documentation site (Effect-docs style), built on the
**development branches** of Mesh, Port and Valance. Its job is not to be the
docs site; it is to exercise the ecosystem's features in one realistic app and
record where composing it is awkward (`docs/FINDINGS.md`).

When the features are mature enough, this grows into the polished docs site.
After that, a more complex specialised app takes over as the verifier.

> **Not the model for writing an application.** This is the evidence base: a kit that composes the engines by hand, four sites, and the friction record. The proposed way to *write* a VALANCE application, with `vlx dev` and `vlx build`, is [`examples/docs-app`](../docs-app) (see [`docs/application-model/`](../../docs/application-model/)); `docs/EXTERNALS.md` says which of this verifier's stand-ins that work has replaced and which remain.

See `docs/ROADMAP.md` for where this is going (a complete, styled, statically generated documentation site) and `docs/EXTERNALS.md` for the pieces that are deliberately outside VALANCE and plug in through its seams.

## Sites

The kit (everything outside `sites/`: `src/` and `build/`) builds any number of sites, all the same way. A site is a directory under `sites/` that holds **data and no code**: a `site.json`, its markdown, the examples its pages show, and optionally a theme.

| Site | Is | Shows |
|---|---|---|
| `docs` | documentation: sections, an outline beside each page, a pager | the original verifier |
| `blog` | posts newest first, an index, a page of tags and one per tag, a feed | a layout that is one column with a date, author and tags |
| `landing` | one page at `/` with a hero and cards, the full width | markdown containers (`::: hero`, `::: cards`) |
| `handbook` | documentation in two versions (`v2` at the root, `v1` under `/v1`) and two languages (`fr` under `/fr`) | switchers, `hreflang`, canonical addresses, a translated interface |

```
SITE=blog pnpm build        # the static site in dist/blog (default SITE=docs)
SITE=blog pnpm start        # serve dist/blog as a static host does (start:ssr renders per request)
pnpm build:all              # every site in sites/
```

`site.json`:

| Field | Meaning |
|---|---|
| `name`, `footer` | the site's name (the brand and the end of every title) and the words at the bottom |
| `base`, `url` | where it is served from (`/` or `/docs-site/`) and the origin it is published at (for the sitemap, absolute canonical addresses and the feed) |
| `header` | links at the top: `{ "label", "href", "labels": { "fr": "…" } }` |
| `defaultLocale`, `locales` | the languages: `{ "code", "name", "ui": { … } }`; `ui` gives the words of the interface in that language (the keys are in `src/model/ui.ts`), the rest stay English |
| `collections` | the site's pages: `{ "name", "dir", "path", "layout", "sections"?, "versions"?, "list"?, "feed"? }` |

A collection's `layout` is `doc`, `post`, `landing` or `list`; `sections` fixes the order of its pages (otherwise every file in `content/<dir>` is a page, newest first for posts); `versions` (newest first) are directories, the first served without a prefix; `list` generates an index and, with `"tags": true`, the tags; `feed` writes `feed.xml`. A translation of `name.md` is `name.fr.md` beside it. A page's front matter is `title`, and `description`, `date`, `author`, `tags` and `layout`.

Links in content are written as `/docs/guides/state`, without a language or version: they go to the page in the reader's own language and version, or to the nearest that exists, and a link to nowhere fails the build. `/v1/docs/x` names a version; `latest:/docs/x` names the newest.

A theme (`sites/<site>/theme.css`) may declare custom properties and nothing else (`tests/unit/sites.test.ts` checks it).

## Where things are

| You want to | Go to |
|---|---|
| add or edit a page | `sites/<site>/content/<collection>/…md`; list it in the collection's `sections` in `sites/<site>/site.json` (a post or a page in a collection with no `sections` needs no listing) |
| change the navigation, header, footer, languages, versions | `sites/<site>/site.json` |
| show a code example | `sites/<site>/snippets/*.ts`, included from a page with ```` ```ts file=snippets/… ```` |
| restyle one site | `sites/<site>/theme.css` (custom properties only) |
| change how every site looks | `src/styles/site.css` (one stylesheet: colour tokens, the bar, the frame, content, search, layouts) |
| change a template | `src/views/layout.mprx` (the shell), `page.mprx` (the page: sidebar, content, outline, pager), `content/*.mprx` (what is drawn inside a page: a heading, a callout, a code block, a table). A template is a component named by its file |
| change what a template can read | `src/app/scope/` (`contract.ts` is the list; `blocks.ts` fills a block; `navigation.ts` the sidebar, pager, switchers and header; `index.ts` the rest) |
| change what a reader can do (state, commands) | `src/app/state.ts`, `src/app/application.ts`; the URLs are `src/app/routes.ts` |
| add a block kind (a new thing markdown can say) | `src/model/site.ts` (the kind), `build/content/markdown.ts` (the syntax), `src/app/scope/blocks.ts` (the record), `src/views/content/` (the template), `src/styles/site.css` |
| change which element a tag becomes | `src/web/primitives.ts` |
| see the entry point | `src/main.ts` is what the browser runs; `build/cli/` are the build's commands (`prepare`, `site`, `serve`) |

The rest is not authored by hand: `.valance/` (the site's data, the compiled views and the compiled build tools) is generated and never committed; `dist/<site>/` is the finished site.

## Layout

```
sites/<site>/   AUTHORED  site.json, content/*.md, snippets/*.ts, theme.css       data only
src/            the kit: everything that is the same for every site
  main.ts         the browser entry
  model/          the shape of a site's data (Schemas)                            imports effect only
  app/            state, commands, routes, search; scope/ is what the view reads  imports model, effect, Valance, Nexus (no target names)
  views/          .mprx templates: layout, page, content/                         no code
  styles/         site.css                                                        no code
  web/            the web target: primitives, platform, browser behaviour,        imports app, model, Valance, Mesh, Port
                  plugins/ (kit, router, seo)
build/          Node, build time
  content/        a site's directory -> data: markdown, highlight, search index   imports model, node:*
  views.ts        templates -> the compiled program
  document.ts, export.ts, serve.ts, assets.ts, paths.ts
  cli/            prepare, site, serve: the commands behind `pnpm build` and `pnpm start`
tests/          unit/  smoke/ (Chromium)  principles/  budget/  visual/
docs/           ROADMAP, FINDINGS, PRINCIPLES, GRADUATION, EXTERNALS, STRUCTURE
scripts/        build-all, and the pre-release verification against local packs
.valance/       GENERATED  not committed
dist/<site>/    GENERATED  the finished site
```

`tests/unit/boundaries.test.ts` enforces the import rules above by scanning imports. `docs/STRUCTURE.md` records why the layout is this one (and what it deliberately does not have).

## Setup

```
pnpm install
pnpm build            # the site in dist/<site>: prepare (data + views), the page bundle, the static site
pnpm start            # serve dist/<site> as a static host does (start:ssr renders per request)
pnpm test             # unit
pnpm typecheck
```

There is no development server and no watch mode yet (`docs/EXTERNALS.md`, X2): a change is `pnpm build` and a reload. `pnpm build` runs the stages in order (compile the build tools, `prepare`, `vite build`, `site`); the other `build:*` and `start` scripts are those stages.

```
pnpm test:smoke       # Chromium: hydrate, navigate, Back, theme, small screen, accessibility (axe) and layout gates on all four sites
pnpm test:principles  # the API design principles, probed against Valance
pnpm test:budget      # a generated 500-page site: document, content file and export costs
pnpm test:visual      # screenshots of each site against the last run (baselines are per machine; UPDATE_VISUAL=1 takes them again)
```

To verify a set of packages that is prepared but not yet on the registry, build packs of the sibling checkouts and install against them (`../../../Nexus` and `../../../Port` relative to this directory):

```
scripts/build-packs.sh                      # packs Nexus, Port Web and Valance into ./.packs
node scripts/with-local-packs.mjs           # copies the project to ./.work, installs against the packs, then: typecheck, build, test
node scripts/with-local-packs.mjs --only build --smoke
```

## What it verifies

- Composites (`layout`, `block`, `callout`, `code-block`, `runs`, `inline`) with **no declared contract**: the compiler infers them, including an event forwarded through two composite levels to a command.
- A named slot (`layout`'s `nav`, filled by `page`) beside the default slot, and `mesh-switch` choosing a block's kind.
- SSR + hydration + history navigation (`Web.run`, `renderToHtml`).
- Valance 0.8's seams: the tags, the URL policy and the document head are three plugins; the document writes no title and no style of its own, and the browser keeps the same head in step (Valance's `docs/V1_CONTRACT.md` §19).
- Static delivery: each page's content is its own file, fetched when the reader goes there; a document is its page and the site's map; the site is exported (documents, content files, 404, sitemap, robots) under a base, and the same bytes are rendered per request when that is wanted.
- The content model: a closed union of block kinds; markdown with anchors, tables, lists, callouts, code with titles and groups, build-time highlighting, and examples that are compiled; a build that fails, with file and line, on a broken link or an example that is not there.
- Capabilities: the clipboard, a store and the search index are asked for by name (`src/app/capabilities.ts`) and supplied by the platform (`src/web/platform.ts`); a command handles their absence in state. Search, remembered choices, an outline that follows the reader.
- Style loading: one hashed stylesheet built from `src/styles/`, linked in the head before the page is drawn, with light, dark and system themes, a small-screen menu and `aria-*` state, checked in real Chromium.
- The `update` + Port `patch` path and the `diff` + `updateChanges` path against a
  fresh draw at every step, directly (unit) and through VALANCE 0.7, which now draws only what
  changed: the smoke test compares the page after in-place navigation with the server's HTML.
