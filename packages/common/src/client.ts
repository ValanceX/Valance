// The browser half, for the generated entry (`.valance/client.ts`): start the MESH runtime and run the application, taking over the HTML the server wrote. An author never imports this.
import { webStore } from "./store.js";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import type * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";

import { Effect } from "effect";

import { webPlatform } from "./http.js";
import { watchColorScheme } from "./color-scheme.js";
import { watchViewport } from "./viewport.js";

import type { AppState, Built } from "./app.js";
import { application, stateFor } from "./app.js";
import { plugin } from "./web-app.js";
import { urlOf } from "./routes.js";
import { pageAt } from "./scope.js";
import { routingFor } from "./routing-engine.js";
import type { DefinedApp } from "./index.js";
import type { Content } from "./model.js";

export interface ClientParts {
  readonly content: Content;
  readonly program: Valance.Program;
  readonly author?: DefinedApp | undefined;
}

/** The state to start from: the server's, unless the address bar names another address of a declared route (a query the static page could not see). */
const firstState = (content: Content, served: AppState, author?: DefinedApp): AppState => {
  if (author?.routes === undefined || window.location.search === "") {
    return served;
  }

  const here = stateFor(content, window.location.pathname, author, window.location.search);

  return here.route === "" || here.page === served.page
    ? served
    : {
        ...served,
        page: here.page,
        route: here.route,
        trail: here.trail,
        cursor: here.cursor,
        ...routedOwn(here, served),
      };
};

/** The fields the route's `enter` set, which the served state did not have. */
const routedOwn = (here: AppState, served: AppState): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(here).filter(
      ([name, value]) => !["page", "route", "trail", "cursor", "viewport", "colorScheme"].includes(name) && JSON.stringify(value) !== JSON.stringify(served[name]),
    ),
  );

/**
 * Moves the address bar to the page's canonical form (the site's `trailingSlash`, the query in the router's order) with `replaceState`: no new entry and no reload. A static host cannot redirect for
 * the application, so this is where the policy is kept; the canonical link says the same to a search engine. An address that is not a page is left as it was written.
 */
const canonicalize = (content: Content, state: AppState): void => {
  if (state.route === "" && pageAt(content, state.page) === undefined) {
    return;
  }

  const want = urlOf(content, state.page);

  if (want !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(window.history.state, "", `${want}${window.location.hash}`);
  }
};

export const start = async ({ content, program, author }: ClientParts): Promise<void> => {
  const container = document.getElementById("app")!;

  try {
    const boot = JSON.parse(document.getElementById("valance-boot")!.textContent!) as {
      readonly state?: AppState;
      readonly shell?: true;
      readonly built: Built;
    };

    await init(wasmUrl);

    // The shell has drawn nothing and knows no address; the address bar is the first state (R-34). A static page cannot know the query it is opened with, and the address bar does: for a declared
    // route the first state is the address the person is at, so `?tab=open` is not lost.
    const shell = boot.shell === true;
    const first = shell ? stateFor(content, window.location.pathname, author, window.location.search) : firstState(content, boot.state!, author);

    canonicalize(content, first);

    const host = await Web.run(application(content, program, author), {
      container,
      present: shell ? "mount" : "hydrate",
      state: first,
      plugins: [plugin(content, boot.built, author)],
      // What the application's commands may ask the page for: the backend (`Http`), at `api.base` of valance.web.json.
      platform: webPlatform({
        base: content.site.api,
        interceptors: author?.http?.interceptors ?? [],
        store: webStore(content.site.name),
      }),
      shutdown: { grace: "250 millis" },
    });

    // The server rendered for a wide window; tell the application how wide this one is (and keep telling it).
    const unwatchScheme = watchColorScheme(window, (scheme) => {
      container.dataset["colorScheme"] = scheme; // for a stylesheet or a test; the layout reads the state's own `colorScheme`
      void Effect.runPromise(host.handle.invoke("app/colorScheme", [{ value: scheme }])).catch(() => undefined);
    });
    const unwatch = watchViewport(window, (viewport) => {
      container.dataset["viewport"] = viewport; // for a stylesheet or a test; the layout reads the state's own `viewport`
      void Effect.runPromise(host.handle.invoke("app/resize", [{ value: viewport }])).catch(() => undefined);
    });

    // A route's `canDeactivate` also guards closing the page (R-64). A browser cannot wait for an answer, so only a guard that answers `false` at once can make it ask the person.
    const routing = routingFor(author);

    if (routing.hasGuards) {
      addEventListener("beforeunload", (event) => {
        const read = Effect.runSyncExit(host.handle.state);

        if (read._tag === "Success" && routing.leaveBlocked(read.value as never)) {
          event.preventDefault();
          event.returnValue = ""; // some browsers still need it
        }
      });
    }

    container.dataset["valance"] = "running"; // readiness marker for whoever drives the page
    addEventListener("pagehide", (event) => {
      if (!event.persisted) {
        unwatch();
        unwatchScheme();
        void host.stop();
      }
    });
  } catch (error) {
    container.dataset["valance"] = "failed";
    console.error("the application did not start", error); // the server's HTML stays as drawn
  }
};
