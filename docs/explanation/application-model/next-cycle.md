# Next cycle: investigation record

Three questions, each answered from the code and docs in this checkout (2026-10). Nothing was changed except this file. Recommendations are marked **Proposal**; the decisions they need are collected at the end.

## 1. Why is the authoring API imported from the CLI?

`import { component, defineApp, field, Schema } from "@valancex/cli"` (`packages/cli/src/index.ts`) is the whole authoring surface of an application. You are right that it does not belong there.

**How it got there.** `docs/explanation/constraints.md` ("MUST NOT") forbids `@valancex/valance` from gaining a CLI, dev server, router or plugin system, and `CANDIDATES.md` concluded the application model needs "a separate tooling package". `defineApp` was added to the only such package. The name is provisional (`package.json`: version `0.0.0`, private, "Provisional name; unpublished"). So this is the tooling package holding things that are not tooling, not a deliberate design.

**What `@valancex/cli` holds today**, by who uses it:

| Entry | Contents | Used by | Belongs in |
|---|---|---|---|
| `bin/vlx.js` | `init`, `dev`, `build`, `check` | a person, a terminal | the CLI |
| `.` (`index.ts`) | `defineApp`, `component`, `field`, `Schema`, types | the author's `src/main.ts`, at build and in the browser | an application package |
| `./client`, `./server` | `start`, `createRenderer`, `pathsOf` | the generated `.valance/client.ts` and `server.ts` | an application package (runtime) |
| `./node` | `build`, `check`, `dev`, `findRoot`, `loadConfig`, diagnostics | tools (the VS Code extension, scripts) | the CLI |
| `views/`, `templates/`, `schemas/` | built-in components, `vlx init` files, JSON schemas | both | split |

**What it costs.**

1. **A wrong dependency edge.** An application's own code depends on the package that owns `ink`, `react` and `vite` (all `dependencies`, `packages/cli/package.json`). Every project installs a terminal UI toolkit to import four functions. The bundle is not affected (`index.ts` imports only `effect` at runtime and `sideEffects` is false); install size, audit surface and version skew are.
2. **Two names for one thing.** The README's counter uses `Schema` from `effect`; `main.ts` uses `Schema` from the CLI. It is the same object, but a reader cannot tell, and a project with two `effect` versions gets two schema classes.
3. **The error text teaches it.** `entry-export` says `must export default defineApp({ … }) from "@valancex/cli"`, and the VS Code extension matches that import string (`editors/vscode/test/project.test.ts:308`). Renaming touches the diagnostic, the extension, the template, the test fixtures and three README snippets.
4. **A global tool that must delegate.** `vlx` is installed globally, yet "`dev`, `build` and `check` run the `@valancex/cli` installed in that project" (`delegate.ts`). That indirection exists only because the project has to depend on the CLI for the API. If the project depended on an API package alone, a global `vlx` could still pin the build to the project's version through that package's version, and the delegation story would be about one thing.

**Proposal.** Split along the table above. The package is unpublished, so no compatibility shim is needed.

- `@valancex/app` (name open): `defineApp`, `component`, `field`, the `Template` type, and `./client` and `./server`. Depends on `@valancex/valance`, `effect`; no `ink`, `react`, `vite`.
- `@valancex/cli`: `vlx` and `./node`. Depends on `@valancex/app`.
- Drop the `Schema` re-export. The template and README write `import { Schema } from "effect"`, as every other Valance document already does, and the file imports exactly where each name comes from. (If keeping the dependency list shortest matters more, re-export from `@valancex/app` instead; do not leave it on the CLI.)

Result: `import { component, defineApp, field } from "@valancex/app"` reads as what it is.

## 2. The README, and the CLI as the entry point

**Measured against the criteria** (`examples/tracer-web/src/docs-benchmark/COGNITIVE_LOAD.md`: severity 0 natural … 3 abstraction failure, and layer App / FW / Eng; and `Mesh/docs/explanation/api-design-principles.md` §2, "basic use: accomplish a common task with minimal concepts and configuration"). `examples/docs-verifier` itself does not state the criterion; it applies the principles (`docs/PRINCIPLES.md`) and records friction.

The quick start before the first visible button:

