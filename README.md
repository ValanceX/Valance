<h1 align="center">
  <img src="docs/assets/valance-logo.svg" alt="Valance logo" width="120"><br>
  Valance
</h1>

<p align="center">
  Build apps in TypeScript where one state drives the whole screen.<br>
  Write it once. Run it in the browser, render it on the server, open it in a native window, test it without any of them.
</p>

<p align="center">
  <a href="#quick-start"><strong>Quick start</strong></a> ·
  <a href="#learning-path"><strong>Learn</strong></a> ·
  <a href="docs/use/README.md"><strong>API reference</strong></a> ·
  <a href="https://github.com/ValanceX/Valance/issues">Report an issue</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@valancex/valance"><img src="https://img.shields.io/npm/v/@valancex/valance?color=7C5CFF" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/@valancex/valance"><img src="https://img.shields.io/npm/l/@valancex/valance" alt="license"></a>
  <img src="https://img.shields.io/node/v/@valancex/valance" alt="node version">
</p>

<hr>

> Valance is pre-1.0. The API may change between minor releases; every change is listed in the [release notes](docs/releases/).

## Start

You need [Node.js](https://nodejs.org) 22 or newer. The `vlx` command makes, runs and builds Valance applications:

```console
$ npm install -g @valancex/cli
$ vlx init my-app --web
$ cd my-app && npm run dev
```

Open the address it prints. Edit a Markdown file in `content/` and save: the page reloads with your change. `npm run build` writes the finished site to `dist/web/`, for any host that serves files.

`vlx init` asks for what it needs, installs the dependencies and makes this:

| | |
|---|---|
| `content/` | Your pages, in Markdown. A file's path is its address. |
| `src/layout.mprx` | The shell around every page, in a small markup language. |
| `src/main.ts` | Your components, your state and the commands that change it. |
| `src/styles.css` | The look. |

You write no compiler step, server, hydration script or bundler configuration.

## One application, more than one target

The state, the commands and the content are written once; each target has its own templates, drawn with that target's vocabulary:

```console
$ vlx init my-app --web --desktop     # or add one later: vlx generate target desktop
$ cd my-app && npm run dev            # serves the site and opens the window
$ npm run build                       # dist/web/ and dist/desktop/
$ vlx package --desktop --archive     # one executable beside the window, as a .tar.gz or .zip (unsigned)
```

The desktop window is the [Desktop PORT](https://github.com/ValanceX/Port), built from its source for now (`cargo install --git https://github.com/ValanceX/Port valancex-port-desktop --bin vlx-window`). How it was designed, what it found and what is left: [`docs/application-model/MULTI-TARGET-PLAN.md`](docs/application-model/MULTI-TARGET-PLAN.md); how navigation, keys and stored state work on each target: [`NAVIGATION.md`](docs/application-model/NAVIGATION.md).

## The editor

The **VALANCE** extension for VS Code ([`editors/vscode`](editors/vscode)) highlights `.mprx` templates and, with the project's own `vlx` and `@valancex/mesh-lsp`, shows diagnostics, hover, completion, go to definition, formatting and the connections between a template and the code that feeds it. Neovim and Helix can use the same language server.

## The `vlx` command

Everything you do to a Valance application starts here.

| Command | Does |
|---|---|
| `vlx init [name]` | Makes a new application |
| `vlx dev` | Serves it and rebuilds as you edit |
| `vlx build` | Writes the site to `dist/web/` |
| `vlx check` | Finds mistakes in your files without building |
| `vlx info` | Says what the project is: how pages are delivered, every route and its file, the styles, the components, the tags (`--json` for tools) |
| `vlx package --desktop` | Packs the desktop engine and its window (`--archive` for one file) |
| `vlx generate page <path>` | Adds a Markdown page |
| `vlx generate component <name>` | Adds a component and registers it |
| `vlx help [command]` | Says what a command does |

[**The CLI guide**](packages/cli/README.md) covers the project layout, components, state and commands.

## Learning path

| | Step | You'll learn |
|---|---|---|
| **1** | [The CLI guide](packages/cli/README.md) | Pages, a layout, components, state and commands: the application model |
| **2** | [Your first application](docs/learn/first-application.md) | The counter written without the CLI, line by line: the engines Valance composes, running in a browser, on a server and in tests |
| **3** | [State, views and events](docs/learn/state-views-events.md) | A two-screen inbox: switching screens, commands that take input, URLs |
| **4** | [Async work](docs/learn/async-work.md) | Waiting for data, loading and failure as state, cancelling, ignoring out-of-date answers |
| **5** | [API reference](docs/use/README.md) | Every export, by name |
| **6** | [The contract](docs/V1_CONTRACT.md) | Exact behavior, lifecycle and error handling, for when you need to be sure |

The [full learning path](docs/learn/README.md) has startup work, mounting and hydration and a table of common tasks. How Valance is built is in [`docs/understand`](docs/understand/README.md); you do not need it to build applications.

## Packages

| Package | Is |
|---|---|
| [`@valancex/cli`](packages/cli) | The `vlx` command (a development tool) |
| [`@valancex/common`](packages/common) | What `src/main.ts` imports (`defineApp`, `component`, `field`), and the runtime a built application runs |
| [`@valancex/valance`](packages/valance) | The composition boundary over NEXUS, MESH and PORT, for embedding Valance in an application of your own |
| [`@valancex/router`](packages/router) | Routes, guards, programmatic navigation and the list of places visited |

## Examples

- [`examples/docs-app`](examples/docs-app): the application model in about 200 authored lines: content, a layout, a component, a stylesheet.
- [`examples/docs-site`](examples/docs-site): a runnable app on the published `@valancex/valance` package, without the CLI: links, search, URLs, server rendering and hydration.
- [`examples/todo-multi`](examples/todo-multi): one to-do application for the web and a native window: shared state, commands and components, each target's own layout.
- [`examples/todo`](examples/todo): a native desktop application written directly on `Native.run`.
- [`examples/tracer-web`](examples/tracer-web): the contract test suite (lifetimes, hydration, history, failure), with small fixture apps. It is the evidence behind the contract, not a model application.

## Releases, contributing, license

Release notes for every version are in [`docs/releases/`](docs/releases/). Bug reports and pull requests are welcome on [GitHub](https://github.com/ValanceX/Valance/issues); to work on Valance itself, read [CONTRIBUTING.md](CONTRIBUTING.md). [MIT](packages/valance/package.json).
