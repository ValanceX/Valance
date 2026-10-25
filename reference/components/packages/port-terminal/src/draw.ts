// Drawing a render tree as text cells. Pure: a tree and a focus in, lines and the controls in them out. A primitive this PORT does not draw is drawn as its content and named in `limits`, never
// silently (the style contract's rule: report, do not widen).
import type { RenderTree } from "@valancex/mesh-runtime";

import type { Palette } from "./palette.js";
import { background, BOLD, foreground, RESET, REVERSE } from "./palette.js";

type Child = RenderTree["root"]["children"][number];
type Node = Extract<Child, { readonly type: "node" }>;

export interface Control {
  readonly key: string;
  readonly kind: "button" | "toggle" | "checkbox" | "textfield";
  /** What a person is told it is: its `label`, else its text. */
  readonly label: string;
  /** The handler of each event the node binds, as the tree gave it. */
  readonly events: Readonly<Record<string, string>>;
  readonly value: string | boolean;
}

/** A block of text cells: plain lines and the same lines with colors. */
interface Block {
  readonly plain: ReadonlyArray<string>;
  readonly ansi: ReadonlyArray<string>;
}

export interface Drawn {
  readonly plain: ReadonlyArray<string>;
  readonly ansi: ReadonlyArray<string>;
  readonly controls: ReadonlyArray<Control>;
  /** The primitives this PORT does not draw, each named once: what it cannot realize. */
  readonly limits: ReadonlyArray<string>;
}

/** The primitives with a drawing here. Anything else is a limit. */
export const DRAWN: ReadonlyArray<string> = ["column", "row", "heading", "text", "paragraph", "button", "toggle", "checkbox", "textfield", "label", "list", "listitem", "status", "alert", "strong", "emphasis", "code", "span", "div"];

const textOf = (node: Child): string => (node.type === "text" ? node.text : node.children.map(textOf).join(""));
/** A string prop as it is; a number or boolean prop as the runtime wrote it (`propText`): a renderer never converts a value itself. */
const propText = (node: Node, name: string): string => {
  const value = node.props[name];

  return typeof value === "string" ? value : (node.propText?.[name] ?? "");
};
const one = (text: string): Block => ({ plain: [text], ansi: [text] });
const width = (text: string): number => [...text].length;
const pad = (line: string, to: number, plainWidth: number): string => line + " ".repeat(Math.max(0, to - plainWidth));

const stack = (blocks: ReadonlyArray<Block>): Block => ({ plain: blocks.flatMap((each) => each.plain), ansi: blocks.flatMap((each) => each.ansi) });

const side = (blocks: ReadonlyArray<Block>): Block => {
  const height = Math.max(1, ...blocks.map((each) => each.plain.length));
  const widths = blocks.map((each) => Math.max(0, ...each.plain.map(width)));
  const rows = Array.from({ length: height }, (_, line) => ({
    plain: blocks.map((each, at) => pad(each.plain[line] ?? "", widths[at]!, width(each.plain[line] ?? ""))).join("  "),
    ansi: blocks.map((each, at) => pad(each.ansi[line] ?? "", widths[at]!, width(each.plain[line] ?? ""))).join("  "),
  }));

  return { plain: rows.map((each) => each.plain.trimEnd()), ansi: rows.map((each) => each.ansi) };
};

export const draw = (tree: RenderTree | undefined, palette: Palette, focus: string | undefined, typed: ReadonlyMap<string, string>): Drawn => {
  const controls: Array<Control> = [];
  const limits = new Set<string>();
  const paint = (text: string, ...codes: ReadonlyArray<string>): string => `${codes.join("")}${text}${RESET}`;
  /** The caption of the `label` the node is inside: it names the control by containment. */
  let caption = "";

  const block = (node: Child): Block => {
    if (node.type === "text") {
      return node.text === "" ? { plain: [], ansi: [] } : one(node.text);
    }

    const inside = (): ReadonlyArray<Block> => node.children.map(block).filter((each) => each.plain.length > 0);
    const marked = (text: string): string => (node.key === focus ? paint(text, REVERSE) : text);
    const control = (kind: Control["kind"], label: string, value: string | boolean): void => {
      controls.push({ key: node.key, kind, label, events: node.events, value });
    };

    switch (node.component) {
      case "column":
      case "list":
      case "div":
        return stack(inside());
      case "row":
        return side(inside());
      case "label": {
        const outer = caption;

        caption = [...node.children].filter((each) => each.type === "text" || each.component === "text").map(textOf).join(" ");

        const inner = side(inside());

        caption = outer;

        return inner;
      }
      case "span":
      case "strong":
      case "emphasis":
      case "code":
      case "text":
      case "paragraph": {
        const text = textOf(node);

        return text === "" ? stack(inside()) : { plain: [text], ansi: [paint(text, foreground(palette.text))] };
      }
      case "listitem": {
        const inner = stack(inside());

        return { plain: inner.plain.map((line, at) => `${at === 0 ? "- " : "  "}${line}`), ansi: inner.ansi.map((line, at) => `${at === 0 ? "- " : "  "}${line}`) };
      }
      case "heading": {
        const text = textOf(node);

        return { plain: [text, "=".repeat(width(text))], ansi: [paint(text, BOLD, foreground(palette.text)), paint("=".repeat(width(text)), foreground(palette.border))] };
      }
      case "status":
      case "alert": {
        const text = `${node.component === "alert" ? "!" : "*"} ${textOf(node)}`;

        return { plain: [text], ansi: [paint(text, foreground(node.component === "alert" ? palette.danger : palette.muted))] };
      }
      case "button": {
        const label = propText(node, "label") || textOf(node);

        control("button", label, label);

        return { plain: [`[ ${label} ]`], ansi: [marked(paint(`[ ${label} ]`, background(palette.accent), foreground(palette.onAccent)))] };
      }
      case "toggle": {
        const label = propText(node, "label") || textOf(node);
        const on = node.props["pressed"] === true;

        control("toggle", label, on);

        return { plain: [`(${on ? "*" : " "}) ${label}`], ansi: [marked(`(${on ? "*" : " "}) ${label}`)] };
      }
      case "checkbox": {
        const label = propText(node, "label") || textOf(node);
        const on = node.props["checked"] === true;

        control("checkbox", label, on);

        return { plain: [`[${on ? "x" : " "}] ${label}`], ansi: [marked(`[${on ? "x" : " "}] ${label}`)] };
      }
      case "textfield": {
        const value = typed.get(node.key) ?? propText(node, "value");
        const label = propText(node, "label") || caption;
        const shown = propText(node, "label");
        const invalid = node.props["invalid"] === true;

        control("textfield", label, value);

        const cells = `${value}${node.key === focus ? "_" : ""}`;
        const text = `${shown === "" ? "" : `${shown}: `}[${cells.padEnd(12)}]${invalid ? " !" : ""}`;

        return { plain: [text], ansi: [marked(paint(text, foreground(invalid ? palette.danger : palette.text)))] };
      }
      default:
        limits.add(node.component);

        return stack(inside());
    }
  };

  const root = tree === undefined ? { plain: [], ansi: [] } : block(tree.root);

  return { plain: root.plain, ansi: root.ansi, controls, limits: [...limits].sort() };
};
