// Where the application is drawn: which element each tag becomes, and which attributes its props are. Target configuration, not part of the application, and the one declaration of
// the primitive tags: MESH's manifest is derived from it (./compile.ts). The composite components (layout, block, callout, code-block) are templates, not elements, and are not here.
//
// Styling hooks are attributes the templates write: a `class` for a part with a role of its own, a `data-*` for a variant (`data-theme`, `data-menu`, `data-tone`), an `aria-*` where
// the state is also an accessibility fact (`aria-current`, `aria-pressed`, `aria-label`). The stylesheet (../styles/site.css) is written against those and the elements.
import * as Web from "@valancex/valance/web";

const klass = Web.attribute("class");
const label = Web.attribute("aria-label");

export const primitives: Web.WebPrimitives = {
  shell: { element: "div", props: { class: klass, theme: Web.attribute("data-theme"), menu: Web.attribute("data-menu") } },
  header: { element: "header", props: { class: klass } },
  nav: { element: "nav", props: { class: klass, label } },
  main: { element: "main" },
  footer: { element: "footer" },
  div: { element: "div", props: { class: klass } },
  section: { element: "section" },
  aside: { element: "aside", props: { tone: Web.attribute("data-tone") } },
  figure: { element: "figure" },
  list: { element: "ul", props: { class: klass } },
  item: { element: "li" },
  h1: { element: "h1" },
  h2: { element: "h2" },
  h3: { element: "h3" },
  para: { element: "p", props: { class: klass } },
  pre: { element: "pre" },
  strong: { element: "strong" },
  code: { element: "code" },
  button: { element: "button", props: { class: klass }, events: { click: { type: "click" } } },
  toggle: { element: "button", props: { class: klass, label, pressed: Web.attribute("aria-pressed") }, events: { click: { type: "click" } } },
  link: Web.link,
  navLink: { element: "a", props: { href: Web.attribute("href"), class: klass, current: Web.attribute("aria-current") } },
};
