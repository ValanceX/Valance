// The Web realization table: target configuration. The application definition (./app.ts) never sees it.
import * as Web from "@valancex/valance/web";

export const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  button: { element: "button", events: { click: { type: "click" } } },
};
