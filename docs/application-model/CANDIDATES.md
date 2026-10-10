# Phase 1: candidate application models

Hypothesis pipeline tested: `Markdown → content model → layout → components → rendered page`.

Constraint found in Phase 0: `@valancex/valance` may not gain a CLI, compiler, router or dev server (`CONSTRAINTS.md` l.21). Any candidate needs a **separate tooling package**. Provisional name `@valancex/cli`, private/unpublished in this cycle (names and publishing are the owner's decision, `GRADUATION.md`).

## Candidate A: content-only (VitePress-like)

```
my-docs/  valance.json  content/*.md  public/  theme.css
```
No `src/`. The kit owns layout, components and behavior. Author writes Markdown and a few settings.

- Discoverability: excellent for a docs site. Cognitive load: minimal.
- Fails the brief: it is a docs generator, not an application. No place for state, commands, a layout of your own. "Change a component" has no answer short of ejecting.

## Candidate B: declared application, framework-owned boot (recommended)

```
my-docs/
  valance.json            project settings (name)
  valance.web.json        web target settings (base, url), optional
  content/                Markdown pages; the path is the URL
  public/                 copied verbatim to the site root
  src/
    main.ts               optional: application state and commands (defineApp)
    layout.mprx           the page shell; optional (a default ships)
    *.mprx                your components; same name as a built-in replaces it
    *.css                 styles, all loaded
  .valance/               generated, git-ignored
  dist/                   build output
```
`src/main.ts`:
```ts
import { defineApp, Schema } from "@valancex/cli";
export default defineApp({
  state: { schema: Schema.Struct({ theme: Schema.Literal("light", "dark") }), initial: { theme: "light" } },
  commands: (command) => ({ toggleTheme: command((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" })) }),
});
```
`src/layout.mprx` reads `site`, `title`, `sections`, `blocks`, `theme` and runs `toggleTheme()`.

- The author sees: content, layout, components, styles, state, commands, config. Never: manifest, compile, wasm, hydration, document assembly, Vite, NEXUS/MESH/PORT.
- Cost: a new public API (`defineApp`, scope contract for layouts) to design and keep stable; the layout scope is a flat record (MESH constraint).
- Directories each have a real responsibility; `layouts/`, `routes/`, `components/` are not created (one shell; routes derive from content; components are `.mprx` files named by their tag).

## Candidate C: explicit application plus virtual modules (Vite-plugin-like)

```
src/main.ts   Valance.define(...), Web.run(...), imports "virtual:valance/content"
src/*.mprx    templates
```
The CLI only builds/serves; the author still writes state, scope Schemas, routes, boot.

- Maximum flexibility, minimum new API. But the author keeps meeting `Web.run`, `RouteTable`, plugins and scope Schemas: friction 3 and 4 from Phase 0 stay. Fails "expose concepts, hide mechanisms".

## Comparison

| Criterion | A | B | C |
|---|---|---|---|
| Discoverability | best | good (convention table) | poor (boot code to read) |
| Cognitive load | lowest | low | high |
| Content | `content/` | `content/` | virtual import |
| Routing | derived | derived from content | author-written |
| Styling | one theme file | `src/*.css` | author imports |
| Configuration | `valance.json` | `valance.json` + target file | vite-style |
| Targets | web only | `valance.<target>.json` | ad hoc |
| Generated outputs | `.valance/` | `.valance/` | `.valance/` |
| Editor tooling | trivial | needs template/scope contract (shipped as `.valance/manifest.json`) | hardest to analyse |
| Can grow into an app | no | yes | yes |

## Decision

**B.** Escape hatch for unusual cases stays the existing public API (`Valance.define` + `Web.run`), unchanged.

Trade-offs accepted:
- The layout's scope is defined by the framework (plus the author's state fields). Authors cannot yet add derived scope fields; state only.
- The primitive tag set is fixed; authors cannot declare new tags yet.
- The whole content model is embedded in the page bundle (fine for tens of pages; the verifier's per-page payload design is the known answer for hundreds, `ROADMAP.md` phase E).
- Markdown dialect is a deliberate subset; unsupported syntax is an error naming file and line (same philosophy as the verifier).

### Configuration decisions
- `valance.json`: `{ version?: 1, name: string }`. Only `name` has evidence (nav/site title and `<title>`). Nothing else is added.
- `valance.web.json`: `{ base?: "/", url?: "https://…" }`. These are the two web-only settings the verifier already keeps in `site.json`. `url` enables `sitemap.xml` and canonical links.
- Unknown keys are errors (typos should not be silent). Schema owned by `@valancex/cli` (`schemas/valance.schema.json`, referenced via `$schema`), versioned by `version`. Target files for other targets are reserved by name (`valance.<target>.json`) but not read until a second target exists.
- Not invented: content directory setting, port (a CLI flag), theme, plugin lists.

### Dev lifecycle (hypothesis, verified in Phase 2/3F)
| Change | Action |
|---|---|
| `content/**/*.md` | regenerate content, full reload |
| `src/*.mprx` | recompile program, full reload (the program is data; hot swap deferred) |
| `src/*.css` | Vite CSS HMR, no reload |
| `src/main.ts` | recompile (manifest derives from it), full reload |
| `public/**` | full reload |
| `valance*.json` | restart the dev server (base and name are fixed at startup) |
| error in any of the above | keep last good build; show file:line in terminal and browser overlay |

### Editor foundation (Phase 5 plan)
Emit `.valance/manifest.json` (tags, props, scope names the templates may use), ship the JSON Schemas for the config, and use one diagnostic shape `{ file, line, column, code, message }` for config, content, links and templates, available as `vlx check --json`.

### Unresolved
- Package name/publishing; whether `defineApp` should one day live in a core subpath.
- Whether authors need new primitives (`Plugin.views`-style decision from `GRADUATION.md`).
- Per-page content payloads for large sites.
