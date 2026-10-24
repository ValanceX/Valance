// The gallery (decision Q7): an application generated from the specifications and the themes. For each portable primitive that can be drawn in the page, every member of every closed set and every
// state a boolean prop carries is a cell, with stable keys; every mode of the theme is a dimension. Adding a member to a closed set adds a cell and a vector with no one writing either.
//
// What gates (Q8) is the structure: the observation of every cell, which has no pixels and no fonts and is the same on every machine. The states a person puts a node in by hovering, pressing
// or tabbing are forced (Q10), and the page is the one gallery whatever the target.
import type { Specification, WebRealizations } from "@valancex/primitives";

import type { Adapter, Observation, Tree } from "./protocol.js";
import { treeOf } from "./vectors.js";

export interface Cell {
  /** `<primitive>/<dimension>`, stable. */
  readonly id: string;
  readonly primitive: string;
  readonly tag: string;
  /** What varies in this cell: `example`, `intent=primary`, `disabled=true`. */
  readonly dimension: string;
  readonly props: Readonly<Record<string, unknown>>;
  /** The key of the cell's root node: unique across the gallery. */
  readonly key: string;
  /** The element a `describedby` points at, which the page must have. */
  readonly described?: { readonly id: string; readonly text: string };
  readonly tree: Tree;
}

/** The primitives whose cells are drawn in the page: a layer is not (it covers the page), and neither is a part that is only inside another's content. */
const inline = (specification: Specification): boolean =>
  specification.status === "portable" && specification.name !== "dialog" && specification.name !== "popover" && specification.within === undefined;

const STATES = ["disabled", "checked", "invalid", "pressed"];

/** Every cell: for each primitive, its example, each member of each closed set, and each value of each state it carries. */
export const cellsOf = (specifications: Readonly<Record<string, Specification>>, realizations: WebRealizations): ReadonlyArray<Cell> => {
  const out: Cell[] = [];

  for (const [tag, realization] of Object.entries(realizations.primitives)) {
    const specification = specifications[realization.primitive];

    if (specification === undefined || !inline(specification)) {
      continue;
    }

    const example = specification.example;
    const first = Object.entries(realizations.primitives).find(([, each]) => each.primitive === specification.name)?.[0];
    const add = (made: string, props: Record<string, unknown> | undefined): void => {
      const key = `g${out.length}`;
      // a primitive with more than one tag (`list` and `olist`) has the cells of each, the later tags named by the tag
      const dimension = first === tag ? made : `${made}@${tag}`;

      out.push({
        id: `${specification.name}/${dimension}`,
        primitive: specification.name,
        tag,
        dimension,
        props: props ?? {},
        key,
        ...(typeof props?.["describedby"] === "string" && example.describedByText !== undefined
          ? {
              described: {
                id: props["describedby"],
                text: example.describedByText,
              },
            }
          : {}),
        tree: treeOf(realizations, tag, props, example.text, example.children, key),
      });
    };

    add("example", example.props);

    // every combination of the closed sets (the product of their members), then each state alone
    const sets = Object.entries(specification.props).flatMap(([prop, definition]) => (definition.type.kind === "enum" ? [[prop, definition.type.values] as const] : []));
    const combinations = sets.reduce<ReadonlyArray<ReadonlyArray<readonly [string, string]>>>(
      (so_far, [prop, values]) => so_far.flatMap((each) => values.map((value) => [...each, [prop, value] as const])),
      [[]],
    );

    for (const combination of combinations.filter((each) => each.length > 0)) {
      add(combination.map(([prop, value]) => `${prop}=${value}`).join(","), {
        ...example.props,
        ...Object.fromEntries(combination),
      });
    }

    for (const [prop, definition] of Object.entries(specification.props)) {
      if (definition.type.kind === "boolean" && STATES.includes(prop)) {
        for (const value of [true, false]) {
          add(`${prop}=${value}`, { ...example.props, [prop]: value });
        }
      }
    }
  }

  return out;
};

/** The gallery's page tree: one section for each mode of the theme (`shell` with its `theme`), and in it each cell under its name. */
export const galleryTree = (cells: ReadonlyArray<Cell>, modes: ReadonlyArray<string>): Tree => {
  const text = (key: string, words: string): unknown => ({
    type: "node",
    key,
    component: "text",
    props: {},
    events: {},
    children: [{ type: "text", key: `${key}.t`, text: words }],
  });
  const column = (key: string, children: ReadonlyArray<unknown>): unknown => ({
    type: "node",
    key,
    component: "column",
    props: {},
    events: {},
    children,
  });
  const shell = (mode: string, children: ReadonlyArray<unknown>): unknown => ({
    type: "node",
    key: `mode-${mode}`,
    component: "shell",
    props: { theme: mode, class: "gallery" },
    events: {},
    children,
  });

  return {
    format: "mesh-render",
    version: 1,
    root: column(
      "gallery",
      modes.map((mode) =>
        shell(mode, [
          text(`mode-${mode}.title`, `Theme mode: ${mode}`),
          ...cells.map((cell) =>
            column(`${mode}.cell.${cell.key}`, [
              text(`${mode}.cell.${cell.key}.name`, cell.id),
              prefixed(cell.tree.root, `${mode}.`, `${mode}.${cell.key}-`),
              ...(cell.described === undefined
                ? []
                : [
                    {
                      ...(text(`${mode}.${cell.key}.described`, cell.described.text) as object),
                      props: { id: `${mode}.${cell.key}-${cell.described.id}` },
                    },
                  ]),
            ]),
          ),
        ]),
      ),
    ),
  };
};

/** The same node with every key under it, and every `id` and `describedby`, made unique by `prefix` (a cell appears once in each mode, and an id is the page's). */
const prefixed = (node: unknown, prefix: string, ids: string): unknown => {
  const part = node as {
    key: string;
    props?: Record<string, unknown>;
    children?: ReadonlyArray<unknown>;
  };
  const props =
    part.props === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(part.props).map(([name, value]) => [name, (name === "id" || name === "describedby") && typeof value === "string" ? `${ids}${value}` : value]),
        );

  return {
    ...part,
    key: `${prefix}${part.key}`,
    ...(props === undefined ? {} : { props }),
    ...(part.children === undefined
      ? {}
      : {
          children: part.children.map((child) => prefixed(child, prefix, ids)),
        }),
  };
};

/** What each cell is, as an adapter observes it: the structure snapshot. A cell the adapter declares unsupported is `null`, so a gap shows in the snapshot and does not hide. */
export const structureOf = async (adapter: Adapter, cells: ReadonlyArray<Cell>): Promise<Readonly<Record<string, ReadonlyArray<Observation> | null>>> => {
  const capabilities = await adapter.capabilities();
  const out: Record<string, ReadonlyArray<Observation> | null> = {};

  for (const cell of cells) {
    if (capabilities.unsupported.some((each) => (each.primitive === "*" || each.primitive === cell.primitive) && each.case === "*")) {
      out[cell.id] = null;
      continue;
    }

    await adapter.load(cell.tree);

    const seen: Observation[] = [];
    const walk = async (key: string): Promise<void> => {
      const found = await adapter.observe(key);

      if (found === undefined) {
        return;
      }

      seen.push(found);

      for (const child of found.children) {
        await walk(child);
      }
    };

    await walk(cell.key);
    out[cell.id] = seen;
    await adapter.unmount();
  }

  return out;
};
