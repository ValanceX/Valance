// The component tree the author declares in `src/main.ts`: `layout` at the top, each component listing the components its template uses. This module reads the declaration and finds where in
// the file each part is written (for a diagnostic, and for the editor); it does not read templates.
import { basename } from "node:path";

import type { Component } from "./index.js";
import { asComponent } from "./index.js";
import { ENTRY_FILE } from "./project.js";

export interface Place { readonly file: string; readonly line: number; readonly column: number }

export interface Node {
  /** The tag: the template's file name without `.mprx`. */
  readonly name: string;
  /** The template, relative to the project. */
  readonly file: string;
  readonly props: ReadonlyArray<string>;
  readonly events: ReadonlyArray<string>;
  /** The tags of the components it declares it uses. */
  readonly uses: ReadonlyArray<string>;
  /** Who declares it: the components listing it in `uses`; `"(application)"` for the layout and for an override. */
  readonly parents: ReadonlyArray<string>;
}

export const APPLICATION = "(application)";

export const nameOf = (file: string): string => basename(file, ".mprx");

/** Every component the definition declares, once each by name, starting from `layout` and each `override`. */
export const treeOf = (layout: Component | undefined, overrides: ReadonlyArray<Component>): ReadonlyArray<Node> => {
  const found = new Map<string, { node: Node; parents: Array<string> }>();

  const walk = (declared: Component, parent: string): void => {
    const name = nameOf(declared.template.mprx);
    const known = found.get(name);

    if (known !== undefined) { if (!known.parents.includes(parent)) { known.parents.push(parent); } return; }

    const entry = { node: undefined as unknown as Node, parents: [parent] };

    found.set(name, entry);
    entry.node = { name, file: declared.template.mprx, props: declared.props, events: declared.events, uses: declared.uses.map((each) => nameOf(each.template.mprx)), get parents() { return entry.parents; } };

    for (const child of declared.uses) { walk(asComponent(child), name); }
  };

  if (layout !== undefined) { walk(layout, APPLICATION); }
  for (const each of overrides) { walk(each, APPLICATION); }

  return [...found.values()].map((entry) => entry.node);
};

// ---- where it is written ----------------------------------------------------------------------------------------------------------------------------------------

export const placeIn = (text: string, offset: number, file: string): Place => {
  const before = text.slice(0, offset).split("\n");

  return { file, line: before.length, column: before[before.length - 1]!.length + 1 };
};

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The offset just past the `)` that closes the `(` at `open`, strings respected. */
const closing = (text: string, open: number): number => {
  let depth = 0;

  for (let at = open; at < text.length; at += 1) {
    const char = text[at];

    if (char === '"' || char === "'" || char === "`") { const quote = char; at += 1; while (at < text.length && text[at] !== quote) { at += text[at] === "\\" ? 2 : 1; } }
    else if (char === "(") { depth += 1; }
    else if (char === ")") { depth -= 1; if (depth === 0) { return at + 1; } }
  }

  return text.length;
};

export interface Site {
  /** The `import x from "./the.mprx"` line. */
  readonly imported?: Place;
  /** The `component(x, …)` call, when written in this file. */
  readonly call?: Place;
  /** Where a prop or an event is listed in that call. */
  readonly member: (kind: "props" | "events", name: string) => Place | undefined;
}

/** Where the entry file imports a template and declares it. A text search for pointing, not a parse: what it cannot find it leaves out, and callers fall back to the file's top. */
export const siteOf = (text: string, file: string): Site => {
  const at = (offset: number): Place => placeIn(text, offset, ENTRY_FILE);
  const imported = new RegExp(`import\\s+(\\w+)\\s+from\\s+["'][^"']*${escape(basename(file))}["']`).exec(text);
  const call = imported === null ? null : new RegExp(`component\\(\\s*${imported[1]}\\b`).exec(text);
  const range = call === null ? undefined : { from: call.index, to: closing(text, call.index + "component".length) };

  return {
    ...(imported === null ? {} : { imported: at(imported.index) }),
    ...(call === null ? {} : { call: at(call.index) }),
    member: (kind, name) => {
      if (range === undefined) { return undefined; }

      const body = text.slice(range.from, range.to);
      const list = new RegExp(`${kind}\\s*:\\s*\\[([^\\]]*)\\]`).exec(body);

      if (list === null) { return undefined; }

      const item = new RegExp(`["']${escape(name)}["']`).exec(list[1]!);

      return item === null ? undefined : at(range.from + list.index + list[0].indexOf("[") + 1 + item.index);
    },
  };
};
