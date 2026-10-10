// The browser half: the module the document loads. It reads what the server embedded, starts the MESH runtime, and runs the application with `Web.run`, taking over the server's HTML
// (`present: "hydrate"`). The site's plugins give the tags, the URL policy (history, links, Back) and the head (title, description, canonical, stylesheet); everything else (new tabs,
// modified clicks, other sites) stays with the browser.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Web from "@valancex/valance/web";
import { Effect } from "effect";

import "../styles/site.css";

import { application } from "../app/application.js";
import type { AppState } from "../app/state.js";
import type { Site } from "../model/site.js";

import type { Built } from "./built.js";
import { browserPlatform } from "./platform.js";
import { plugins } from "./plugins.js";
import { watchHeadings } from "./scrollspy.js";

const boot = JSON.parse(document.getElementById("valance-boot")!.textContent!) as { readonly program: Parameters<typeof application>[0]; readonly site: Site; readonly state: AppState; readonly built: Built };
const container = document.getElementById("app")!;

await init(wasmUrl);

try {
  const host = await Web.run(application(boot.program, boot.site), {
    container,
    present: "hydrate",
    state: boot.state,
    plugins: [...plugins(boot.site, boot.built), browserPlatform(window, boot.built)],
    shutdown: { grace: "250 millis" },                              // closing the page lets a command that is finishing finish, then ends the rest
  });

  // Once the page has taken over (what the reader chose last time would not match the server's HTML before): take back their choices, and follow where they scroll.
  const invoke = (key: string, value?: string) => { void Effect.runPromise(host.handle.invoke(key, value === undefined ? [] : [{ value }]) as Effect.Effect<unknown>).catch(() => undefined); };
  const spy = watchHeadings(window, (anchor) => { invoke("app/setActive", anchor); });

  invoke("app/restore");
  container.dataset["valance"] = "running";                      // readiness marker for whoever drives the page

  addEventListener("pagehide", (event) => { if (!event.persisted) { spy.stop(); void host.stop(); } });
} catch (error) {
  container.dataset["valance"] = "failed";
  console.error("the application did not start", error);        // the server's HTML stays as drawn
}
