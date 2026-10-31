# docs-app: a VALANCE application

A small documentation site, written the way a VALANCE application is written. It is the canonical example of the developer experience proposed in [`docs/explanation/application-model/`](../../docs/explanation/application-model/); the machinery it hides is in [`@valancex/cli`](../../packages/cli) (read its README for the conventions).

```console
$ pnpm install
$ pnpm -w build   # from the repository root: builds the workspace packages this app runs on, once
$ pnpm dev        # http://localhost:5173/ , updates as you edit
$ pnpm build      # the site is in dist/
$ pnpm check      # mistakes in your files, with file and line
```

`vlx` and the packages it loads (`@valancex/common`, `@valancex/valance`, `@valancex/router`) are workspace packages that ship compiled JavaScript, and a fresh clone has none of it. Until the workspace is built, every command here stops with `ERR_MODULE_NOT_FOUND` for `packages/cli/dist/cli.js`. Build them again after you change anything under `packages/`. (`pnpm -w build` also builds this app and the other examples; to build only the packages, `pnpm --filter "./packages/*" build`.)

## What to read

| To change… | Edit |
|---|---|
| a page, or add one | [`content/`](content) (a file's path is its address) |
| the page around every page | [`src/layout.mprx`](src/layout.mprx) |
| a reusable piece | [`src/theme-toggle.mprx`](src/theme-toggle.mprx) (a component is a file; nothing registers it) |
| the look | [`src/styles.css`](src/styles.css) |
| the application's own state and commands | [`src/main.ts`](src/main.ts) (a theme and the command that toggles it) |
| a file served as it is | [`public/`](public) (`logo.svg`) |
| the name of the site | [`valance.json`](valance.json) |

Everything else is generated into `.valance/` (git-ignored) and `dist/`.

## Try this

1. `pnpm dev`, open the page, edit `content/index.md`, save.
2. Change a label in `src/theme-toggle.mprx`: the page reloads with it.
3. Change `--accent` in `src/styles.css`: the colour changes without a reload.
4. Break a link in a page: the terminal and the page both show `content/…md:LINE link-broken`.

## Checked

`pnpm typecheck`; `pnpm test:smoke` builds the site, serves it as a static host does and drives it in Chromium (direct loads, in-place navigation, Back and Forward, a link to a heading on another page, the application's command, the 404 page, the stylesheet), then runs `vlx dev` on a scratch copy and edits it (Markdown, a component, a stylesheet, a mistake and its fix, a new page, a configuration change).
