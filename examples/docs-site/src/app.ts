// The application: a documentation site (home, introduction, guides, reference; a sidebar, keyed lists, code, an expandable section, a search box with loading, results,
// failure and stale-answer protection, URLs, links, a document title per page, server rendering and hydration), written with what VALANCE 0.5 ships: state, views with a
// scope, commands (one of them `waiting`), links by destination, a text field, history, and a MESH manifest derived from the code (./compile.ts). Nothing here names NEXUS,
// MESH, PORT or the DOM.
import * as Valance from "@valancex/valance";
import { Schema } from "effect";

import { pages, type Page } from "./content.js";

// ---- state -----------------------------------------------------------------------------------------------------------------------------------------------------------

const Search = Schema.Struct({
  query: Schema.String,
  status: Schema.Literal("idle", "loading", "done", "failed"),
  results: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String })),
  message: Schema.String,
});

export const AppState = Schema.Struct({ page: Schema.String, open: Schema.Boolean, search: Search });
export type AppState = typeof AppState.Type;

const idle = (): AppState["search"] => ({ query: "", status: "idle", results: [], message: "" });

export const initial: AppState = { page: "home", open: false, search: idle() };

const pageOf = (id: string): Page | undefined => pages.find((page) => page.id === id);

// ---- URLs: the application's, not the framework's -------------------------------------------------------------------------------------------------------------------

export const urlOf = ({ page }: AppState): string => pageOf(page)?.path ?? "/docs/";
export const stateOf = (url: URL): { readonly id: string } => ({ id: pages.find((page) => page.path === url.pathname)?.id ?? "home" });
/** The document's title for a state: `history` keeps the browser's in step (`titleOf`), and the server's document writes the same function's result for the state it rendered. */
export const titleOf = ({ page }: AppState): string => { const title = pageOf(page)?.title; return title === undefined ? "Valance" : `${title} · Valance`; };
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

  // Going to a page closes the search; a search still in flight finds the state moved on (`wanted` below) and its answer is discarded.
  const go = command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id, open: false, search: idle() }));
  const toggle = command((current) => ({ ...current, open: !current.open }));

  // The one command that waits. A newer search supersedes an older one on its own; `wanted` is the other question: is this answer still what the state is waiting for.
  const search = command.waiting(Schema.Struct({ query: Schema.String }), {
    begin: ({ query }, current) => ({ ...current, search: query.trim() === "" ? idle() : { query, status: "loading", results: [], message: "" } }),
    work: ({ query }, signal) => query.trim() === "" ? Promise.resolve([]) : searchDocs(query, signal),
    wanted: ({ query }, current) => current.search.query === query && current.search.status === "loading",
    settle: (outcome, _input, current) => outcome.ok
      ? { ...current, search: { ...current.search, status: "done", results: outcome.value.map(({ id, title }) => ({ id, label: title })) } }
      : { ...current, search: { ...current.search, status: "failed", message: String(outcome.error) } },
  });

  return {
    go,
    toggle,
    search,
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