| Count | What |
|---|---|
| 978 words, 185 lines | the README; the quick start alone is 5 steps |
| 7 packages, 5 version ranges | `pnpm add …` and a second `pnpm add -D …` |
| 4 authored files + 1 build script | `counter.mprx`, `components.json`, `build-views.js`, `main.ts`, `index.html` |
| 3 engine concepts | the component manifest, `compileProgram`, `init(wasmUrl)` |

Those three are exactly rows #4 (manifest, Sev 2), #19 (`compileProgram`, Sev 1) and #18 (`init`, Sev 2) of the benchmark's own log: engine concepts that the application model was built to hide. The README then says it for us: "In a real application you do not write it: `manifest` derives it". The quick start teaches the mechanism the CLI removes. Meanwhile `packages/cli/README.md` reaches a running site in four lines (`vlx init`, `dev`, `build`, `check`) but is unpublished and is linked from the root README only in passing, under Examples as "provisional".

Two lines of reasoning for what changes:

- The counter walk-through is not lost: `docs/tutorials/01-first-application.md` already covers the same counter line by line. The README's quick start duplicates it.
- The README is a front door. It is read once, by someone deciding whether to continue. Its job is to get to one working app and name the next door.

**Proposal.** Make the root README about 50 lines and CLI-first:

1. Logo, one-sentence promise, pre-1.0 notice (as now).
2. **Start**: `vlx init my-app --web && cd my-app && pnpm dev`, then one sentence on what was made.
3. **What you got**: a four-row table (`content/`, `src/layout.mprx`, `src/main.ts`, `src/*.css`), each with one line, no code beyond a six-line `main.ts` excerpt.
4. **The CLI**: the command table (`init`, `dev`, `build`, `check`, and `generate` below) as the way into every workflow.
5. **Next**: learning path trimmed to links; examples; contributing.

Moved out, not deleted: the hand-composed counter (install lines, manifest, `build-views.js`, `Web.run`) goes to `docs/tutorials/01-first-application.md` under a heading that says it is the engine-level route, "for when you embed Valance in an existing app". Windows and contributor detail moves to `CONTRIBUTING.md`.

**Blocker to say plainly.** `@valancex/cli` is not on npm, so the CLI-first quick start cannot be run by a reader of the published README today. Until it is published, the quick start must say "link from a clone" (`pnpm link --global`) or the README must keep the engine-level route. Publishing is the owner's decision (`GRADUATION.md`); this proposal is ready the day the decision is yes, and should not be merged before then.

**Making the CLI the entry point to workflows.** Today `vlx` is a project starter and a build tool. The workflows a README would send you to (add a component, add a page) are hand edits across two to three files. **Proposal**, in order of value:

| Command | Does | Notes |
|---|---|---|
| `vlx generate component <name>` (`g`) | writes `src/<name>.mprx` and `src/<name>.ts` with a stated contract, imports it in the parent and adds it to `uses` | the case that needs §3 below to be solved properly |
| `vlx generate page <path>` | writes `content/<path>.md` with front matter | trivial, no source edits |
| `vlx --help` / `vlx help <command>` | one place to read what exists | `--help` exists for `init` only |
| `vlx doctor` (optional) | checks `tsconfig` options for typed template imports, `@valancex/*` version agreement | today a README paragraph asks the user to set `allowArbitraryExtensions` and `rootDirs` by hand |

Naming note: `packages/cli/src/generate.ts` already exists and means the `.valance/` output stage. Call the command `generate` for users and rename the file (`emit.ts`) so the word has one meaning in the code.

## 3. A component's anatomy, and template manipulation

**What a component is today** (one component, `theme-toggle`):

| Part | Where | Who writes it |
|---|---|---|
| Template | `src/theme-toggle.mprx`; its file name is the tag | author |
| Contract | `src/theme-toggle.ts`: `component(template, { props, events })`, Effect Schemas | author (or inferred if omitted) |
| Registration | an import plus an entry in the parent's `uses`, up to `layout` in `src/main.ts` | author, both required |
| Style | any `src/**/*.css`; global, not tied to the component | author |
| Typing | `.valance/types/theme-toggle.d.mprx.ts`, from the compiled model | tools |
| Compiled form | a `mesh-template` JSON: resolved names, no values, spans (`Mesh/docs/reference/templates.md`) | tools |

In TypeScript the template is **an address only**: `Template = { mprx: string }` (`index.ts`). The `Component` object is `{ template, props?, events?, uses }`. The CLI never holds a template's syntax tree. It reads the `.mprx` as text (`compile.ts`: a tag regexp), and it finds `component(...)` calls in `main.ts` by text search ("A text search for pointing, not a parse", `tree.ts`).

