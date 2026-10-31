// The components the author declares in `src/main.ts`: `layout`, the overrides and `components`. This module reads the declaration and finds where in the file each part is written (for a
// diagnostic, and for the editor); who uses whom is read from the templates (`linked`, with `outline.ts`).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import type { Schema } from "effect";

import type { Component, PropDeclaration } from "@valancex/common";
import { ENTRY_FILE } from "./project.js";

export interface Place {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface Node {
  /** The tag: the template's file name without `.mprx`. */
  readonly name: string;
  /** The template, relative to the project. */
  readonly file: string;
  /** The interface the component declares: present when it declares one (an omitted side is none), absent when its contract is inferred from the template and where it is used. */
  readonly interface?: {
    readonly props: Readonly<Record<string, PropDeclaration>>;
    readonly events: Readonly<Record<string, Schema.Schema<any, any, never>>>;
    /** The prop that is the component's accessible name, if it declares one. */
    readonly name?: string;
    /** The state and commands of one occurrence of the component, if it has any. */
    readonly unit?: Component["unit"];
    /** The context names its template reads (the contract's `uses`, the manifest entry's `uses`), if it reads any. Not the components it writes, which are the node's `uses`. */
    readonly uses?: ReadonlyArray<string>;
  };
  /** The declared components its template writes. */
  readonly uses: ReadonlyArray<string>;
  /** Who uses it: the components whose templates write its tag; `"(application)"` for the layout and for an override. */
  readonly parents: ReadonlyArray<string>;
}

export const APPLICATION = "(application)";

export const nameOf = (file: string): string => basename(file, ".mprx");

/** A component as the definition lists it, before two with one name are told apart: how it was listed, and so whether it may replace a built-in. */
export interface Declared {
  readonly name: string;
  readonly file: string;
  readonly role: "layout" | "override" | "component";
}

/** Every component the definition lists, in order and with repeats, each with the role it was listed in. `treeOf` is these, once each by name. */
export const declaredOf = (layout: Component | undefined, overrides: ReadonlyArray<Component>, components: ReadonlyArray<Component> = []): ReadonlyArray<Declared> =>
  [
    ...(layout === undefined ? [] : [{ component: layout, role: "layout" as const }]),
    ...overrides.map((component) => ({ component, role: "override" as const })),
    ...components.map((component) => ({ component, role: "component" as const })),
  ].map(({ component, role }) => ({ name: nameOf(component.template.mprx), file: component.template.mprx, role }));

/** Every component the definition declares, once each by name: `layout`, each `override`, then each of `components`. Who uses whom is read from the templates (`linked`). */
export const treeOf = (layout: Component | undefined, overrides: ReadonlyArray<Component>, components: ReadonlyArray<Component> = []): ReadonlyArray<Node> => {
  const found = new Map<string, Node>();

  for (const declared of [...(layout === undefined ? [] : [layout]), ...overrides, ...components]) {
    const name = nameOf(declared.template.mprx);

    if (!found.has(name)) {
      const contract =
        // A unit or context names make the interface declared: the model's entry carries them, and an inferred contract has no entry.
        declared.props === undefined && declared.events === undefined && declared.unit === undefined && declared.uses === undefined
          ? {}
          : {
              interface: {
                props: declared.props ?? {},
                events: declared.events ?? {},
                ...(declared.name === undefined ? {} : { name: declared.name }),
                ...(declared.unit === undefined ? {} : { unit: declared.unit }),
                ...(declared.uses === undefined ? {} : { uses: declared.uses }),
              },
            };

      found.set(name, { name, file: declared.template.mprx, ...contract, uses: [], parents: [] });
    }
  }

  return [...found.values()];
};

/**
 * The tree with who uses whom filled in: `usesOf` gives the tags each component's template writes. A component uses the declared components its template writes (not itself); the layout and each
 * override are also the application's.
 */
export const linked = (
  nodes: ReadonlyArray<Node>,
  layout: Component | undefined,
  overrides: ReadonlyArray<Component>,
  usesOf: (name: string) => ReadonlyArray<string>,
): ReadonlyArray<Node> => {
  const declared = new Set(nodes.map((each) => each.name));
  const uses = new Map(nodes.map((each) => [each.name, usesOf(each.name).filter((tag) => declared.has(tag) && tag !== each.name)] as const));
  const roots = new Set([...(layout === undefined ? [] : [nameOf(layout.template.mprx)]), ...overrides.map((each) => nameOf(each.template.mprx))]);

  return nodes.map((each) => ({
    ...each,
    uses: uses.get(each.name)!,
    parents: [...(roots.has(each.name) ? [APPLICATION] : []), ...nodes.filter((other) => uses.get(other.name)!.includes(each.name)).map((other) => other.name)],
  }));
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

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      at += 1;
      while (at < text.length && text[at] !== quote) {
        at += text[at] === "\\" ? 2 : 1;
      }
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return at + 1;
      }
    }
  }

  return text.length;
};

