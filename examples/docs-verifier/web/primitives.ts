// Where the application is drawn: which element each tag becomes. Target configuration, not part of the application, and the one declaration of the primitive tags: MESH's manifest
// is derived from it (./compile.ts). The composite components (layout, block, callout, code-block) are templates, not elements, and are not here.
import * as Web from "@valancex/valance/web";

export const primitives: Web.WebPrimitives = {
  shell: { element: "div" },
  header: { element: "header" },
  nav: { element: "nav" },
  main: { element: "main" },
  footer: { element: "footer" },
  section: { element: "section" },
  aside: { element: "aside" },
  figure: { element: "figure" },
  list: { element: "ul" },
  item: { element: "li" },
  h1: { element: "h1" },
  h2: { element: "h2" },
  h3: { element: "h3" },
  para: { element: "p" },
  pre: { element: "pre" },
  strong: { element: "strong" },
  text: { element: "span" },
  code: { element: "code" },
  button: { element: "button", events: { click: { type: "click" } } },
  link: Web.link,
};
