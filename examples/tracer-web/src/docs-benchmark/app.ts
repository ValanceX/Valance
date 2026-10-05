// The V1 composition benchmark: a small documentation site (home, introduction, guides, reference; sidebar, lists, code, an expandable section, search with loading /
// results / failure and stale-answer protection, URLs, server rendering, hydration), written as an application author would write it, from the Learn pages and the
// public API. Every point where the author had to think below VALANCE is recorded in ./COGNITIVE_LOAD.md while building; none was fixed (the benchmark measures the interface as it is).
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

import { pages, type Page } from "./content.js";

const Search = Schema.Struct({
  query: Schema.String,
  status: Schema.Literal("idle", "loading", "done", "failed"),
  results: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String })),
  message: Schema.String,
  ticket: Schema.Number,                             // the newest search; bumped by anything that supersedes one
});

export const AppState = Schema.Struct({ page: Schema.String, open: Schema.Boolean, search: Search });
export type AppState = typeof AppState.Type;

const idle = (ticket: number): AppState["search"] => ({ query: "", status: "idle", results: [], message: "", ticket });

export const initial: AppState = { page: "home", open: false, search: idle(0) };

const pageOf = (id: string): Page | undefined => pages.find((page) => page.id === id);

/** state → URL, and URL → the part of the state it names. The application's. */
export const urlOf = ({ page }: AppState): string => pageOf(page)?.path ?? "/docs/";
export const stateOf = (url: URL): { readonly id: string } => ({ id: pages.find((page) => page.path === url.pathname)?.id ?? "home" });
export const stateFor = (url: string): AppState => ({ ...initial, page: stateOf(new URL(url, "http://localhost")).id });

export interface Programs {
  readonly home: Mesh.Program;
  readonly doc: Mesh.Program;
}

/** Where search results come from: the one thing the platform provides. A test supplies its own. */
export type SearchDocs = (query: string, signal: AbortSignal) => Promise<ReadonlyArray<{ readonly id: string; readonly title: string }>>;

const link = (page: Page) => ({ id: page.id, label: page.title, href: page.path });

export const application = (programs: Programs, searchDocs: SearchDocs) => Valance.define({
  name: "docs",
  state: { schema: AppState, initial },
  views: {
    home: {
      program: programs.home,
      scope: () => ({ site: "Valance", tagline: "Application state, in one place.", guides: pages.filter((page) => page.section === "Guides").map(link) }),
    },
    doc: {
      program: programs.doc,
      scope: (state: AppState) => {
        const index = pages.findIndex((page) => page.id === state.page);
        const page = pages[index]!;
        const prev = pages[index - 1];
        const next = pages[index + 1];
        const { search } = state;

        return {
          site: "Valance",
          query: search.query,
          status: search.status === "loading" ? "Searching…" : search.status === "failed" ? `Search failed: ${search.message}` : search.results.length === 0 ? "No results" : "",
          hasStatus: search.status === "loading" || search.status === "failed" || (search.status === "done" && search.results.length === 0),
          hasResults: search.status === "done" && search.results.length > 0,
          results: search.results.map(({ id, label }) => ({ id, label, href: pageOf(id)?.path ?? "/docs/" })),
          nav: pages.map((entry) => ({ ...link(entry), label: entry.section === "" ? entry.title : `${entry.section}: ${entry.title}`, mark: entry.id === state.page ? "›" : " " })),
          title: page.title,
          paragraphs: page.paragraphs.map((text, at) => ({ id: `${page.id}-${at}`, text })),
          hasCode: page.code !== undefined,
          code: page.code ?? "",
          detailsLabel: state.open ? "Hide details" : "Show details",
          detailsOpen: state.open,
          details: page.details,
          hasPrev: prev !== undefined, prevId: prev?.id ?? "", prevHref: prev?.path ?? "", prevLabel: prev === undefined ? "" : `← ${prev.title}`,
          hasNext: next !== undefined, nextId: next?.id ?? "", nextHref: next?.path ?? "", nextLabel: next === undefined ? "" : `${next.title} →`,
        };
      },
    },
  },
  view: (state) => state.page === "home" || pageOf(state.page) === undefined ? "home" : "doc",
  commands: (state) => {
    const command = Valance.command(state);

    // Going to a page closes the search: it bumps the ticket, so a search still in flight is superseded. A pure command can do that because the ticket is state.
    const go = command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id, open: false, search: idle(current.search.ticket + 1) }));
    const toggle = command((current) => ({ ...current, open: !current.open }));

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
      "app/navigate": Valance.entry(go, (navigation) => navigation),   // popstate hands over ONE object, which is not unpacked into fields
    };
  },
});
