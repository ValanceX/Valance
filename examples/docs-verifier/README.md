# docs-verifier — the features verifier

A thin vertical slice of a documentation site (Effect-docs style), built on the
**development branches** of Mesh, Port and Valance. Its job is not to be the
docs site; it is to exercise the ecosystem's features in one realistic app and
record where composing it is awkward (`FINDINGS.md`).

When the features are mature enough, this grows into the polished docs site.
After that, a more complex specialised app takes over as the verifier.

See `ROADMAP.md` for where this is going (a complete, styled, statically generated documentation site) and `EXTERNALS.md` for the pieces that are deliberately outside VALANCE and plug in through its seams.

## Sites

The kit (everything outside `sites/`) builds any number of sites, all the same way. A site is a directory under `sites/` that holds **data and no code**: a `site.json`, its markdown, the examples its pages show, and optionally a theme.

| Site | Is | Shows |
|---|---|---|
| `docs` | documentation: sections, an outline beside each page, a pager | the original verifier |
| `blog` | posts newest first, an index, a page of tags and one per tag, a feed | a layout that is one column with a date, author and tags |
| `landing` | one page at `/` with a hero and cards, the full width | markdown containers (`::: hero`, `::: cards`) |
| `handbook` | documentation in two versions (`v2` at the root, `v1` under `/v1`) and two languages (`fr` under `/fr`) | switchers, `hreflang`, canonical addresses, a translated interface |

```
SITE=blog pnpm build        # content, views, page bundle, the static site in dist/blog (default SITE=docs)
SITE=blog pnpm start        # serve dist/blog as a static host does (start:ssr renders per request)
pnpm build:all              # every site in sites/
```

`site.json`:

| Field | Meaning |
|---|---|
| `name`, `footer` | the site's name (the brand and the end of every title) and the words at the bottom |
| `base`, `url` | where it is served from (`/` or `/docs-site/`) and the origin it is published at (for the sitemap, absolute canonical addresses and the feed) |
| `header` | links at the top: `{ "label", "href", "labels": { "fr": "…" } }` |
| `defaultLocale`, `locales` | the languages: `{ "code", "name", "ui": { … } }`; `ui` gives the words of the interface in that language (the keys are in `model/ui.ts`), the rest stay English |
| `collections` | the site's pages: `{ "name", "dir", "path", "layout", "sections"?, "versions"?, "list"?, "feed"? }` |

A collection's `layout` is `doc`, `post`, `landing` or `list`; `sections` fixes the order of its pages (otherwise every file in `content/<dir>` is a page, newest first for posts); `versions` (newest first) are directories, the first served without a prefix; `list` generates an index and, with `"tags": true`, the tags; `feed` writes `feed.xml`. A translation of `name.md` is `name.fr.md` beside it. A page's front matter is `title`, and `description`, `date`, `author`, `tags` and `layout`.

Links in content are written as `/docs/guides/state`, without a language or version: they go to the page in the reader's own language and version, or to the nearest that exists, and a link to nowhere fails the build. `/v1/docs/x` names a version; `latest:/docs/x` names the newest.

A theme (`sites/<site>/theme.css`) may declare custom properties and nothing else (`test/sites.test.ts` checks it).

## Layers

```
sites/     one directory per site      data only: site.json, content/*.md, theme.css, and snippets/*.ts (TypeScript, compiled
                                       with the project and included by `file=`)
model/     Block, Page, Site schemas   imports effect only
tooling/   markdown -> generated site  imports model, node:*
app/       state, routes, scope,       imports effect, @valancex/valance core, model
           commands, application       (no target names)
views/     .mprx templates             no code
styles/    the stylesheet              no code; web/page.ts imports it, the build hashes it
web/       compile, SSR, browser,      may import app, model, Valance, Mesh, Port, Node
           plugins (kit, router,       (not tooling)
           seo), server
```

`test/boundaries.test.ts` enforces these rules by scanning imports.

## Setup

The verifier runs on the **prepared** set: VALANCE 0.8, NEXUS 0.12.2, PORT Web 0.4.1 (and MESH 0.10 from the registry, unchanged). Until that set is released, `pnpm install` in this directory cannot resolve them; run against packs of the checkouts, which is also how a set of releases is validated before it is published:

```
scripts/build-packs.sh                      # builds and packs Nexus, Port Web and Valance from the sibling checkouts into ./.packs
node scripts/with-local-packs.mjs           # copies the verifier to ./.work, installs against the packs, then: typecheck, build, test
node scripts/with-local-packs.mjs --only test:principles
node scripts/with-local-packs.mjs --only build --smoke    # builds, then the Chromium smoke tests
```

Needs sibling checkouts `../../../Nexus` and `../../../Port` (relative to this directory). The work directory is kept between runs; the install repeats only when a pack changes.

Inside `./.work` (or any install against the packs):

```
pnpm build         # content, views (program), page bundle (script and stylesheet), the static site in dist/site
pnpm test          # unit + incremental (update/patch, diff/updateChanges) tests
pnpm test:smoke    # Chromium: hydrate, navigate, Back, theme, small screen, composite event -> command
pnpm start         # serve dist/site as a static host does
pnpm start:ssr     # the same site rendered per request (opt-in)
pnpm test:budget   # a generated 500-page site: document, content file and export costs
pnpm test:visual   # screenshots of each site against the last run (baselines are per machine; UPDATE_VISUAL=1 to take them again)
pnpm test:smoke    # includes the accessibility (axe) and layout gates on all four sites
```

## What it verifies

- Composites (`layout`, `block`, `callout`, `code-block`, `runs`, `inline`) with **no declared contract**: the compiler infers them, including an event forwarded through two composite levels to a command.
- A named slot (`layout`'s `nav`, filled by `page`) beside the default slot, and `mesh-switch` choosing a block's kind.
- SSR + hydration + history navigation (`Web.run`, `renderToHtml`).
- Valance 0.8's seams: the tags, the URL policy and the document head are three plugins; the document writes no title and no style of its own, and the browser keeps the same head in step (`docs/V1_CONTRACT.md` §19).
- Static delivery: each page's content is its own file, fetched when the reader goes there; a document is its page and the site's map; the site is exported (documents, content files, 404, sitemap, robots) under a base, and the same bytes are rendered per request when that is wanted.
- The content model: a closed union of block kinds; markdown with anchors, tables, lists, callouts, code with titles and groups, build-time highlighting, and examples that are compiled; a build that fails, with file and line, on a broken link or an example that is not there.
- Capabilities: the clipboard, a store and the search index are asked for by name (`app/capabilities.ts`) and supplied by the platform (`web/platform.ts`); a command handles their absence in state. Search, remembered choices, an outline that follows the reader.
- Style loading: one hashed stylesheet built from `styles/`, linked in the head before the page is drawn, with light, dark and system themes, a small-screen menu and `aria-*` state, checked in real Chromium.
- The `update` + Port `patch` path and the `diff` + `updateChanges` path against a
  fresh draw at every step, directly (unit) and through VALANCE 0.7, which now draws only what
  changed: the smoke test compares the page after in-place navigation with the server's HTML.
