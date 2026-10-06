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
  field: Web.textField,                                                   // a text field: the box always shows the rendered value, and input carries what was typed
};