**What the template language already offers for composition** (Mesh): children through `mesh-slot`; named slots filled with `mesh-fill`; events forwarded through any depth of composites; `{#if}`/`{#each}` blocks; inferred contracts. These are the manipulations a component can express for its users. Whether they work through the CLI is unverified: Mesh's `compileProgram` declares `mesh-slot` and `mesh-fill` when a template uses them and the manifest does not, but the CLI has no test or example using them, and its documentation never mentions them, and `override` replaces a built-in as a whole with no way to wrap or extend it.

**Where template manipulation breaks down today.** "Manipulate" has three meanings; the support differs:

1. **Composing** (slots, props, events): supported by Mesh, undocumented in the CLI README, no layout-level wrapping of a built-in.
2. **Generating or editing a template programmatically** (scaffold a component, add a prop, rename a tag, extract a fragment into a component): **not supported.** `@valancex/mesh-compiler` exposes only `check`, `compile`, `checkProgram`, `compileProgram`, `init`. There is no parse, AST or print in JavaScript, although the Rust crates have a parser, formatter and an LSP. Every edit is therefore string surgery on `.mprx` and on `main.ts`.
3. **Transforming at build time** (inject, rewrite, analyse): only through the `.valance/` outputs. Two are useful and already exist: `wiring.json` (where every name comes from and what uses it, at both ends) and the compiled templates with spans. They are written for the editor and not documented as a tool API.

**The structural problem for any generator or codemod is the registration step.** A template names the components it uses (`<theme-toggle />`), and the compiler already errors both when a tag is not in `uses` (`component-undeclared`) and when an entry is not used (`component-unused`). The list is therefore fully determined by the template plus the set of components, yet it is hand-maintained, and the two errors exist to catch drift in a list nobody should be writing. A generator that adds a component must edit three places in two files, one of them by text search.

**Proposal**, smallest step first:

1. **Make registration derivable.** Two options; I recommend (a).
   - (a) Keep explicit imports, drop `uses`: a component's `uses` is inferred from the tags its template uses, resolved against the components imported in the same file or declared in the app. One fewer thing to write, one fewer error pair, and `generate component` only needs to write two new files and add an import-free reference (the name is the file).
   - (b) Keep `uses`, and have `generate` edit it with a real parse (needs (2) below).
   Cost of (a): the explicit tree in `main.ts` ("nothing under `src/` is part of it by being there") becomes implicit. The README states this was chosen on purpose; this proposal reverses part of it and needs your call.
2. **Expose a read-only template model.** Add `parse` (or `outline`) to the JS compiler package: tag names used, attributes, slots, events raised, spans. That serves the CLI (inferring `uses`, safe `generate`, a `vlx check` that names the component), the editor and the wiring file, and is read-only, so it commits Mesh to little. Writing back (a printer or codemods such as `rename-prop`) waits until a read model has been used for a cycle.
3. **Document composition in the CLI README**: a section "Slots and children" with a three-line example, so the language feature that most supports reuse can be found.
4. **Co-locate a component's files**, if (1) lands. A component folder (`src/theme-toggle/theme-toggle.mprx`, `.ts`, `.css`) makes "one component, one place" true for generation, deletion and CSS scoping. This conflicts with the earlier decision against a `components/` directory (`CANDIDATES.md`), so I would not do it in this cycle.

## Decisions needed

| # | Question | Recommendation |
|---|---|---|
| D1 | Split the authoring API out of the CLI; name of the new package | Yes. `@valancex/app` unless you prefer another name |
| D2 | Keep a `Schema` re-export | No; use `effect` directly |
| D3 | Publish `@valancex/cli` (and the API package) before the README changes | Yes: the CLI-first README is only honest after that |
| D4 | Add `vlx generate component\|page` and `vlx help` | Yes, `page` and `help` first, `component` after D5 |
| D5 | Infer `uses` from the template instead of listing it | Yes (option a) |
| D6 | Add a read-only parse/outline to the JS compiler package | Yes, in Mesh's next minor, read-only |

Suggested order: D1/D2 (mechanical, one commit, grep-able), D6 then D5 (so `generate component` is safe), D4, then the README rewrite lands with D3.

## Outcome (2026-10-14)

