# Your first application

> **TL;DR:** Make an application with `vlx init`, serve it with `vlx dev`, add a page with `vlx generate`, give it state and a command in `src/main.ts`, let `vlx check` catch a mistake, and build it with `vlx build`. You write no compiler step, manifest, server or bundler config.

## Prerequisites

* Node.js 22 or newer and a package manager (npm, pnpm, yarn or bun).
* Some TypeScript.

---

You will make a small site with a counter in its header. Every step uses `vlx`, the VALANCE command line. It writes and runs everything between your files and the browser.

## 1. Install `vlx`

```console
$ npm install -g @valancex/cli      # or: pnpm add -g @valancex/cli
$ vlx --version
```

You install it once. Inside a project, `vlx dev`, `build` and `check` run the copy of `@valancex/cli` that the project depends on, so the project builds the same on every machine. (Working from a clone of this repository? See [Install `vlx`](../../packages/cli/README.md#install-vlx-once-use-it-everywhere).)

## 2. Make the application

```console
$ vlx init notes --web
```

It asks a few questions, such as the base path, the package manager, whether to install and whether to make a git repository. Press Enter to take each default. (`--yes` skips the questions.) Then it writes the project, installs it and prints what to type next:

```
notes/
  valance.json            the application's name
  content/                the pages, as Markdown: a file's path is its address
    index.md
    404.md
    guide/getting-started.md
    guide/writing-pages.md
  public/logo.svg         served as it is
  src/
    main.ts               the application: its layout, components, state and commands
    layout.mprx           the page around every page
    theme-toggle.mprx     a component's template...
    theme-toggle.ts       ...and its interface
    styles.css            the look
```

Generated files go in `.valance/` and the built site in `dist/`. You never edit either.

## 3. Serve it

```console
$ cd notes
$ npm run dev
```

Open the address it prints. While it runs, save `content/index.md` with a new sentence and the page reloads with it. Save a colour change in `src/styles.css` and the page changes in place, with no reload. Leave `vlx dev` running for the rest of this page.

## 4. Add a page

```console
$ vlx generate page guide/counter
```

This writes `content/guide/counter.md`, front matter included. It appears in the sidebar under *Guide* at once. Edit it like any Markdown file. Links are checked: `[back](/guide/getting-started)` works, and a link to a page that does not exist is an error naming the file and line.

## 5. Give it state and a command

Open `src/main.ts`. It is the whole application, from the top:

```ts
export default defineApp({
  layout: component(layout),
  components: [themeToggle],
  state: {
    theme: field(Schema.Literal("light", "dark"), "light"),
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
  }),
});
```

**State** is what is true about the application. Each field gives its type and its default in one place. A **command** is the only way state changes: it takes the current state and returns the next one. Add a field and a command:

```ts
  state: {
    theme: field(Schema.Literal("light", "dark"), "light"),
    count: field(Schema.Number, 0),
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
    increment: command((state) => ({ ...state, count: state.count + 1 })),
  }),
```

Now `count` is a name a template can read and `increment()` is a command it can run. Put a button in the header of `src/layout.mprx`:

```
<header class="bar">
  <link class="brand" href={home} current="false">{site}</link>
  <button class="counter" pressed="false" on.click={increment()}>Clicked {count} times</button>
  <theme-toggle theme={theme} on.toggle={toggleTheme()} />
</header>
```

Save. The page reloads, and each click adds one. Go to another page: the count stays, because it is the application's state, not the page's.

Note what you did not do. You did not register an event handler, wire a store to the screen or tell anything to redraw. The screen is a function of the state, and VALANCE keeps it current.

## 6. Make a mistake on purpose

Change `{count}` to `{cout}` and save. The page keeps showing the last good build. The terminal and an overlay in the page both say:

```
src/layout.mprx:4:77 unknown-reference: unknown reference "cout": it isn't in the template's scope (did you mean "count"?)
```

Templates are checked against your state and commands. A misspelled command (`incremnt()`) is `unknown-command`, and a broken link is `link-broken`. Each is caught here, not by someone using the site. The same check runs without a server:

```console
$ vlx check          # every file, every mistake; --json for editors and CI
```

Fix the typo and the overlay goes away. For the same errors inside the editor as you type, install the [VS Code extension](../../editors/vscode). It also gives completion, and Ctrl-click from `increment()` to its command.

## 7. Build it

```console
$ npm run build
```

`dist/` is now a static site: HTML for every page, the browser program and a `_headers` file with a strict security policy. Any host that serves files can serve it.

## What you just used

| You did | It is | Learn more |
|---|---|---|
| `vlx init`, `vlx dev`, `vlx build` | the project's whole toolchain | [The CLI guide](../../packages/cli/README.md) |
| `content/**/*.md` | the pages; a path is an address | [Content](../../packages/cli/README.md#content) |
| `field(...)` in `state` | the application's state, one place for its truth | [State and commands](../../packages/cli/README.md#state-and-commands) |
| `command(...)` in `commands` | the only way state changes | [State and commands](../../packages/cli/README.md#state-and-commands) |
| `{count}`, `on.click={increment()}` | a template reading state and running a command | [Layout and components](../../packages/cli/README.md#layout-and-components) |
| `vlx check` | every mistake, with file, line and code | [Diagnostics](../../packages/cli/README.md#diagnostics) |

## Next steps

* [State, components and events](02-state-views-and-events.md): make your own components and build a to-do list in this project.
