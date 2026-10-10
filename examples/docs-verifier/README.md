# docs-verifier — the features verifier

A thin vertical slice of a documentation site (Effect-docs style), built on the
**development branches** of Mesh, Port and Valance. Its job is not to be the
docs site; it is to exercise the ecosystem's features in one realistic app and
record where composing it is awkward (`FINDINGS.md`).

When the features are mature enough, this grows into the polished docs site.
After that, a more complex specialised app takes over as the verifier.

See `ROADMAP.md` for where this is going (a complete, styled, statically generated documentation site) and `EXTERNALS.md` for the pieces that are deliberately outside VALANCE and plug in through its seams.

## Layers

```
content/   markdown + nav.json         data only, no code
snippets/  the examples the content    TypeScript, compiled with the project (tsc); included by `file=`
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
pnpm build         # content, server, page bundle (script and stylesheet), views
pnpm test          # unit + incremental (update/patch, diff/updateChanges) tests
pnpm test:smoke    # Chromium: hydrate, navigate, Back, theme, small screen, composite event -> command
pnpm start         # serve the built site
```

## What it verifies

- Composites (`layout`, `block`, `callout`, `code-block`, `runs`, `inline`) with **no declared contract**: the compiler infers them, including an event forwarded through two composite levels to a command.
- A named slot (`layout`'s `nav`, filled by `page`) beside the default slot, and `mesh-switch` choosing a block's kind.
- SSR + hydration + history navigation (`Web.run`, `renderToHtml`).
- Valance 0.8's seams: the tags, the URL policy and the document head are three plugins; the document writes no title and no style of its own, and the browser keeps the same head in step (`docs/V1_CONTRACT.md` §19).
- The content model: a closed union of block kinds; markdown with anchors, tables, lists, callouts, code with titles and groups, build-time highlighting, and examples that are compiled; a build that fails, with file and line, on a broken link or an example that is not there.
- Capabilities: the clipboard, a store and the search index are asked for by name (`app/capabilities.ts`) and supplied by the platform (`web/platform.ts`); a command handles their absence in state. Search, remembered choices, an outline that follows the reader.
- Style loading: one hashed stylesheet built from `styles/`, linked in the head before the page is drawn, with light, dark and system themes, a small-screen menu and `aria-*` state, checked in real Chromium.
- The `update` + Port `patch` path and the `diff` + `updateChanges` path against a
  fresh draw at every step, directly (unit) and through VALANCE 0.7, which now draws only what
  changed: the smoke test compares the page after in-place navigation with the server's HTML.
