// Where the application is drawn: which element each tag becomes. Target configuration, not part of the application, and the one declaration of the tags: MESH's manifest
// is derived from it (./compile.ts).
import * as Web from "@valancex/valance/web";

export const primitives: Web.WebPrimitives = {
  shell: { element: "div" },
  header: { element: "header" },
  nav: { element: "nav" },
  main: { element: "main" },
  footer: { element: "footer" },
  list: { element: "ul" },
  item: { element: "li" },
  heading: { element: "h1" },
  para: { element: "p" },
  code: { element: "pre" },
  text: { element: "span" },
  button: { element: "button", events: { click: { type: "click" } } },
  link: Web.link,                                                         // a destination: the application navigates, the browser keeps modified clicks
  // A text field. `value` is an attribute because the server must be able to write it (PORT 0.2.4 has no form that is both server-renderable and live; the release after it adds
  // `controlled`, and then this is the only line that changes). Reading the field's text on input is the payload hook, and states its kind for the manifest.
  field: {
    element: "input",
    props: { value: Web.attribute("value") },
    events: { input: Web.event("input", { kind: "string", of: (_event, element) => (element as HTMLInputElement).value }) },
  },
};
