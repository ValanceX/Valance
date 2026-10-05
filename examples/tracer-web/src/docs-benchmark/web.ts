// The Web realization table: target configuration, not part of the application definition.
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
  // A link is a real anchor (its href is in the server's HTML), and a click must not also navigate the document: the only place PORT lets an event be
  // stopped is the hook that builds its payload.
  link: { element: "a", props: { href: Web.attribute("href") }, events: { click: { type: "click", payload: (event) => { event.preventDefault(); return null; } } } },
  field: { element: "input", props: { value: Web.attribute("value") }, events: { input: { type: "input", payload: (_event, element) => (element as HTMLInputElement).value } } },
};
