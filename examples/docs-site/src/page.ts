// The browser half: the module the document loads. It reads what the server embedded, starts the MESH runtime, and runs the application with `Web.run`, taking over the server's
// HTML (`present: "hydrate"`). Links are real anchors; `history` handles the application's own navigation, keeps the URL and the document title in step with the state, and leaves
// everything else (new tabs, modified clicks, other sites) to the browser.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Web from "@valancex/valance/web";

import { application, stateOf, titleOf, urlOf, type AppState, type Programs, type SearchDocs } from "./app.js";
import { primitives } from "./web.js";

const boot = JSON.parse(document.getElementById("valance-boot")!.textContent!) as { readonly programs: Programs; readonly state: AppState };
const container = document.getElementById("app")!;

/** The one thing the platform provides: search, from the server. `signal` aborts when the application closes. */
const searchDocs: SearchDocs = async (query, signal) => {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal });

  if (!response.ok) { throw new Error(`search answered ${response.status}`); }

  return await response.json() as ReadonlyArray<{ readonly id: string; readonly title: string }>;
};

await init(wasmUrl);

try {
  const host = await Web.run(application(boot.programs, searchDocs), {
    container,
    primitives,
    present: "hydrate",
    state: boot.state,
    history: { window, urlOf, stateOf, navigate: "go", titleOf, container },
  });

  container.dataset["valance"] = "running";                      // readiness marker for whoever drives the page

  // The page ends the application when the document is going away; a page stored in the back/forward cache (`persisted`) keeps running so it can be restored.
  addEventListener("pagehide", (event) => { if (!event.persisted) { void host.stop(); } });
} catch (error) {
  container.dataset["valance"] = "failed";
  console.error("the application did not start", error);        // the server's HTML stays as drawn
}
