// Where every name came from, and what uses it: the connections between main.ts, the layout and the components, recorded at both ends. MESH knows the manifest, not the files it was derived from;
// VALANCE knows both. Written as `.valance/wiring.json` for the editor, which uses it so that ctrl+click lands on YOUR file instead of the generated manifest, and so that both ends of a
// connection (an event and its handler, a prop and what is passed) point at each other.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ownNames } from "./app.js";
import type { Compiled } from "./compile.js";
import type { DefinedApp } from "./index.js";
import { ENTRY_FILE } from "./project.js";

export interface Place { readonly file: string; readonly line: number; readonly column: number }

export interface Use {
  /** The tag in a template. */
  readonly at: Place;
  readonly tag: string;
  /** The template that defines it. */
  readonly target: Place;
  /** What the caller passes: the attribute (where it is written), and the expression or string it is given. */
  readonly props: ReadonlyArray<{ readonly name: string; readonly from: string; readonly at: Place }>;
  /** What the caller does when the component raises an event: `on.toggle={toggleTheme()}`. */
  readonly events: ReadonlyArray<{ readonly name: string; readonly to: string; readonly at: Place }>;
}

/** A component as seen from inside: what it takes and raises, where each is first used in its template, and who passes or handles it. */
export interface Component {
  readonly name: string;
  readonly file: string;
  readonly props: ReadonlyArray<{ readonly name: string; readonly at: Place; readonly passedBy: ReadonlyArray<{ readonly at: Place; readonly from: string }> }>;
  readonly events: ReadonlyArray<{ readonly name: string; readonly at: Place; readonly handledBy: ReadonlyArray<{ readonly at: Place; readonly to: string }> }>;
}

export interface Wiring {
  readonly version: 1;
  /** A path into manifest.json (`components/theme-toggle/props/theme`) → the authored place it is declared. The framework's own names point into its README. */
  readonly definitions: Readonly<Record<string, Place>>;
  /** The same path → where the caller writes it: the attribute that passes a prop, the `on.x` that handles an event. What a click goes to from inside the component. */
  readonly bindings: Readonly<Record<string, ReadonlyArray<Place>>>;
  readonly uses: ReadonlyArray<Use>;
  readonly components: ReadonlyArray<Component>;
  readonly state: ReadonlyArray<{ readonly name: string; readonly source: Place; readonly readBy: ReadonlyArray<Place> }>;
  readonly commands: ReadonlyArray<{ readonly name: string; readonly source: Place; readonly runBy: ReadonlyArray<Place> }>;
}

// ---- reading a template -------------------------------------------------------------------------------------------------------------------------------------------

interface Read { readonly name: string; readonly call: boolean; readonly at: number }
interface Element { readonly tag: string; readonly at: number; readonly attributes: ReadonlyArray<{ readonly name: string; readonly string: boolean; readonly text: string; readonly at: number }> }
interface Scanned { readonly reads: ReadonlyArray<Read>; readonly elements: ReadonlyArray<Element> }

const KEYWORDS = new Set(["true", "false", "null"]);

/** The identifiers an expression reads (and the commands it calls), with their offsets; strings and member names are not reads. */
const identifiers = (expression: string, base: number): ReadonlyArray<Read> => {
  const plain = expression.replace(/"([^"\\]|\\.)*"/g, (found) => " ".repeat(found.length));
  const found: Array<Read> = [];

  for (const match of plain.matchAll(/(?<![.\w$])(\$?[A-Za-z_]\w*)(\s*\()?/g)) {
    const name = match[1]!;
    const after = plain.slice(match.index! + name.length).trimStart();
    const before = plain.slice(0, match.index!).trimEnd().slice(-1);

    if (KEYWORDS.has(name) || name.startsWith("$")) { continue; }
    if (after.startsWith(":") && (before === "{" || before === ",")) { continue; }       // an object key

    found.push({ name, call: match[2] !== undefined, at: base + match.index! });
  }

  return found;
};

/** The text of a balanced `{ … }` starting at `from`, strings respected. */
const balanced = (text: string, from: number): number => {
  let depth = 0;

  for (let at = from; at < text.length; at += 1) {
    const char = text[at];

    if (char === '"') { at += 1; while (at < text.length && text[at] !== '"') { at += text[at] === "\\" ? 2 : 1; } }
    else if (char === "{") { depth += 1; }
    else if (char === "}") { depth -= 1; if (depth === 0) { return at; } }
  }

  return text.length - 1;
};