/** The offset just past the `}` that closes the `{` at `open`, strings respected. */
const braceEnd = (text: string, open: number): number => {
  let depth = 0;

  for (let at = open; at < text.length; at += 1) {
    const char = text[at];

    if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      at += 1;
      while (at < text.length && text[at] !== quote) {
        at += text[at] === "\\" ? 2 : 1;
      }
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return at + 1;
      }
    }
  }

  return text.length;
};

export interface Site {
  /** The file the site is in, relative to the project. */
  readonly file: string;
  /** The `import x from "./the.mprx"` line. */
  readonly imported?: Place;
  /** The `component(x, …)` call that defines the component. */
  readonly call?: Place;
  /** Where a prop or an event is declared in that call: its key in `props: { … }` or `events: { … }`. */
  readonly member: (kind: "props" | "events", name: string) => Place | undefined;
}

const IMPORT = /import\s+(\w+)\s+from\s+["']([^"']+\.mprx)["']/g;

/** The site of the template imported as `ident` in `text` (the file `file`): its import, the `component(ident, …)` call, and the keys of the contract written in it. */
const siteIn = (file: string, text: string, ident: string, imported: number): Site => {
  const at = (offset: number): Place => placeIn(text, offset, file);
  const call = new RegExp(`component\\(\\s*${ident}\\b`).exec(text);
  const range = call === null ? undefined : { from: call.index, to: closing(text, call.index + "component".length) };

  return {
    file,
    imported: at(imported),
    ...(call === null ? {} : { call: at(call.index) }),
    member: (kind, name) => {
      if (range === undefined) {
        return undefined;
      }

      const body = text.slice(range.from, range.to);
      const start = new RegExp(`\\b${kind}\\s*:\\s*\\{`).exec(body);

      if (start === null) {
        return undefined;
      }

      const open = start.index + start[0].length - 1;
      const close = braceEnd(body, open);
      const key = new RegExp(`(^|[\\s{,])(["']?)${escape(name)}\\2\\s*:`).exec(body.slice(open, close));

      return key === null ? undefined : at(range.from + open + key.index + key[1]!.length);
    },
  };
};

const typescriptIn = (dir: string): ReadonlyArray<string> =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
        .sort()
    : [];

/**
 * Where each template's component is defined: the `component(template, …)` call in the project's TypeScript, wherever it is written (the entry file, or a file of its own beside the template), and the
 * keys of its contract. A text search for pointing, not a parse: what it cannot find it leaves out, and callers fall back to the template.
 */
export const declarationsOf = (root: string): ReadonlyMap<string, Site> => {
  const found = new Map<string, Site>();
  const files = [
    ENTRY_FILE,
    ...typescriptIn(join(root, "src"))
      .map((file) => `src/${file.split(sep).join("/")}`)
      .filter((file) => file !== ENTRY_FILE),
  ];

  for (const file of files) {
    const path = join(root, file);

    if (!existsSync(path)) {
      continue;
    }

    const text = readFileSync(path, "utf8");

    for (const match of text.matchAll(IMPORT)) {
      const template = relative(root, resolve(dirname(path), match[2]!))
        .split(sep)
        .join("/");
      const site = siteIn(file, text, match[1]!, match.index);

      // A definition wins over an import that only passes the component on.
      if (!found.has(template) || (found.get(template)!.call === undefined && site.call !== undefined)) {
        found.set(template, site);
      }
    }
  }

  return found;
};
