// The browser half of a real page: the module the document loads. It reads what the server embedded, starts the MESH runtime, and calls the web host
// (`run`, ./api/shape-b.ts) once, hydrating the server's HTML. The page's lifetime is the one Scope here: it ends when the page is hidden, which
// unmounts the target and ends the application, exactly as closing any Scope does. Nothing in this file owns the mount or reads `Mounted`: that is `run`'s.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { Effect, Fiber } from "effect";

import { run } from "./api/shape-b.js";
import { application, initialStateAt, primitives, stateOf, urlOf, type AppState, type Programs } from "./app.js";

const boot = JSON.parse(document.getElementById("valance-boot")!.textContent!) as { readonly programs: Programs; readonly state: AppState };
const container = document.getElementById("app")!;

await init(wasmUrl);
initialStateAt(window);                                                    // the application's first act: canonicalize the URL (replace, never push)

const page = Effect.runFork(Effect.scoped(Effect.gen(function* () {
  yield* run(application(boot.programs), { container, primitives, hydrate: true, state: boot.state, history: { window, urlOf, stateOf, navigate: "app/navigate" } });
  container.dataset["valance"] = "running";                               // readiness marker for whoever drives the page
  yield* Effect.never;
})));

addEventListener("pagehide", () => { void Effect.runPromise(Fiber.interrupt(page)); });
