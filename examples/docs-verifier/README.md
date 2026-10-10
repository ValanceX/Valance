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
model/     Block, Page, Site schemas   imports effect only
tooling/   markdown -> generated site  imports model, node:*
app/       state, routes, scope,       imports effect, @valancex/valance core, model
           commands, application       (no target names)
views/     .mprx templates             no code
web/       compile, SSR, browser, dev  may import app, model, Valance, Mesh, Port, Node
           server                      (not tooling)
```

`test/boundaries.test.ts` enforces these rules by scanning imports.

## Setup

The verifier runs on the released versions (MESH 0.10, PORT Web 0.4, NEXUS 0.12, VALANCE 0.7) from the registry. To verify a set that is prepared but not yet published, run it against packs, which is also how a set of releases is validated before it is published:

```
# in each of Mesh/packages/mesh-compiler, Mesh/packages/mesh-runtime, Port/packages/port-web, Nexus, Valance/packages/valance
npm run build && npm pack --pack-destination <packs>
# then, here
node scripts/with-local-packs.mjs <packs> --smoke
```

The alternative below links the sibling Mesh and Port checkouts and takes VALANCE and NEXUS from the registry, which is the pre-0.7 setup.

## Linking the checkouts

Needs sibling checkouts `../../../Mesh` and `../../../Port` (relative to this
directory) on the development branch; they are `link:`ed through `pnpm.overrides`.
Nexus is deliberately not linked: a second copy would duplicate `effect`.

```
pnpm install --ignore-scripts
pnpm build         # content, server, page bundle, views
pnpm test          # unit + incremental (update/patch, diff/updateChanges) tests
pnpm test:smoke    # Chromium: hydrate, navigate, Back, composite event -> command
pnpm start         # serve the built site
```

## What it verifies

- Composites (`layout`, `block`, `callout`, `code-block`, `runs`, `inline`) with **no declared contract**: the compiler infers them, including an event forwarded through two composite levels to a command.
- A named slot (`layout`'s `nav`, filled by `page`) beside the default slot, and `mesh-switch` choosing a block's kind.
- SSR + hydration + history navigation (`Web.run`, `renderToHtml`).
- The `update` + Port `patch` path and the `diff` + `updateChanges` path against a
  fresh draw at every step, directly (unit) and through VALANCE 0.7, which now draws only what
  changed: the smoke test compares the page after in-place navigation with the server's HTML.
