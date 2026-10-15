// The tags a layout or component may use, and the element each becomes. This is the vocabulary of the application model: a template says `<nav>`, `<link>`, `<para>`, and this table says
// what they are on the web. It is also what the MESH manifest is derived from, so a tag that is not here is a compile error that names it.
//
// Styling hooks are attributes: `class` for a part with a role of its own, `theme` (the `data-theme` attribute) for a variant, `label` (`aria-label`) and `current` (`aria-current`) where
// the state is an accessibility fact too. A stylesheet is written against those and the elements.
import * as Web from "@valancex/valance/web";

const klass = Web.attribute("class");
const id = Web.attribute("id");
const label = Web.attribute("aria-label");

// A prop a tag declares is a prop every use of it must write (docs/application-model/HANDOFF.md, finding D1: MESH derives "required" from the realization and has no optional prop). So the
// table is many narrow tags rather than a few wide ones: a tag carries only what its uses always have.
export const primitives: Web.WebPrimitives = {
  // The portable core (the same names, props, events and payloads as the Desktop PORT's vocabulary: a component written with only these runs on both targets). `column` and `row` are custom
  // elements, because this table cannot give a `div` a fixed attribute to tell them apart; `vlx` ships their layout (`core.css`). `heading` is an `h2` with its level as `aria-level`.
  column: { element: "vlx-column" },
  row: { element: "vlx-row" },
  heading: { element: "h2", props: { level: Web.attribute("aria-level") } },
  text: { element: "span" },
  shell: { element: "div", props: { class: klass, theme: Web.attribute("data-theme") } },
  div: { element: "div", props: { class: klass } },
  header: { element: "header", props: { class: klass } },
  footer: { element: "footer", props: { class: klass } },
  main: { element: "main", props: { id, tabindex: Web.attribute("tabindex") } },
  nav: { element: "nav", props: { class: klass, label } },
  aside: { element: "aside", props: { class: klass } },
  section: { element: "section" },
  article: { element: "article" },
  h1: { element: "h1", props: { id } },
  h2: { element: "h2", props: { id } },
  h3: { element: "h3", props: { id } },
  para: { element: "p", props: { class: klass } },
  quote: { element: "blockquote", props: { class: klass } },
  list: { element: "ul", props: { class: klass } },
  olist: { element: "ol", props: { class: klass } },
  item: { element: "li" },
  pre: { element: "pre", props: { class: klass, tabindex: Web.attribute("tabindex") } },
  code: { element: "code" },
  strong: { element: "strong" },
  em: { element: "em" },
  span: { element: "span", props: { class: klass } },
  image: { element: "img", props: { class: klass, src: Web.attribute("src"), alt: Web.attribute("alt"), loading: Web.attribute("loading") } },
  /** A link inside text. */
  a: { element: "a", props: { href: Web.attribute("href") } },
  /** A link that is part of the page's furniture (navigation, a brand): it has a class, and says whether it is where you are (`aria-current`: "page" or "false"). */
  link: { element: "a", props: { href: Web.attribute("href"), class: klass, current: Web.attribute("aria-current") } },
  /** A box to tick, reporting `change` with the new value (a boolean). It is an `<input type="checkbox">` (a constant attribute of the primitive), and `checked` is live and server-rendered (`controlledBoolean`). */
  checkbox: {
    element: "input",
    attributes: { type: "checkbox" },
    props: { checked: Web.controlledBoolean("checked"), label },
    events: { change: Web.event("change", { kind: "boolean", of: (_event, element) => (element as HTMLInputElement).checked }) },
  },
  /** A text field, reporting `change` with the new text (a string); the field shows what the state says. */
  textfield: {
    element: "input",
    props: { value: Web.controlled("value"), placeholder: Web.attribute("placeholder"), label },
    events: {
      change: Web.event("input", { kind: "string", of: (_event, element) => (element as HTMLInputElement).value }),
      // Enter: the person is done with what they typed
      submit: Web.event("keydown", undefined, { key: "Enter" }),
      // Escape: the person backs out of what they typed
      cancel: Web.event("keydown", undefined, { key: "Escape" }),
    },
  },
  button: { element: "button", props: { class: klass, pressed: Web.attribute("aria-pressed"), disabled: Web.booleanAttribute("disabled") }, events: { click: { type: "click" } } },
};
