// The Web realization table: target configuration, not part of the application definition.
import * as Web from "@valancex/valance/web";

export const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  row: { element: "div" },
  button: { element: "button", events: { click: { type: "click" } } },
};
