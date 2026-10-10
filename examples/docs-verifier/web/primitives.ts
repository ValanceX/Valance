// Where the application is drawn: which element each tag becomes, and which attributes its props are. Target configuration, not part of the application, and the one declaration of
// the primitive tags: MESH's manifest is derived from it (./compile.ts). The composite components (layout, block, callout, code-block) are templates, not elements, and are not here.
//
// Styling hooks are attributes the templates write: a `class` for a part with a role of its own, a `data-*` for a variant (`data-theme`, `data-menu`, `data-tone`), an `aria-*` where
// the state is also an accessibility fact (`aria-current`, `aria-pressed`, `aria-label`). The stylesheet (../styles/site.css) is written against those and the elements.
import * as Web from "@valancex/valance/web";

const klass = Web.attribute("class");
const label = Web.attribute("aria-label");
const id = Web.attribute("id");
const role = Web.attribute("role");

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
  olist: { element: "ol", props: { class: klass } },
  table: { element: "table", props: { class: klass } },
  thead: { element: "thead" },
  tbody: { element: "tbody" },
  tr: { element: "tr" },
  th: { element: "th", props: { align: Web.attribute("data-align"), scope: Web.attribute("scope") } },
  td: { element: "td", props: { align: Web.attribute("data-align") } },
  image: { element: "img", props: { class: klass, src: Web.attribute("src"), alt: Web.attribute("alt"), loading: Web.attribute("loading") } },
  span: { element: "span", props: { class: klass } },
  em: { element: "em" },
  tablist: { element: "div", props: { class: klass, role, label } },
  tab: { element: "button", props: { class: klass, role, selected: Web.attribute("aria-selected") }, events: { click: { type: "click" } } },
  tabpanel: { element: "div", props: { class: klass, role } },
  item: { element: "li" },
  h1: { element: "h1", props: { id } },
  h2: { element: "h2", props: { id } },
  h3: { element: "h3", props: { id } },
  para: { element: "p", props: { class: klass } },
  pre: { element: "pre" },
  strong: { element: "strong" },
  code: { element: "code" },
  button: { element: "button", props: { class: klass }, events: { click: { type: "click" } } },
  toggle: { element: "button", props: { class: klass, label, pressed: Web.attribute("aria-pressed") }, events: { click: { type: "click" } } },
  link: Web.link,
  anchorLink: { element: "a", props: { href: Web.attribute("href"), class: klass, label } },
  navLink: { element: "a", props: { href: Web.attribute("href"), class: klass, current: Web.attribute("aria-current") } },
};