/** A forgiving scan of MPRX: the elements with their attributes, and every identifier read inside `{ … }`. It reads a template the compiler has accepted, so it does not validate. */
export const scan = (text: string): Scanned => {
  const reads: Array<Read> = [];
  const elements: Array<Element> = [];
  let at = 0;

  while (at < text.length) {
    const char = text[at];

    if (char === "{") {
      const end = balanced(text, at);

      reads.push(...identifiers(text.slice(at + 1, end), at + 1));
      at = end + 1;
    } else if (char === "<" && text[at + 1] === "/") {
      at = text.indexOf(">", at) + 1 || text.length;
    } else if (char === "<" && /[a-z]/.test(text[at + 1] ?? "")) {
      const name = /^[a-z][a-z0-9-]*/.exec(text.slice(at + 1))![0];
      const attributes: Array<Element["attributes"][number]> = [];
      let cursor = at + 1 + name.length;

      for (;;) {
        while (/\s/.test(text[cursor] ?? "")) { cursor += 1; }

        if (cursor >= text.length) { break; }
        if (text.startsWith("/>", cursor)) { cursor += 2; break; }
        if (text[cursor] === ">") { cursor += 1; break; }

        const attribute = /^[A-Za-z_][\w.:-]*/.exec(text.slice(cursor));

        if (attribute === null) { cursor += 1; continue; }

        const attributeAt = cursor;

        cursor += attribute[0].length;

        while (/\s/.test(text[cursor] ?? "")) { cursor += 1; }

        if (text[cursor] !== "=") { attributes.push({ name: attribute[0], string: true, text: "", at: attributeAt }); continue; }

        cursor += 1;

        while (/\s/.test(text[cursor] ?? "")) { cursor += 1; }

        if (text[cursor] === '"') {
          let end = cursor + 1;

          while (end < text.length && text[end] !== '"') { end += text[end] === "\\" ? 2 : 1; }

          attributes.push({ name: attribute[0], string: true, text: text.slice(cursor + 1, end), at: attributeAt });
          cursor = end + 1;
        } else if (text[cursor] === "{") {
          const end = balanced(text, cursor);

          reads.push(...identifiers(text.slice(cursor + 1, end), cursor + 1));
          attributes.push({ name: attribute[0], string: false, text: text.slice(cursor + 1, end).trim(), at: attributeAt });
          cursor = end + 1;
        }
      }

      elements.push({ tag: name, at, attributes });
      at = cursor;
    } else {
      at += 1;
    }
  }

  return { reads, elements };
};

const placeIn = (text: string, offset: number, file: string): Place => {
  const before = text.slice(0, offset).split("\n");

  return { file, line: before.length, column: before[before.length - 1]!.length + 1 };
};

/** The first place a key `name:` is written in `src/main.ts`: where a state field or a command is declared. A text search, not a parse: it is for pointing, and falls back to the top of the file. */
export const locateKey = (text: string, name: string): Place => {
  const found = new RegExp(`(^|[\\s{,(])(${name})\\s*:`, "m").exec(text);

  return found === null ? { file: ENTRY_FILE, line: 1, column: 1 } : placeIn(text, found.index + found[1]!.length, ENTRY_FILE);
};

// ---- the map ---------------------------------------------------------------------------------------------------------------------------------------------------

interface Manifest { readonly components: Readonly<Record<string, { readonly props: Record<string, unknown>; readonly events: Record<string, unknown>; readonly commands: Record<string, unknown>; readonly scope: Record<string, unknown> }>> }

/** Where the framework documents a name an author did not write: a line of its README, which ships with the package. `undefined` when there is none to point at. */
export interface Docs { readonly file: string; readonly lines: ReadonlyArray<string> }

const docLine = (docs: Docs | undefined, find: (line: string) => boolean): Place | undefined => {
  const at = docs?.lines.findIndex(find) ?? -1;

  return docs === undefined || at < 0 ? undefined : { file: docs.file, line: at + 1, column: 1 };
};