Done on this branch, following the decisions above with the changes noted.

| # | Decision | Result |
|---|---|---|
| D1 | Split the authoring API out of the CLI | **`@valancex/common`** (not `@valancex/app`): `defineApp`, `component`, `field`, `Template` and the `*.mprx` module declaration. `@valancex/cli` no longer exports `.`. A new project depends on `@valancex/common` and `effect`, with `@valancex/cli` as a dev dependency. |
| D2 | No `Schema` re-export | Done; templates, tests, docs and the scaffold import it from `effect`. |
| D3 | Prepare publication | Both packages are public with provenance and version 0.1.0; `release-cli.yml` publishes them on a `cli-v*` tag, `common` first, and refuses to publish unless `@valancex/valance@^0.10.0` is on npm. Release notes: `docs/releases/cli-v0.1.md`. Verified from `pnpm pack` tarballs: `vlx init`, install, `check`, `build`, `generate` and `tsc --noEmit` in a fresh project. **Nothing was tagged or published.** `@valancex/valance@0.10.0` is on npm, so the dependency is met; the same check was repeated against the registry's copy. |
| README | CLI-first | Root README is about 60 lines and starts with `vlx init`; the hand-built counter stays in `docs/tutorials/01-first-application.md`; contributor and Windows notes moved to `CONTRIBUTING.md`. |
| D4 | `vlx generate`, `vlx help` | `generate page <path>`, `generate component <name>` (alias `g`), `help [command]` and `--help` for every command. `src/generate.ts` was renamed `src/emit.ts`. |
| D5 | Infer what a template uses | `components` on `defineApp` replaces every `uses`; the uses are read from the template. **Changed from the proposal:** a registered component that no template writes is allowed rather than an error (`generate component` would otherwise leave a project failing `vlx check`). `template-unused` still catches a file that is not registered. |
| D6 | Read-only template model | `src/outline.ts` (tags, slots, fills; skips expressions, quoted values and comments). **Changed from the proposal:** it lives in the CLI, not in MESH's compiler package, since the JS package wraps WebAssembly and a parser there is a MESH release. It is the one place in Valance that reads template text, and the thing to move into MESH. |
| Slots | Documented | Verified through the CLI (default and named slots, `mesh-fill`) and described in the CLI guide. |

Found on the way: `vlx init` documented a `tsconfig.json` for typed template imports and did not write one; it does now.

**Done afterwards.** The browser and server runtime (the content model, routes, scope, state, the tag table and the two entries) moved into `@valancex/common`, whose `./client` and `./server` are what the generated entries import; `./internal` shares the model with the build tools. A built or deployed application now runs on `@valancex/common` alone, and `@valancex/cli` is a development tool (a dev dependency). The three packages are released together as 0.11.0 (`docs/reference/releases/v0.11.md`). **Not moved:** the built-in views (`views/*.mprx`), which only the build reads, and the compile pipeline. The VS Code extension's own suite was not run here (its dependencies are not installed in this checkout); only a string in one of its tests changed.

**Follow-up (same day).** The generated files used to go stale until `check`, `dev` or `build` was run by hand (typed template imports, so `tsc` and the editor). `vlx sync` now refreshes them and never fails; it runs by itself after install (`prepare`), before `typecheck`, and after `vlx generate`. Checked: `npm install` in a fresh project writes `.valance/types/` and `tsc --noEmit` passes with no other command.

**Follow-up: the editor.** The VS Code extension needed `vlx check` run by hand before it worked, and drifted out of date between runs: it ran the check once at start-up (after already warning that nothing was generated), and on a save of an existing file, with overlapping runs and no reaction to a new, deleted or externally changed file. It now runs the project's own `vlx check` by itself on opening and on any create, change, delete or save of a content, template, code or settings file (not under `.valance/`, `node_modules/` or `dist/`), one run at a time with any asks made meanwhile folded into one more round, debounced 300 ms, and re-reads the manifest in the language server after each run. A project with nothing generated shows "Preparing the project" and no warning; a warning remains only if the check wrote nothing, or `@valancex/cli` is not installed (then it says to run `npm install`). I also removed the `valance.check.onType` setting, which was declared and never implemented. Limits: `vlx check` reads files from disk, so an unsaved edit to `src/main.ts` or a content file is seen after save; the real-editor host suite (`pnpm test:host`) was not run here.
