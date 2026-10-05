// The documentation site (home, introduction, guides, reference; sidebar, keyed lists, code, an expandable section, search with loading / results / failure and stale-answer
// protection, URLs, links, server rendering, hydration), composed from the interface VALANCE has earned: state, views with a scope, commands, destination links, history, and a
// manifest that is derived. See ./COGNITIVE_LOAD.md for what composing it took, and ./VIEW_BOUNDARY.md for why the interface has this shape.
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

import { pages, type Page } from "./content.js";

// ---- state -----------------------------------------------------------------------------------------------------------------------------------------------------------

const Search = Schema.Struct({
  query: Schema.String,
  status: Schema.Literal("idle", "loading", "done", "failed"),
  results: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String })),
  message: Schema.String,
  ticket: Schema.Number,                             // the newest search; anything that supersedes one bumps it
});

export const AppState = Schema.Struct({ page: Schema.String, open: Schema.Boolean, search: Search });
export type AppState = typeof AppState.Type;

const idle = (ticket: number): AppState["search"] => ({ query: "", status: "idle", results: [], message: "", ticket });

export const initial: AppState = { page: "home", open: false, search: idle(0) };

const pageOf = (id: string): Page | undefined => pages.find((page) => page.id === id);

// ---- URLs: the application's, not the framework's -------------------------------------------------------------------------------------------------------------------

export const urlOf = ({ page }: AppState): string => pageOf(page)?.path ?? "/docs/";
export const stateOf = (url: URL): { readonly id: string } => ({ id: pages.find((page) => page.path === url.pathname)?.id ?? "home" });
export const stateFor = (url: string): AppState => ({ ...initial, page: stateOf(new URL(url, "http://localhost")).id });

// ---- what each view reads ---------------------------------------------------------------------------------------------------------------------------------------------

const Ref = Schema.Struct({ href: Schema.String, label: Schema.String });
const Row = Schema.Struct({ id: Schema.String, label: Schema.String, href: Schema.String });

export const HomeScope = Schema.Struct({ site: Schema.String, tagline: Schema.String, guides: Schema.Array(Row) });
export const DocScope = Schema.Struct({
  site: Schema.String,
  query: Schema.String,
  search: Schema.Struct({ status: Schema.String, message: Schema.String, empty: Schema.Boolean, results: Schema.Array(Row) }),
  nav: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, href: Schema.String, mark: Schema.String })),
  title: Schema.String,
  paragraphs: Schema.Array(Schema.Struct({ id: Schema.String, text: Schema.String })),
  code: Schema.String,
  detailsLabel: Schema.String,
  detailsOpen: Schema.Boolean,
  details: Schema.String,
  prev: Ref,
  next: Ref,
});

// ---- behavior ------------------------------------------------------------------------------------------------------------------------------------------------------------

/** Where search results come from: the one thing the platform provides. A test supplies its own. */
export type SearchDocs = (query: string, signal: AbortSignal) => Promise<ReadonlyArray<{ readonly id: string; readonly title: string }>>;

/** The application's commands, a function of the search service so the manifest can be derived from the table without one. */
export const commands = (searchDocs: SearchDocs) => (state: Valance.StateHandle<AppState>) => {
  const command = Valance.command(state);

  // Going to a page closes the search: it bumps the ticket, so a search still in flight is superseded. A pure command can do that because the ticket is state.
  const go = command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id, open: false, search: idle(current.search.ticket + 1) }));
  const toggle = command((current) => ({ ...current, open: !current.open }));

  // The one command that waits. It is written with NEXUS and Effect: VALANCE has no waiting-command form yet (see VIEW_BOUNDARY.md, "The async decision gate").
  const search = Nexus.Command.define("docs.search", Schema.Struct({ query: Schema.String }), ({ query }) => Effect.gen(function* () {
    const started = yield* state.update((current) => Effect.succeed({
      ...current,
      search: query.trim() === "" ? idle(current.search.ticket + 1) : { query, status: "loading" as const, results: [], message: "", ticket: current.search.ticket + 1 },
    }));

    if (query.trim() === "") return;

    const mine = started.search.ticket;
    const result = yield* Effect.tryPromise({ try: (signal) => searchDocs(query, signal), catch: String }).pipe(Effect.either);

    yield* state.update((current) => Effect.succeed(
      current.search.ticket !== mine ? current                      // superseded meanwhile: drop this result
        : result._tag === "Right" ? { ...current, search: { ...current.search, status: "done" as const, results: result.right.map(({ id, title }) => ({ id, label: title })) } }
        : { ...current, search: { ...current.search, status: "failed" as const, message: result.left } }
    ));
  }));

  return {
    go,
    toggle,
    search,
    "app/navigate": Valance.entry(go, (navigation) => navigation),   // history hands over ONE object, which a bare name does not unpack into fields
  };
};

// ---- the application -----------------------------------------------------------------------------------------------------------------------------------------------

export interface Programs {
  readonly home: Valance.Program;
  readonly doc: Valance.Program;
}

const row = (page: Page) => ({ id: page.id, label: page.title, href: page.path });

export const application = (programs: Programs, searchDocs: SearchDocs) => Valance.define({
  name: "docs",
  state: { schema: AppState, initial },
  views: {
    home: {
      program: programs.home,
      scope: (): typeof HomeScope.Type => ({ site: "Valance", tagline: "Application state, in one place.", guides: pages.filter((page) => page.section === "Guides").map(row) }),
    },
    doc: {
      program: programs.doc,
      scope: (state: AppState): typeof DocScope.Type => {
        const index = pages.findIndex((page) => page.id === state.page);
        const page = pages[index]!;
        const prev = pages[index - 1];
        const next = pages[index + 1];
        const { search } = state;

        return {
          site: "Valance",
          query: search.query,
          search: {
            status: search.status,
            message: search.message,
            empty: search.status === "done" && search.results.length === 0,   // MPRX has no length operator: emptiness is the one condition the view cannot compute
            results: search.results.map(({ id, label }) => ({ id, label, href: pageOf(id)?.path ?? "/docs/" })),
          },
          nav: pages.map((entry) => ({ ...row(entry), label: entry.section === "" ? entry.title : `${entry.section}: ${entry.title}`, mark: entry.id === state.page ? "›" : " " })),
          title: page.title,
          paragraphs: page.paragraphs.map((text, at) => ({ id: `${page.id}-${at}`, text })),
          code: page.code ?? "",
          detailsLabel: state.open ? "Hide details" : "Show details",
          detailsOpen: state.open,
          details: page.details,
          prev: { href: prev?.path ?? "", label: prev === undefined ? "" : `← ${prev.title}` },
          next: { href: next?.path ?? "", label: next === undefined ? "" : `${next.title} →` },
        };
      },
    },
  },
  view: (state) => state.page === "home" || pageOf(state.page) === undefined ? "home" : "doc",
  commands: commands(searchDocs),
});
