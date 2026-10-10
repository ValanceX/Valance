// The browser half, for the generated entry (`.valance/client.ts`): start the MESH runtime and run the application, taking over the HTML the server wrote. An author never imports this.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import type * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";

import type { AppState, Built } from "./app.js";
import { application, plugin } from "./app.js";
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
      plugins: [plugin(content, boot.built)],
      shutdown: { grace: "250 millis" },
    });

    container.dataset["valance"] = "running";                      // readiness marker for whoever drives the page
    addEventListener("pagehide", (event) => { if (!event.persisted) { void host.stop(); } });
  } catch (error) {
    container.dataset["valance"] = "failed";
    console.error("the application did not start", error);        // the server's HTML stays as drawn
  }
};
