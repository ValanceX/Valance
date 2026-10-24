// A terminal PORT, as small as one can be (Bet 12, section 4): it draws a render-v1 tree as lines of text cells and reports what a person does at a node by the handler identifier the tree
// carries. It is not a product. It exists to answer one question: is the contract, and the vocabulary designed for two targets, secretly shaped like the web and the Desktop? What it cannot draw
// it says so in `unsupported`, in its own data, and the kit holds it to that.
type Kind = "string" | "boolean" | "number" | readonly string[];

interface Def {
  readonly role?: string;
  readonly props: Readonly<Record<string, Kind>>;
  /** How a person acts on it: press it, tick it, or edit its text. */
  readonly act?: "press" | "tick" | "edit";
}

const STYLE: Kind = ["sm", "md", "lg"];
const INTENT: Kind = ["neutral", "primary", "danger"];

/** The vocabulary this PORT realizes: the portable core, and a few more that are only text. */
export const table: Readonly<Record<string, Def>> = {
  column: { props: {} },
  row: { props: {} },
  heading: { role: "heading", props: { level: "number" } },
  text: { props: { id: "string" } },
  paragraph: { role: "paragraph", props: { class: "string", id: "string" } },
  status: { role: "status", props: {} },
  alert: { role: "alert", props: {} },
  button: { role: "button", act: "press", props: { id: "string", disabled: "boolean", label: "string", class: "string", pressed: "string", intent: INTENT, size: STYLE } },
  toggle: { role: "button", act: "press", props: { pressed: "boolean", label: "string", disabled: "boolean", class: "string" } },
  checkbox: { role: "checkbox", act: "tick", props: { checked: "boolean", label: "string", invalid: "boolean", describedby: "string" } },
  textfield: { role: "textbox", act: "edit", props: { value: "string", placeholder: "string", label: "string", kind: "string", invalid: "boolean", describedby: "string" } },
};

/** What the PORT cannot draw, and why: the vectors of these are `unsupported`, not `fail`. */
export const unsupported = [
  { primitive: "dialog", case: "*", reason: "a terminal has no layer above the page" },
  { primitive: "popover", case: "*", reason: "a terminal has no layer above the page" },
  { primitive: "image", case: "*", reason: "a terminal draws text cells, not pictures" },
  { primitive: "radio", case: "*", reason: "no radio group yet: the skeleton draws only the portable core" },
  { primitive: "radiogroup", case: "*", reason: "no radio group yet: the skeleton draws only the portable core" },
  { primitive: "list", case: "*", reason: "no list yet: the skeleton draws only the portable core" },
  { primitive: "listitem", case: "*", reason: "no list yet: the skeleton draws only the portable core" },
  { primitive: "link", case: "*", reason: "a terminal has no address to follow" },
  { primitive: "label", case: "*", reason: "no label yet: the skeleton draws only the portable core" },
  { primitive: "blockquote", case: "*", reason: "no quotation yet" },
  { primitive: "code", case: "*", reason: "no code yet" },
  { primitive: "strong", case: "*", reason: "a terminal has no emphasis without colors" },
  { primitive: "emphasis", case: "*", reason: "a terminal has no emphasis without colors" },
  { primitive: "*", case: "key:", reason: "no keyboard yet: the skeleton is driven by calls" },
  { primitive: "textfield", case: "event:submit", reason: "no keyboard yet" },
  { primitive: "textfield", case: "event:cancel", reason: "no keyboard yet" },
] as const;

export interface Part {
  readonly key: string;
  readonly component: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly events: Readonly<Record<string, string>>;
  readonly children: ReadonlyArray<Part | { readonly key: string; readonly text: string }>;
}

export class Terminal {
  readonly parts = new Map<string, Part>();
  #root: Part | undefined;
  /** What the person has typed into a field, until the application renders: the application's value shows again then. */
  readonly typed = new Map<string, string>();

  constructor(private readonly report: (handler: string, payload?: unknown) => void) {}

  /** Draws `tree`, or throws: a component, a prop or a value this PORT does not realize is refused, never drawn. */
  draw(tree: { readonly root: Part }): void {
    const parts = new Map<string, Part>();
    const walk = (part: Part): void => {
      const def = table[part.component];

      if (def === undefined) {
        throw new Error(`no component ${part.component}`);
      }

      for (const [name, value] of Object.entries(part.props)) {
        const kind = def.props[name];
        const fits = Array.isArray(kind) ? kind.includes(value as string) : typeof value === kind;

        if (kind === undefined || !fits) {
          throw new Error(`${part.component}.${name} cannot be ${JSON.stringify(value)}`);
        }
      }

      parts.set(part.key, part);
      part.children.forEach((child) => "component" in child && walk(child));
    };

    walk(tree.root);
    this.parts.clear();
    parts.forEach((part, key) => this.parts.set(key, part));
    this.#root = tree.root;
    this.typed.clear();
  }

  /** The screen: one line per part that has words or can be acted on. */
  lines(): string[] {
    const out: string[] = [];
    const walk = (part: Part): void => {
      const text = this.text(part);
      const def = table[part.component]!;

      if (def.act === "press") out.push(`[ ${text || String(part.props["label"] ?? "")} ]`);
      else if (def.act === "tick") out.push(`[${part.props["checked"] === true ? "x" : " "}] ${String(part.props["label"] ?? "")}`);
      else if (def.act === "edit") out.push(`${String(part.props["label"] ?? "")}: ${this.typed.get(part.key) ?? String(part.props["value"] ?? "")}_`);
      else if (text !== "" && !part.children.some((child) => "component" in child)) out.push(text);

      part.children.forEach((child) => "component" in child && walk(child));
    };

    if (this.#root !== undefined) walk(this.#root);

    return out;
  }

  /** The words of a part and its descendants. */
  text(part: Part): string {
    return part.children.map((child) => ("component" in child ? this.text(child) : child.text)).join("");
  }

  /** The person acts on a part: press, tick, or type. Reports to the handler the tree gave. */
  act(key: string, how: { readonly kind: string; readonly text?: string }): void {
    const part = this.parts.get(key);
    const def = part === undefined ? undefined : table[part.component];

    if (part === undefined || def === undefined || part.props["disabled"] === true) {
      return;
    }

    const say = (event: string, payload?: unknown): void => {
      const handler = part.events[event];

      if (handler !== undefined) this.report(handler, payload);
    };

    if (how.kind === "activate" && def.act === "press")
      say(part.component === "toggle" ? "change" : "click", part.component === "toggle" ? part.props["pressed"] !== true : undefined);
    else if (how.kind === "activate" && def.act === "tick") say("change", part.props["checked"] !== true);
    else if (how.kind === "type" && def.act === "edit") {
      this.typed.set(key, how.text ?? "");
      say("change", how.text ?? "");
    } else if (how.kind === "focus" || how.kind === "blur") say(how.kind);
  }
}
