// A second target, written for the tests and nothing else: no DOM, no PORT. It draws a render tree as indented text and reports the handler of a node a person "activates". It exists to measure
// which parts of the application model are the web's (see second-target.test.ts). Adapted from examples/tracer-web/test/non-dom-target.ts.
import type { RenderTree } from "@valancex/mesh-runtime";
import type { Report, Target, TargetFactory } from "@valancex/valance";

type Child = RenderTree["root"]["children"][number];

const textOf = (node: Child): string => (node.type === "text" ? node.text : node.children.map(textOf).join(""));

const lines = (node: Child, depth: number): ReadonlyArray<string> =>
  node.type === "text"
    ? [`${"  ".repeat(depth)}${node.text}`]
    : [
        `${"  ".repeat(depth)}<${node.component}>${Object.keys(node.events)
          .map((name) => `{${name}}`)
          .join("")}`,
        ...node.children.flatMap((child) => lines(child, depth + 1)),
      ];

const interactive = (node: Child): ReadonlyArray<{ readonly label: string; readonly handler: string }> =>
  node.type === "text" ? [] : [...Object.values(node.events).map((handler) => ({ label: textOf(node), handler })), ...node.children.flatMap(interactive)];

export interface TextTarget extends Target {
  readonly screen: () => string;
  readonly activate: (label: string) => void;
}

export const textTarget = (): TargetFactory<TextTarget> => (report: Report) => {
  let drawn: RenderTree | undefined;

  return {
    draw: (tree) => void (drawn = tree),
    update: (tree) => void (drawn = tree),
    unmount: () => void (drawn = undefined),
    screen: () => (drawn === undefined ? "" : lines(drawn.root, 0).join("\n")),
    activate: (label) => {
      const hit = drawn === undefined ? undefined : interactive(drawn.root).find((node) => node.label.startsWith(label));

      if (hit === undefined) {
        throw new Error(`nothing to activate: ${label}`);
      }

      report(hit.handler);
    },
  };
};
