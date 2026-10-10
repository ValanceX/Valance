import * as Web from "@valancex/valance/web";
import { renderHead } from "@valancex/valance/web/plugin";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";

import { counter } from "./counter.js";
import { siteHead } from "./a-plugin.js";

const primitives = { page: { element: "div" }, text: { element: "span" }, button: { element: "button", events: { click: { type: "click" } } } } as const;
const plugins = [siteHead("Counter")];

// The server renders the page with the plugins, and writes the head they say.
const served = await Effect.runPromise(renderToHtml(counter, { primitives, plugins }));

console.log(renderHead(served.head));

// The browser runs with the same plugins, and takes over the server's HTML.
export const start = (container: Element) => Web.run(counter, { container, present: "hydrate", state: served.state, primitives, plugins });
