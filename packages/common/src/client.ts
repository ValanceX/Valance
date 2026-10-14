// The browser half, for the generated entry (`.valance/client.ts`): start the MESH runtime and run the application, taking over the HTML the server wrote. An author never imports this.
import { webStore } from "./store.js";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import type * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";

import { Effect } from "effect";

import { webPlatform } from "./http.js";
import { watchViewport } from "./viewport.js";

import type { AppState, Built } from "./app.js";
import { application } from "./app.js";
import { plugin } from "./web-app.js";
import type { DefinedApp } from "./index.js";
import type { Content } from "./model.js";

export interface ClientParts {
  readonly content: Content;
  readonly program: Valance.Program;
  readonly author?: DefinedApp | undefined;
}

export const start = async ({ content, program, author }: ClientParts): Promise<void> => {
  const container = document.getElementById("app")!;

  try {
    const boot = JSON.parse(document.getElementById("valance-boot")!.textContent!) as { readonly state: AppState; readonly built: Built };

    await init(wasmUrl);

    const host = await Web.run(application(content, program, author), {
      container,
      present: "hydrate",
      state: boot.state,
      plugins: [plugin(content, boot.built, author)],
      // What the application's commands may ask the page for: the backend (`Http`), at `api.base` of valance.web.json.
      platform: webPlatform({ base: content.site.api, interceptors: author?.http?.interceptors ?? [], store: webStore(content.site.name) }),
      shutdown: { grace: "250 millis" },
    });

    // The server rendered for a wide window; tell the application how wide this one is (and keep telling it).
    const unwatch = watchViewport(window, (viewport) => {
      container.dataset["viewport"] = viewport; // for a stylesheet or a test; the layout reads the state's own `viewport`
      void Effect.runPromise(host.handle.invoke("app/resize", [{ value: viewport }])).catch(() => undefined);
    });

    container.dataset["valance"] = "running"; // readiness marker for whoever drives the page
    addEventListener("pagehide", (event) => {
      if (!event.persisted) {
        unwatch();
        void host.stop();
      }
    });
  } catch (error) {
    container.dataset["valance"] = "failed";
    console.error("the application did not start", error); // the server's HTML stays as drawn
  }
};
