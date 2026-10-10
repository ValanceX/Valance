import * as Web from "@valancex/valance/web";

import { counter } from "./counter.js";

const container = document.getElementById("app")!;

// `present: "mount"` draws; `"hydrate"` takes over HTML the server already wrote.
const host = await Web.run(counter, {
  container,
  present: "mount",
  primitives: { page: { element: "div" }, text: { element: "span" }, button: { element: "button", events: { click: { type: "click" } } } },
});

// Ending the page ends the application: its admitted commands are interrupted and awaited, then its resources are released.
addEventListener("pagehide", () => { void host.stop(); });
