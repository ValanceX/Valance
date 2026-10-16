// The web half of the application: the plugin that makes it a website (its tags, its URL policy, its document head). Kept apart from `app.ts` so that a target that is not the web does not carry the
// web's tag table or any of PORT Web with it.
import type { Plugin } from "@valancex/valance/web/plugin";

import type { AppState, Built } from "./app.js";
import { titleFor } from "./app.js";
import type { DefinedApp } from "./index.js";
import type { Content } from "./model.js";
import { pageAt } from "./scope.js";
import { primitives } from "./primitives.js";
import { routes } from "./routes.js";
import { routingFor } from "./routing-engine.js";
import { pageUrl } from "./url.js";

/** The plugin that makes the application a website: its tags, its URL policy, and its document head. */
export const plugin = (content: Content, built: Built, author?: DefinedApp): Plugin<AppState> => ({
  name: "valance-app",
  primitives,
  routes: routes(content, routingFor(author)) as never,
  head: (state) => {
    const page = pageAt(content, state.page);
    const shown = page ?? { description: "" };
    const path = page?.path ?? (state.route === "" ? undefined : state.page.split("?")[0]);
    const canonical =
      content.site.url === "" || path === undefined ? [] : [{ rel: "canonical", href: `${content.site.url}${pageUrl(content.site.base, path, content.site.trailingSlash)}` }];

    return {
      title: titleFor(content, page, state, author),
      meta: shown.description === "" ? [] : [{ name: "description", content: shown.description }],
      links: [...built.styles.map((href) => ({ rel: "stylesheet", href })), ...canonical],
    };
  },
});
