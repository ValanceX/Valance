// A target that draws the screen as indented text and lets a test "use" it: press a button by its label, type into a field by its placeholder. It stands for a person at a native window, and it
// knows nothing the render tree does not say. No DOM, no PORT.
import type { RenderTree } from "@valancex/mesh-runtime";
import type { Report, Target, TargetFactory } from "@valancex/valance";

type Node = RenderTree["root"]["children"][number];
type Element = Exclude<Node, { readonly type: "text" }>;

const textOf = (node: Node): string => (node.type === "text" ? node.text : node.children.map(textOf).join(""));

const draw = (node: Node, depth: number): ReadonlyArray<string> => {
  if (node.type === "text") {
    return [`${"  ".repeat(depth)}${node.text}`];
  }

  const pad = "  ".repeat(depth);
  const props = node.props as Readonly<Record<string, unknown>>;

  switch (node.component) {
    case "window":
      return [`${pad}[window: ${String(props["title"])}]`, ...node.children.flatMap((child) => draw(child, depth + 1))];
    case "heading":
      return [`${pad}# ${textOf(node)}`];
    case "button":
      return [`${pad}[ ${textOf(node)} ]${props["disabled"] === true ? " (disabled)" : ""}`];
    case "checkbox":
      return [`${pad}[${props["checked"] === true ? "x" : " "}]`];
    case "textfield":
      return [`${pad}<${String(props["value"]) === "" ? String(props["placeholder"] ?? "") : String(props["value"])}>`];
    case "row":
      return [`${pad}${node.children.flatMap((child) => draw(child, 0)).join(" ")}`];
    default:
      return node.children.flatMap((child) => draw(child, depth + (node.component === "column" ? 0 : 1)));
  }
};

const elements = (node: Node): ReadonlyArray<Element> => (node.type === "text" ? [] : [node, ...node.children.flatMap(elements)]);

export interface TextTarget extends Target {
  /** The screen as text. */
  readonly screen: () => string;
  /** Press the nth button whose label starts with `label` (a checkbox is pressed by the label of the row's button: `toggle("Milk")`). */
  readonly press: (label: string, nth?: number) => void;
  /** Tick or untick the checkbox in the row of the button labelled `label`. */
  readonly toggle: (label: string) => void;
  /** Type into the field with this placeholder, replacing its text. */
  readonly type: (placeholder: string, text: string) => void;
  /** How many times the screen was drawn afresh (a different screen) and updated (the same one). */
  readonly drawn: () => { readonly draws: number; readonly updates: number };
}

export const textTarget = (): TargetFactory<TextTarget> => (report: Report) => {
  let tree: RenderTree | undefined;
  let draws = 0;
  let updates = 0;
  const now = (): RenderTree => {
    if (tree === undefined) {
      throw new Error("nothing is drawn");
    }

    return tree;
  };
  const handlerOf = (element: Element, event: string): string => {
    const handler = (element.events as Readonly<Record<string, string>>)[event];

    if (handler === undefined) {
      throw new Error(`${element.component} has no ${event} handler`);
    }

    return handler;
  };

  return {
    draw: (next) => void ((tree = next), (draws += 1)),
    update: (next) => void ((tree = next), (updates += 1)),
    unmount: () => void (tree = undefined),
    screen: () => (tree === undefined ? "" : draw(tree.root, 0).join("\n")),
    drawn: () => ({ draws, updates }),
    press: (label, nth = 0) => {
      const hit = elements(now().root)
        .filter((element) => element.component === "button" && textOf(element).startsWith(label))
        .at(nth);

      if (hit === undefined) {
        throw new Error(`no button: ${label}\n${tree === undefined ? "" : draw(tree.root, 0).join("\n")}`);
      }
      if ((hit.props as Readonly<Record<string, unknown>>)["disabled"] === true) {
        return; // a disabled button does nothing, as on a screen
      }

      report(handlerOf(hit, "press"));
    },
    toggle: (label) => {
      const row = elements(now().root).find(
        (element) => element.component === "row" && element.children.some((child) => child.type !== "text" && child.component === "button" && textOf(child).startsWith(label)),
      );
      const box = row?.children.find((child): child is Element => child.type !== "text" && child.component === "checkbox");

      if (box === undefined) {
        throw new Error(`no checkbox in the row of: ${label}`);
      }

      report(handlerOf(box, "toggle"));
    },
    type: (placeholder, text) => {
      const field = elements(now().root).find(
        (element) => element.component === "textfield" && (element.props as Readonly<Record<string, unknown>>)["placeholder"] === placeholder,
      );

      if (field === undefined) {
        throw new Error(`no field: ${placeholder}`);
      }

      report(handlerOf(field, "change"), text);
    },
  };
};
