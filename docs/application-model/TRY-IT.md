# Try it locally

Everything here runs from a clone; nothing is published. You need **Node 22 or newer**, **pnpm 10** (`corepack enable` gives you one), and **git**. Part 3 also needs **VS Code 1.90 or newer**.

The package is `@valancex/cli` and the command is `vlx` (like `npx`, `bunx`). A project is a directory with a `valance.json`.

## 1. Get the code and build it

```console
$ git clone https://github.com/ValanceX/Valance.git
$ cd Valance
$ git checkout claude/fervent-ptolemy-gbtc8u
$ pnpm install
$ pnpm build
```

`pnpm build` also builds `examples/docs-app` with `vlx build`, so if it finishes, the toolchain works on your machine.

## 2. Run the example, and change a page

```console
$ cd examples/docs-app
$ pnpm dev
```

Open the address it prints (`http://127.0.0.1:5173/`). Then, with the page open, try each of these and watch the browser:

| Do | Expect |
|---|---|
| Edit `content/index.md` and save | the page reloads with your text, in a fraction of a second |
| Change `"Light" : "Dark"` in `src/theme-toggle.mprx` | the button's label changes |
| Change `--accent` in `src/styles.css` | the colour changes **without** a reload (type something in the page first; it stays) |
| Break a link in a page: `[x](/nowhere)` | an error overlay naming `content/…md:LINE link-broken`; the terminal says the same. Fix it and the overlay goes away |
| Add `content/guide/hello.md` with `# Hello` | a new "Hello" entry appears in the sidebar |
| Change `"name"` in `valance.json` | the server restarts by itself and the site title changes |
| Click the Dark button, then another page | the theme stays (it is application state) |
| Open `/nope` | the project's own 404 page |

Other commands, in the same directory:

```console
$ pnpm build      # writes dist/ (about 4 seconds)
$ pnpm check      # finds mistakes in your files without building; add --json for tools
```

There is no `preview` command yet; to look at `dist/` use any static server, for example `npx serve dist`.

What is generated lives in `.valance/` (git-ignored), the site in `dist/`. Look inside `.valance/client.ts`: it is the whole browser entry the tools wrote for you.

## 3. Make your own project, outside the repo

This is what a user would do. Because nothing is published, install from a tarball of the package.

```console
# in the Valance clone
$ cd packages/cli
$ pnpm pack --pack-destination ~/vlx-pack          # makes ~/vlx-pack/valancex-cli-0.0.0.tgz

# a new project anywhere
$ mkdir ~/my-notes && cd ~/my-notes
$ npm init -y
$ npm pkg set type=module scripts.dev="vlx dev" scripts.build="vlx build" scripts.check="vlx check"
$ npm install -D ~/vlx-pack/valancex-cli-0.0.0.tgz

$ echo '{ "name": "My notes" }' > valance.json
$ mkdir content
$ printf '# Hello\n\nMy first page.\n' > content/index.md
$ printf '# More\n\nA second page, linked from [the first](./index.md).\n' > content/more.md

$ npm run dev
```

That is a complete application: a built-in layout, no `src/`. Now take over a part of it. Copy the example's files in as a starting point, or write your own:

```console
$ mkdir src public
$ cp ~/path/to/Valance/examples/docs-app/src/{layout.mprx,theme-toggle.mprx,styles.css,main.ts} src/
$ cp ~/path/to/Valance/examples/docs-app/public/logo.svg public/
```

Edit them; `npm run dev` picks everything up. The conventions are in [`packages/cli/README.md`](../../packages/cli/README.md).

To keep using a *changing* copy of the tool (while you modify the Valance repo), install it by path instead of by tarball, and rebuild after changes: `npm install -D ~/path/to/Valance/packages/cli` then `pnpm build` in the Valance clone.

## 4. Editor support (VS Code)

The extension is not published; you run it in a development host. Do this once:

```console
$ cd ~/path/to/Valance/editors/vscode
$ pnpm install
$ pnpm build
```

and in the project you want to open (the example already has both; for `~/my-notes` run these two):

```console
$ npm install -D @valancex/mesh-lsp@0.10.0     # the template language server, in your project
$ npx vlx check                                # writes .valance/editor.json, which the extension reads
```

Then start a VS Code window with the extension loaded, on the project:

```console
$ code --extensionDevelopmentPath=$HOME/path/to/Valance/editors/vscode ~/my-notes
```

or open `editors/vscode` in VS Code and press **F5** ("Run the extension on examples/docs-app").

In that window, open a `.mprx` file and check:

| Do | Expect |
|---|---|
| Open `src/layout.mprx` | coloured tags, attributes, `{expressions}` |
| Change `{site}` to `{sitee}` | a red squiggle: `unknown reference "sitee"`; the light bulb offers `Replace with "site"`; fix and it clears |
| Hover `theme-toggle` in a tag | its props and events |
| Ctrl/Cmd-click `theme-toggle` | opens `src/theme-toggle.mprx` |
| Type `<` on a new line | completion lists the project's components |
| Add `[x](/nowhere)` to a Markdown page and **save** | an error on that line (these come from `vlx check`, on save) |
| Misspell a key in `valance.json` | a schema warning |

The extension never fails silently. Look at the **status bar** (bottom left):

| You see | It means | Do |
|---|---|---|
| `$(check) VALANCE` | the language server is running for the project | nothing |
| `$(warning) VALANCE` | something is wrong; hover it or click it for the reason (a warning message also appears once) | do what it says |

The reasons, and the fix for each:

| Message starts | Fix |
|---|---|
| "No valance.json was found in this folder or the folders below it" | open the project's folder (or a folder that contains it, up to three levels) |
| "The project has not been built yet" | run `npx vlx check` (or `vlx dev`) in the project. The window notices by itself; no reload |
| "The template language server was not found at …" | `npm install -D @valancex/mesh-lsp@0.10.0` in the project, then *VALANCE: Restart the language server* from the command palette |
| "The template language server did not start: …" | the rest of the message is the cause; *VALANCE: Show details* has the server's log |

A **blue "… is not part of the compiled project" note on line 1 of a `.mprx` file** means the server was not told this file is a component, so hover, completion and type errors are off for that file. Either nothing uses the component yet (`npx vlx check` says `template-unused`), or you added it and have not rebuilt (`vlx dev` rebuilds on save; or run `vlx check`). The note goes away by itself once the project knows the file.

## If something goes wrong

| Symptom | Cause / fix |
|---|---|
| `vlx: command not found` | Run it through the project: `npm run dev`, `npx vlx dev` or `pnpm exec vlx dev`. It is a project dependency, not a global |
| `no valance.json in … or any directory above it` | Run it inside a project (the directory with `valance.json`, or below it) |
| `Port 5173 is in use` | It picks the next free port and prints it; or `vlx dev --port 4000` |
| An overlay or `file:line code: message` in the terminal | That is the tool working: the message names the file and line |
| Windows | Untested. Use WSL for now; if you try native Windows, tell me what breaks |
| Odd state after pulling new code | `pnpm install && pnpm build` in the clone, then delete the project's `.valance/` and `dist/` |

## What I would most like to know

- Where did you have to read source code to understand something? That is a documentation or design gap.
- Which file did you expect to exist and didn't (or the reverse)?
- Which error message did not tell you what to do?
- Was there anything you wanted to write in a template and could not? (Known limits: [`FINDINGS.md`](FINDINGS.md), D1 to D6.)
