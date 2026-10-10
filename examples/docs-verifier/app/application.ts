// The application: state, one view with a scope, and four commands. It names no target (no DOM, no Web) and reads no file: the site arrives as data and the compiled programs as an
// argument, so the same application runs on the server, in the browser and under a test.
import * as Valance from "@valancex/valance";
import { Schema } from "effect";

import type { Site } from "../model/site.js";

import { pageScope } from "./scope.js";
import { AppState, initial, Theme } from "./state.js";

/** The commands, a function of nothing but the state handle, so the build can read their names and inputs without a site (../web/compile.ts). */
export const commands = (state: Valance.StateHandle<AppState>) => {
  const command = Valance.command(state);

  return {
    /** Go to a page. Moving on clears the copied mark and closes the menu. */
    go: command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id, copied: "", menu: false })),
    /** A code block's copy button was pressed: remember which, so the page can say "Copied". */
    copyCode: command(Schema.Struct({ blockId: Schema.String }), ({ blockId }, current) => ({ ...current, copied: blockId })),
    /** Open or close the navigation on a small screen. */
    toggleMenu: command(Schema.Struct({}), (_input, current) => ({ ...current, menu: !current.menu })),
    /** Choose the colour theme. */
    setTheme: command(Schema.Struct({ theme: Theme }), ({ theme }, current) => ({ ...current, theme })),
  };
};

export const application = (program: Valance.Program, site: Site) => Valance.define({
  name: "docs",
  state: { schema: AppState, initial },
  views: { page: { program, scope: (state: AppState) => pageScope(site, state) } },
  view: () => "page" as const,
  commands,
});
