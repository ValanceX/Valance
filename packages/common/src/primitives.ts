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
  text: { element: "span", props: { id } },
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
  para: { element: "p", props: { class: klass, id } },
  quote: { element: "blockquote", props: { class: klass } },
  list: { element: "ul", props: { class: klass } },
  olist: { element: "ol", props: { class: klass } },
  item: { element: "li" },
  pre: { element: "pre", props: { class: klass, tabindex: Web.attribute("tabindex") } },
  code: { element: "code" },
  strong: { element: "strong" },
  em: { element: "em" },
  span: { element: "span", props: { class: klass, id } },
  image: {
    element: "img",
    props: {
      class: klass,
      src: Web.attribute("src"),
      alt: Web.attribute("alt"),
      loading: Web.attribute("loading"),
      width: Web.attribute("width"),
      height: Web.attribute("height"),
    },
  },
  /** A link inside text. */
  a: { element: "a", props: { href: Web.attribute("href") } },
  /** A link that is part of the page's furniture (navigation, a brand): it has a class, and says whether it is where you are (`aria-current`: "page" or "false"). */
  link: { element: "a", props: { href: Web.attribute("href"), class: klass, current: Web.attribute("aria-current") } },
  // The state of a control a person fills in, and what explains it (docs/application-model/FORM-PRIMITIVES.md). `invalid` is `aria-invalid`, a text attribute that is written "true" or "false" from the boolean
  // the template gives (a text slot takes a boolean's text). It is a boolean for the template, as it is on the desktop: the vocabulary's `types` says so (vocabulary.ts), since the table cannot. A boolean
  // attribute by presence would write `aria-invalid=""`, which assistive technology reads as false. `describedby` is `aria-describedby`: the `id` of the text that explains the control.
  /** A box to tick, reporting `change` with the new value (a boolean). It is an `<input type="checkbox">` (a constant attribute of the primitive), and `checked` is live and server-rendered (`controlledBoolean`). */
  checkbox: {
    element: "input",
    attributes: { type: "checkbox" },
    props: { checked: Web.controlledBoolean("checked"), label, invalid: Web.attribute("aria-invalid"), describedby: Web.attribute("aria-describedby") },
    events: { change: Web.event("change", { kind: "boolean", of: (_event, element) => (element as HTMLInputElement).checked }) },
  },
  /**
   * A text field, reporting `change` with the new text (a string); the field shows what the state says. `kind` is the input's `type` (`text` by default, `password`, `email`, `number`, `search`, `tel`,
   * `url`). `focus` and `blur` are the person coming into the field and leaving it: the forms of the DOM events that bubble (`focusin`, `focusout`), because events are delegated.
   */
  textfield: {
    element: "input",
    props: {
      value: Web.controlled("value"),
      placeholder: Web.attribute("placeholder"),
      label,
      kind: Web.attribute("type"),
      invalid: Web.attribute("aria-invalid"),
      describedby: Web.attribute("aria-describedby"),
    },
    events: {
      change: Web.event("input", { kind: "string", of: (_event, element) => (element as HTMLInputElement).value }),
      // Enter: the person is done with what they typed
      submit: Web.event("keydown", undefined, { key: "Enter" }),
      // Escape: the person backs out of what they typed
      cancel: Web.event("keydown", undefined, { key: "Escape" }),
      // The person came into the field, and left it
      focus: Web.event("focusin"),
      blur: Web.event("focusout"),
    },
  },
  /**
   * A group of radios: choose one of a few (docs/application-model/CHOICE-GROUP.md). `label` names the group for assistive technology; `invalid` and `describedby` are as on the other controls. It has
   * no events: its radios raise them.
   */
  radiogroup: {
    element: "div",
    attributes: { role: "radiogroup" },
    props: { class: klass, label, invalid: Web.attribute("aria-invalid"), describedby: Web.attribute("aria-describedby") },
  },
  /**
   * One option of a `radiogroup`. `checked` says whether it is the selected one (live, and server-rendered, like the checkbox's); `value` is what selecting it reports, as the `select` event's string.
   * The same `name` on the radios of a group gives the browser its arrow keys and its one Tab stop. Selecting the option already selected raises nothing.
   */
  radio: {
    element: "input",
    attributes: { type: "radio" },
    props: { checked: Web.controlledBoolean("checked"), value: Web.attribute("value"), label, name: Web.attribute("name"), disabled: Web.booleanAttribute("disabled") },
    events: { select: Web.event("change", { kind: "string", of: (_event, element) => (element as HTMLInputElement).value }) },
  },
  /**
   * A caption and the control it names: the text written directly inside is the control's visible name, and a click on it does what a click on the control does (it is a `<label>` that wraps
   * its control, so no `id` ties the two). A control inside takes its accessible name from it; the control's own `label` (`aria-label`) is only for a control with no caption. The Desktop PORT's
   * `label` is the same shape (docs/application-model/CHOICE-GROUP.md, WA-14).
   */
  label: { element: "label", props: { class: klass } },
  // A static table (docs/application-model/TABLE.md): the native elements, so no ARIA beyond what a prop says. `tablehead` and `tablebody` are required around the rows: the browser inserts a `<tbody>` into
  // server-rendered HTML that has none, and a tree with rows straight in the table would not hydrate against what it parsed. `scope` is a constant attribute of the header primitives; `sort` is `aria-sort`.
  table: { element: "table", props: { class: klass, label } },
  tablehead: { element: "thead" },
  tablebody: { element: "tbody" },
  tablerow: { element: "tr", props: { class: klass } },
  columnheader: { element: "th", attributes: { scope: "col" }, props: { sort: Web.attribute("aria-sort") } },
  rowheader: { element: "th", attributes: { scope: "row" } },
  cell: { element: "td" },
  button: { element: "button", props: { class: klass, label, pressed: Web.attribute("aria-pressed"), disabled: Web.booleanAttribute("disabled") }, events: { click: { type: "click" } } },
};
