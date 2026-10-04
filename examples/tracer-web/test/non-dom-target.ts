// A throwaway diagnostic target: no DOM, no Web, no PORT. It exists to observe what the Target seam hands a target (draw / update / unmount
// and a render-v1 tree) and what a target must hand back (Report: a handler identifier and a payload). It is not a PORT and not a framework.
//
// It imports TYPES only, from the two packages the Target contract itself names. Nothing here may touch a DOM, a browser global, or port-web:
// `non-dom-target.test.ts` enforces that on this file's source.
import type { RenderTree } from "@valancex/mesh-runtime";
import type { Report, Target, TargetFactory } from "@valancex/valance";

type Child = RenderTree["root"]["children"][number];

/** One call the target received, exactly as received. */
export interface Call {
  readonly op: "draw" | "update" | "unmount";
  /** The render-v1 tree handed over, by reference (absent for `unmount`). */
  readonly tree?: RenderTree;
  /** The text realization of that tree. */
  readonly text?: string;
}

/** One interaction the target reported, and the handler it found in the tree. */
export interface Reported {
  readonly label: string;
  readonly event: string;
  readonly handler: string;
}

const textOf = (node: Child): string => node.type === "text" ? node.text : node.children.map(textOf).join("");

/** Plain text: one line per primitive node, children indented; text runs inline; a node with events shows them as `{event}`. */
const lines = (node: Child, depth: number): ReadonlyArray<string> => {
  if (node.type === "text") {
    return [`${"  ".repeat(depth)}${JSON.stringify(node.text)}`];
  }

  const props = Object.entries(node.props).map(([name, value]) => ` ${name}=${JSON.stringify(value)}`).join("");
  const events = Object.keys(node.events).map((name) => `{${name}}`).join("");

  return [`${"  ".repeat(depth)}<${node.component}${props}>${events}`, ...node.children.flatMap((child) => lines(child, depth + 1))];
};

export const render = (tree: RenderTree): string => lines(tree.root, 0).join("\n");

/** Every node of the tree that has an event, with its text (a button's label), in document order. */
const interactive = (node: Child): ReadonlyArray<{ label: string; event: string; handler: string }> =>
  node.type === "text" ? [] : [
    ...Object.entries(node.events).map(([event, handler]) => ({ label: textOf(node), event, handler })),
    ...node.children.flatMap(interactive),
  ];

export interface TextTarget extends Target {
  /** What the target was handed, in order. */
  readonly calls: ReadonlyArray<Call>;
  /** What the target reported, in order. */
  readonly reports: ReadonlyArray<Reported>;
  /** The text of what is currently drawn. */
  readonly screen: () => string;
  /** The user "activates" the `index`th interactive node whose text starts with `label`: reports its handler, found in the drawn tree. */
  readonly activate: (label: string, index?: number) => void;
}

export const textTarget = (): TargetFactory<TextTarget> => (report: Report) => {
  const calls: Array<Call> = [];
  const reports: Array<Reported> = [];
  let drawn: RenderTree | undefined;

  const present = (op: "draw" | "update", tree: RenderTree): void => {
    calls.push({ op, tree, text: render(tree) });
    drawn = tree;
  };

  return {
    calls,
    reports,
    draw: (tree) => present("draw", tree),
    update: (tree) => present("update", tree),
    unmount: () => { calls.push({ op: "unmount" }); drawn = undefined; },
    screen: () => drawn === undefined ? "" : render(drawn),
    activate: (label, index = 0) => {
      const hit = drawn === undefined ? undefined : interactive(drawn.root).filter((node) => node.label.startsWith(label))[index];

      if (hit === undefined) {
        throw new Error(`nothing to activate: ${label}`);
      }

      reports.push(hit);
      report(hit.handler);
    },
  };
};
