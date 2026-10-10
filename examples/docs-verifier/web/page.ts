// The browser half: the module the document loads. It reads what the server embedded, starts the MESH runtime, and runs the application with `Web.run`, taking over the server's HTML
// (`present: "hydrate"`). The compiled views are part of this script (the build compiled them once, for every page). The site's plugins give the tags, the URL policy (history,
// links, Back) and the head (title, description, canonical, stylesheet), and the browser's platform gives the clipboard, a store, the search index and the pages; everything else (new
// tabs, modified clicks, other sites) stays with the browser.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Web from "@valancex/valance/web";
import { Effect } from "effect";

import "../styles/site.css";

import programText from "../generated/program.json?raw";

import { application } from "../app/application.js";
import type { AppState } from "../app/state.js";
import type { SiteMap } from "../model/site.js";

import type { Built } from "./built.js";
import { browserPlatform } from "./platform.js";
import { plugins } from "./plugins.js";
import { watchHeadings } from "./scrollspy.js";

const boot = JSON.parse(document.getElementById("valance-boot")!.textContent!) as { readonly map: SiteMap; readonly state: AppState; readonly built: Built };
const container = document.getElementById("app")!;

await init(wasmUrl);

try {
  const host = await Web.run(application(JSON.parse(programText) as Parameters<typeof application>[0], boot.map), {
    container,
    present: "hydrate",
    state: boot.state,
    plugins: [...plugins(boot.map, boot.built), browserPlatform(window, boot.built)],
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
