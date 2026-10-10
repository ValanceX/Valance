# Graduation: from stand-ins to packages

`EXTERNALS.md` lists the pieces the documentation sites need that are outside VALANCE's contract. Each is a **stand-in** here, written against the seam VALANCE provides, and tested by sites and not by a promise. This file is what it would take to turn each into a package, and in what order. **Nothing has been extracted**: a package is a thing people install and depend on, and that is a decision, not a refactor (see "What is decided" below).

`tests/unit/graduation.test.ts` pins what each candidate needs today (its import closure), so a change that makes it harder to extract fails a test.

## Readiness

| Candidate | Provisional package | Files it takes | It needs | Blocking its extraction | Stable enough? |
|---|---|---|---|---|---|
| X2 content | `@valancex/site-content` | `tooling/{content,markdown,highlight,search}.ts`, `model/{site,search,slug,ui}.ts` | `effect`, Node | nothing: the model and the tooling import only each other | The model changed in every phase until F. **Not yet**: wait for a second author. |
| X1 router | `@valancex/site-routes` | `app/{routes,variants}.ts` | the model, `effect` | `routes()` reads `state.page` through the application's `AppState`; it should be generic in "a state with a `page`" | After phase F: base, aliases, languages, versions, canonical and alternate addresses are tested by four sites. **Yes**, with the generic state. |
| X7 web platform | `@valancex/site-platform` | `src/web/platform.ts` | the capabilities' contracts (`src/app/capabilities.ts`), `@valancex/nexus` | the contracts live in `app/` and `platform.ts` imports `contentFile` from the routes | **Yes** once the contracts and `contentFile` move to the content package. |
| X3 site generator | `@valancex/site-export` | `web/{export,document,serve}.ts` | the application, the plugins, the compiled views, VALANCE | it renders the application, so it needs the whole kit | Last: it is the part that composes the others. |
| X6 kit | `@valancex/site-kit` | `views/*.mprx`, `styles/*.css`, `web/{primitives,kit,plugins,seo,router}.ts`, `app/*` | VALANCE, MESH | templates are not part of VALANCE's plugin contract (`Plugin.views`), so the kit ships `.mprx` that its user's build reads | Needs the `Plugin.views` decision below. |
| X4 dev server | none | none | X2, X3 | not written | Not started. |
| X5 server adapter | none | `build/serve.ts` (`serveSsr`) | X3 | stays a stand-in until SSR is inspected (`ROADMAP.md`) | Opt-in; not now. |

## Order

1. **X1** and **X7**, which are small and whose contracts four sites have exercised.
2. **X2**, when the model has not changed for a release and a second site author has written content for it.
3. **X3**, once X1, X2 and X7 are packages (it depends on all three).
4. **X6**, with the decision on templates.

For each, the same steps: move the files and their tests; make the dependency an optional peer of VALANCE if VALANCE is to re-export it (`web/<name>`, never from the root, `docs/V1_CONTRACT.md` §19); give it `sideEffects: false` and a `stability.md` with the shared tiers, **Provisional** at birth; write its release notes; add its row to VALANCE's `stability.md` as a re-export, with the tier of what it re-exports.

## What is decided, and what is not

- **Decided** (by the project owner): routing, a content pipeline, a static generator, a dev server and a server adapter are external dependencies, developed later as packages; VALANCE may re-export them as optional, tree-shakable subpaths; static delivery is primary and server rendering opt-in.
- **Not decided** (and needs the owner):
  - **When to extract.** This file says what is ready, not that it should happen with this release. Extraction creates packages to publish, name, own and keep compatible.
  - **Names and scope.** The names above are provisional.
  - **Templates in a plugin.** Whether `Plugin` grows a `views` contribution (so a kit is a plugin) or the kit stays a source the build step reads. A second kit would settle it; today there is one.
  - **Whether VALANCE re-exports at all.** The policy allows it; nothing yet needs it.
