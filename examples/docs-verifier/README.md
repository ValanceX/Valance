# docs-verifier — the features verifier

A thin vertical slice of a documentation site (Effect-docs style), built on the
**development branches** of Mesh, Port and Valance. Its job is not to be the
docs site; it is to exercise the ecosystem's features in one realistic app and
record where composing it is awkward (`FINDINGS.md`).

When the features are mature enough, this grows into the polished docs site.
After that, a more complex specialised app takes over as the verifier.

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

- `mesh-slot` and composites (`layout`, `block`, `callout`, `code-block`), including
  an event forwarded through two composite levels to a command.
- SSR + hydration + history navigation (`Web.run`, `renderToHtml`).
- The `update` + Port `patch` path and the `diff` + `updateChanges` path against a
  fresh draw at every step (Valance 0.6.0 does not use them yet).
