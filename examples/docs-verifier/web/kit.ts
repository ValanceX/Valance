// The documentation kit as a plugin: the tags the templates use, and the stylesheet that draws them. A value, not a registration: it does nothing until it is passed in `plugins`
// (./plugins.ts). This is the stand-in for the site kit external (../EXTERNALS.md, X6); the stylesheet it links is built from ../styles.
import type { Plugin } from "@valancex/valance/web/plugin";

import type { AppState } from "../app/state.js";

import type { Built } from "./built.js";
import { primitives } from "./primitives.js";

export const kit = (built: Pick<Built, "style" | "theme"> = {}): Plugin<AppState> => ({
  name: "site-kit",
  primitives,
  // The kit's stylesheet, then the site's own over it.
  ...(built.style === undefined ? {} : { head: () => ({ links: [{ rel: "stylesheet", href: built.style! }, ...(built.theme === undefined ? [] : [{ rel: "stylesheet", href: built.theme }])] }) }),
});
