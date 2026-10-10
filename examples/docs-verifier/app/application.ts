// The application: state, one view with a scope, and its commands. It names no target (no DOM, no Web) and reads no file: the site arrives as data, the compiled programs as an
// argument, and the platform's abilities (the clipboard, a store, the search index) as capabilities it asks for by name (./capabilities.ts), so the same application runs on the
// server, in the browser and under a test.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Effect, Option, Schema } from "effect";

import type { Site } from "../model/site.js";

import { Clipboard, Index, Storage } from "./capabilities.js";
import { search } from "./search.js";
import { pageScope } from "./scope.js";
import { AppState, initial, Theme } from "./state.js";

/** The text a copy button copies: a code block's, or the alternative of a code group that the button belongs to. */
export const copyTextOf = (site: Site, id: string): string | undefined => {
  for (const page of site.pages) {
    for (const block of page.blocks) {
      if (block.kind === "code" && block.id === id) { return block.text; }

      if (block.kind === "codegroup") {
        const tab = block.tabs.find((candidate) => candidate.id === id);

        if (tab !== undefined) { return tab.text; }
      }
    }
  }

  return undefined;
};

const STORED = { theme: "docs.theme", tabs: "docs.tabs" } as const;

/** Best effort: remember `value` if the platform has a store, and carry on if it has none or refuses. */
const remember = (key: string, value: string) => Nexus.Capability.resolve(Storage).pipe(
  Effect.flatMap((resolution) => resolution._tag === "Available" ? Effect.sync(() => { resolution.implementation.set(key, value); }) : Effect.void),
  Effect.catchAllDefect(() => Effect.void),
);

/** The commands, a function of the state handle and the site, so the build can read their names and inputs without one (../web/compile.ts reads them with an empty site). */
export const commands = (state: Valance.StateHandle<AppState>, site: Site) => {
  const command = Valance.command(state);

  return {
    /** Go to a page. Moving on clears the copied mark, the heading the reader was at, the search and the menu. */
    go: command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id, copied: "", copyFailed: "", active: "", search: initial.search, menu: false })),
    /**
     * A code block's copy button was pressed: put its text on the clipboard, and say what happened. The page says "Copied" only when the clipboard took it, and "Failed" when it did
     * not (no clipboard on this platform, or the browser refused), so the label is never a claim the application did not check.
     */
    copyCode: Nexus.Command.define("docs.copyCode", Schema.Struct({ blockId: Schema.String }), ({ blockId }) => Effect.gen(function* () {
      const text = copyTextOf(site, blockId);
      const copied = text === undefined
        ? false
        : yield* Nexus.Capability.require(Clipboard).pipe(
          Effect.flatMap((clipboard) => Effect.tryPromise(() => clipboard.write(text))),
          Effect.as(true),
          Effect.catchAll(() => Effect.succeed(false)),
        );

      yield* state.update((current) => Effect.succeed(copied ? { ...current, copied: blockId, copyFailed: "" } : { ...current, copied: "", copyFailed: blockId }));
    })),
    /** Open or close the navigation on a small screen. */
    toggleMenu: command(Schema.Struct({}), (_input, current) => ({ ...current, menu: !current.menu })),
    /** Choose a tab of a code group, and remember the choice. `tab` is `<group>|<label>`; anything else changes nothing. */
    selectTab: Nexus.Command.define("docs.selectTab", Schema.Struct({ tab: Schema.String }), ({ tab }) => Effect.gen(function* () {
      const at = tab.indexOf("|");

      if (at <= 0) { return; }

      const next = yield* state.update((current) => Effect.succeed({ ...current, tabs: { ...current.tabs, [tab.slice(0, at)]: tab.slice(at + 1) } }));

      yield* remember(STORED.tabs, JSON.stringify(next.tabs));
    })),
    /** Choose the colour theme, and remember the choice. */
    setTheme: Nexus.Command.define("docs.setTheme", Schema.Struct({ theme: Theme }), ({ theme }) => Effect.gen(function* () {
      yield* state.update((current) => Effect.succeed({ ...current, theme }));
      yield* remember(STORED.theme, theme);
    })),
    /** Take back what the reader chose on an earlier visit. Run once the page has taken over (a choice drawn before then would not match the server's HTML). Nothing stored, nothing changes. */
    restore: Nexus.Command.define("docs.restore", Schema.Struct({}), () => Effect.gen(function* () {
      const store = yield* Nexus.Capability.resolve(Storage);

      if (store._tag !== "Available") { return; }

      const theme = Option.getOrUndefined(Schema.decodeUnknownOption(Theme)(store.implementation.get(STORED.theme)));
      const tabs = Option.getOrUndefined(Schema.decodeUnknownOption(Schema.parseJson(Schema.Record({ key: Schema.String, value: Schema.String })))(store.implementation.get(STORED.tabs)));

      if (theme !== undefined || tabs !== undefined) {
        yield* state.update((current) => Effect.succeed({ ...current, ...(theme === undefined ? {} : { theme }), ...(tabs === undefined ? {} : { tabs }) }));
      }
    })),
    /** The reader scrolled to a heading (or to the top: an empty anchor). Nothing changes when it is the heading already marked. */
    setActive: command(Schema.Struct({ anchor: Schema.String }), ({ anchor }, current) => current.active === anchor ? current : { ...current, active: anchor }),
    /**
     * Search the site. The index is the platform's to load; loading it, and the failure to, are state: `loading`, then `ready` (with hits, maybe none) or `failed`. A newer query
     * supersedes an older one, and an answer for a query the reader has since left (or a page they have since moved to) changes nothing.
     */
    search: command.waiting(Schema.Struct({ query: Schema.String }), {
      begin: ({ query }, current) => ({ ...current, search: { query, status: query.trim() === "" ? "idle" : "loading", hits: [] } }),
      work: ({ query }) => query.trim() === ""
        ? Effect.succeed([])
        : Nexus.Capability.require(Index).pipe(Effect.flatMap((index) => Effect.tryPromise(() => index.load())), Effect.map((loaded) => search(loaded, query))),
      wanted: ({ query }, current) => current.search.query === query && current.search.status === "loading",
      settle: (outcome, { query }, current) => ({ ...current, search: outcome.ok ? { query, status: "ready", hits: outcome.value } : { query, status: "failed", hits: [] } }),
    }),
  };
};

export const application = (program: Valance.Program, site: Site) => Valance.define({
  name: "docs",
  state: { schema: AppState, initial },
  views: { page: { program, scope: (state: AppState) => pageScope(site, state) } },
  view: () => "page" as const,
  commands: (state: Valance.StateHandle<AppState>) => commands(state, site),
});
