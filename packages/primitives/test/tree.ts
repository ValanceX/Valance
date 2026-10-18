// A render tree (render-v1) for a web tag from a specification's example: the props the tag realizes, in the web's names, the text the runtime would give for those that are not strings, and a handler for each event.
import type { RenderTree } from "@valancex/mesh-runtime";
import type { Example, ExampleChild, WebRealizations } from "../src/index.js";

export const treeOf = (realizations: WebRealizations, tag: string, example: Example): RenderTree => {
  let counter = 0;
  const key = () => `k${++counter}`;
  const tagFor = (primitive: string): string => Object.entries(realizations.primitives).find(([, each]) => each.primitive === primitive)?.[0] ?? primitive;

  const nodeOf = (
    name: string,
    props: Readonly<Record<string, unknown>> | undefined,
    text: string | undefined,
    children: ReadonlyArray<ExampleChild> | undefined,
    bind: boolean,
  ): unknown => {
    const realization = realizations.primitives[name]!;
    const named: Record<string, unknown> = {};
    const propText: Record<string, string> = {};

    for (const [prop, value] of Object.entries(props ?? {})) {
      const web = realization.rename?.[prop] ?? prop;

      if (realization.props?.[web] === undefined) {
        continue;
      }

      named[web] = value;

      if (typeof value !== "string") {
        propText[web] = String(value);
      }
    }

    const events: Record<string, string> = {};

    if (bind) {
      for (const event of Object.keys(realization.events ?? {})) {
        events[event] = `${name}.${event}`;
      }
    }

    return {
      type: "node",
      key: key(),
      component: name,
      props: named,
      ...(Object.keys(propText).length === 0 ? {} : { propText }),
      events,
      children: [
        ...(text === undefined ? [] : [{ type: "text", key: key(), text }]),
        ...(children ?? []).map((child) => nodeOf(tagFor(child.name), child.props, child.text, child.children, true)),
      ],
    };
  };

  return { format: "mesh-render", version: 1, root: nodeOf(tag, example.props, example.text, example.children, true), events: {}, children: [] } as unknown as RenderTree;
};
