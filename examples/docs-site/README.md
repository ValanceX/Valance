# docs-site: a real VALANCE example

A documentation site built on the **published** [`@valancex/valance`](https://www.npmjs.com/package/@valancex/valance) 0.5 (it installs the package from npm, not from this workspace): a home page and five documentation pages with a sidebar, previous and next links, an expandable section, code samples, and a **search box**. It is server rendered, takes over in the browser without reloading, and keeps the URL and the document title in step as you move around.

```console
$ pnpm install
$ pnpm --filter @valancex/docs-site build     # the browser bundle (vite) and the server (tsc)
$ pnpm --filter @valancex/docs-site start     # http://127.0.0.1:4173/   (PORT=… to change)
```

## What to read

Read the files in this order; together they are about 360 lines.

| File | What it shows |
|---|---|
| [`src/app.ts`](src/app.ts) | **The whole application**: state, `urlOf` / `stateOf` / `titleOf`, one view scope per screen, and three commands. `search` is a command that waits (`command.waiting`): loading, results and failure are state, a newer search supersedes an older one, and `wanted` drops an answer that arrives after the reader left the page. It imports `@valancex/valance` and `effect`'s `Schema`, and nothing else. |
| [`src/home.mprx`](src/home.mprx), [`src/doc.mprx`](src/doc.mprx) | The two screens, as MESH view descriptions: `<link href=…>` for navigation, `<field value=… on.input=…>` for the search box, `mesh-each` and `mesh-if` for repeated and conditional parts. |
| [`src/web.ts`](src/web.ts) | Where each tag is drawn: `link: Web.link`, `field: Web.textField`, the rest plain elements. The one declaration of the tags. |
| [`src/compile.ts`](src/compile.ts) | Build time: the MESH manifest is **derived** (`manifest` from `@valancex/valance/web/build`) from the tags, the scopes and the command table, so there is no manifest file to keep in step. |
| [`src/document.ts`](src/document.ts) | The server: a URL becomes a complete HTML document with `renderToHtml`; the document's `<title>` is the application's own `titleOf` for that state. |
| [`src/page.ts`](src/page.ts) | The browser: `Web.run` with `present: "hydrate"` and a `history` that handles link clicks, back and forward, and the title. The search service (a `fetch` of the server's `/api/search`) is the one thing the platform provides. |
| [`src/serve.ts`](src/serve.ts) | A 60-line `node:http` server: documents, the search endpoint, built assets, a 404. Not part of VALANCE: any server that can call `renderToHtml` will do. |

## What is checked

```console
$ pnpm --filter @valancex/docs-site typecheck
$ pnpm --filter @valancex/docs-site test          # the rendered document and title, the search, stale-answer handling (Node)
$ pnpm --filter @valancex/docs-site test:smoke    # builds the site, serves it, and drives it in real Chromium
```

The Chromium test loads a page, waits for hydration, types in the search box, follows a result by a plain click (one document load in total, the title follows), and goes back.

## Where this came from

The application is the documentation-site composition benchmark in [`examples/tracer-web`](../tracer-web) (see its [`FREEZE_GATE.md`](../tracer-web/src/docs-benchmark/FREEZE_GATE.md)), moved here and finished as an app you can run. `tracer-web` itself remains VALANCE's contract test suite: probes of lifetimes, hydration, history and failure, not a model application.
