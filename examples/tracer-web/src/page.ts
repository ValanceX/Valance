// The browser half of a real page: the module the document loads. It reads what the server embedded, starts the MESH runtime, and runs the application
// with `Web.run`, hydrating the server's HTML. The page's lifetime is the host's: `stop` ends it when the document is going away (`pagehide`, not persisted),
// which unmounts the target and ends the application. What the page does about a startup failure, or a mount that stops following, is the page's own
// policy (./api/shape-b.ts); the host only delivers the facts. Nothing in this file composes a lifetime.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Web from "@valancex/valance/web";

import { reportStartFailure, watchMount } from "./api/shape-b.js";
import { application, initialStateAt, primitives, stateOf, urlOf, type AppState, type Programs } from "./app.js";

const boot = JSON.parse(document.getElementById("valance-boot")!.textContent!) as { readonly programs: Programs; readonly state: AppState };
const container = document.getElementById("app")!;

await init(wasmUrl);
initialStateAt(window);                                                    // the application's first act: canonicalize the URL (replace, never push)

try {
  const host = await Web.run(application(boot.programs), { container, primitives, present: "hydrate", state: boot.state, history: { window, urlOf, stateOf, navigate: "app/navigate" } });

  watchMount(host.mounted);
  container.dataset["valance"] = "running";                               // readiness marker for whoever drives the page

  // `pagehide` ends the page only when the document is going away. With `persisted` the browser is storing this same document in the back/forward cache and may restore it
  // with `pageshow`: stopping then would restore a blank target and a dead application (observed, Stage 49), so a persisted `pagehide` leaves the page running.
  addEventListener("pagehide", (event) => { if (!event.persisted) { void host.stop(); } });
} catch (error) {
  // Startup failure policy (Stage 47): `Web.run` rejects with the existing failure (a corrupt embedded state is a typed `StartError`) after closing the lifetime it began.
  // The page says so, once, and marks itself; the server's HTML stays exactly as drawn (no fallback UI, no retry).
  container.dataset["valance"] = "failed";
  reportStartFailure(error);
}