export const buildWiring = (root: string, author: DefinedApp | undefined, compiled: Compiled, docs?: Docs): Wiring => {
  const manifest = compiled.manifest as Manifest;
  const own = ownNames(author);
  const mainText = (() => { try { return readFileSync(join(root, ENTRY_FILE), "utf8"); } catch { return ""; } })();
  const scanned = new Map(compiled.templates.map((template) => [template.component, { template, ...scan(template.source) }]));
  const builtInFiles = new Set(compiled.templates.filter((template) => template.builtIn).map((template) => template.file));
  const definitions: Record<string, Place> = {};
  const bindings: Record<string, Array<Place>> = {};
  const define = (path: ReadonlyArray<string>, place: Place | undefined): void => { if (place !== undefined) { definitions[path.join("/")] = place; } };
  const placeOf = (component: string, offset: number): Place => { const found = scanned.get(component)!; return placeIn(found.template.source, offset, found.template.file); };
  const top = (component: string): Place => ({ file: scanned.get(component)!.template.file, line: 1, column: 1 });

  // Where each component is used, and what is passed and handled.
  const uses: Array<Use> = [];

  for (const [component, found] of scanned) {
    for (const element of found.elements.filter((each) => scanned.has(each.tag))) {
      uses.push({
        at: placeOf(component, element.at),
        tag: element.tag,
        target: top(element.tag),
        props: element.attributes.filter((attribute) => !attribute.name.startsWith("on.")).map((attribute) => ({ name: attribute.name, from: attribute.string ? JSON.stringify(attribute.text) : `{${attribute.text}}`, at: placeOf(component, attribute.at) })),
        events: element.attributes.filter((attribute) => attribute.name.startsWith("on.")).map((attribute) => ({ name: attribute.name.slice(3), to: attribute.text, at: placeOf(component, attribute.at) })),
      });
    }
  }

  // What the layout reads or runs: only the layout's own template. A component's `theme` is its prop, a different name that happens to be spelt alike.
  const readsOf = (name: string, call: boolean): ReadonlyArray<Place> => {
    const seen = new Set<number>();

    return scanned.get("layout")!.reads.filter((read) => read.name === name && read.call === call).map((read) => placeOf("layout", read.at)).filter((place) => !seen.has(place.line) && seen.add(place.line));
  };

  // The layout: its names are your state, your commands, or the framework's.
  define(["components", "layout"], top("layout"));

  for (const name of Object.keys(manifest.components["layout"]!.scope)) {
    define(["components", "layout", "scope", name], own.state.includes(name) ? locateKey(mainText, name) : docLine(docs, (line) => line.startsWith("|") && (line.split("|")[1] ?? "").includes(`\`${name}\``)));
  }

  for (const name of Object.keys(manifest.components["layout"]!.commands)) {
    define(["components", "layout", "commands", name], own.commands.includes(name) ? locateKey(mainText, name) : docLine(docs, (line) => line.includes(`\`${name}\` is the framework`)));
  }

  // Components: declared where the template first uses the prop or raises the event, and bound where a caller writes it.
  const components: Array<Component> = [];

  for (const { template } of scanned.values()) {
    const name = template.component;

    if (name === "layout") { continue; }

    define(["components", name], top(name));

    const entry = manifest.components[name];
    const callers = uses.filter((use) => use.tag === name && !builtInFiles.has(use.at.file));
    const reads = scanned.get(name)!.reads;
    const props = Object.keys(entry?.props ?? {}).map((prop) => {
      const first = reads.find((read) => read.name === prop && !read.call);
      const at = first === undefined ? top(name) : placeOf(name, first.at);
      const passedBy = callers.flatMap((use) => use.props.filter((passed) => passed.name === prop).map((passed) => ({ at: passed.at, from: passed.from })));

      define(["components", name, "props", prop], at);
      define(["components", name, "scope", prop], at);
      bindings[["components", name, "props", prop].join("/")] = passedBy.map((each) => each.at);
      bindings[["components", name, "scope", prop].join("/")] = passedBy.map((each) => each.at);

      return { name: prop, at, passedBy };
    });
    const events = Object.keys(entry?.events ?? {}).map((event) => {
      const first = reads.find((read) => read.name === event && read.call);
      const at = first === undefined ? top(name) : placeOf(name, first.at);
      const handledBy = callers.flatMap((use) => use.events.filter((handled) => handled.name === event).map((handled) => ({ at: handled.at, to: handled.to })));

      define(["components", name, "events", event], at);
      define(["components", name, "commands", event], at);
      bindings[["components", name, "events", event].join("/")] = handledBy.map((each) => each.at);
      bindings[["components", name, "commands", event].join("/")] = handledBy.map((each) => each.at);

      return { name: event, at, handledBy };
    });

    components.push({ name, file: template.file, props, events });
  }

  // The elements the framework draws: documented in its README, as one list.
  const tags = docLine(docs, (line) => line.startsWith("Tags you may use:"));

  for (const [tag, entry] of Object.entries(manifest.components)) {
    if (scanned.has(tag) || tag.startsWith("mesh-")) { continue; }

    define(["components", tag], tags);

    for (const prop of Object.keys(entry.props)) { define(["components", tag, "props", prop], tags); }
    for (const event of Object.keys(entry.events)) { define(["components", tag, "events", event], tags); }
  }

  return {
    version: 1,
    definitions,
    bindings,
    uses,
    components,
    state: own.state.map((name) => ({ name, source: locateKey(mainText, name), readBy: readsOf(name, false) })),
    commands: own.commands.map((name) => ({ name, source: locateKey(mainText, name), runBy: readsOf(name, true) })),
  };
};
