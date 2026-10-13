// What `vlx` records about where every name came from and what uses it (`.valance/wiring.json`), turned into what an editor shows: ctrl+click that lands in YOUR file instead of the generated
// manifest, from either end of a connection, and CodeLens that puts the other end next to each one. Pure: no `vscode` import, so it is tested without an editor.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Place { readonly file: string; readonly line: number; readonly column: number }

export interface Wiring {
  readonly version: 1;
  readonly definitions: Readonly<Record<string, Place>>;
  readonly bindings: Readonly<Record<string, ReadonlyArray<Place>>>;
  readonly uses: ReadonlyArray<{
    readonly at: Place;
    readonly tag: string;
    readonly target: Place;
    readonly props: ReadonlyArray<{ readonly name: string; readonly from: string; readonly at: Place }>;
    readonly events: ReadonlyArray<{ readonly name: string; readonly to: string; readonly at: Place }>;
  }>;
  readonly components: ReadonlyArray<{
    readonly name: string;
    readonly file: string;
    readonly props: ReadonlyArray<{ readonly name: string; readonly at: Place; readonly declared?: Place; readonly passedBy: ReadonlyArray<{ readonly at: Place; readonly from: string }> }>;
    readonly events: ReadonlyArray<{ readonly name: string; readonly at: Place; readonly declared?: Place; readonly handledBy: ReadonlyArray<{ readonly at: Place; readonly to: string }> }>;
  }>;
  /** The component tree as `src/main.ts` declares it. Absent in a file written by an older `vlx`. */
  readonly tree?: ReadonlyArray<{ readonly name: string; readonly file: string; readonly declared?: Place; readonly parents: ReadonlyArray<string>; readonly uses: ReadonlyArray<string> }>;
  readonly state: ReadonlyArray<{ readonly name: string; readonly source: Place; readonly readBy: ReadonlyArray<Place> }>;
  readonly commands: ReadonlyArray<{ readonly name: string; readonly source: Place; readonly runBy: ReadonlyArray<Place> }>;
}

export const readWiring = (root: string, relative: string | undefined): Wiring | undefined => {
  if (relative === undefined || !existsSync(join(root, relative))) { return undefined; }

  try {
    const parsed = JSON.parse(readFileSync(join(root, relative), "utf8")) as Wiring;

    return parsed.version === 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
};

// ---- definitions ---------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * The path of the key written on `line` (zero-based) of `manifest.json`, from its indentation: `["components", "theme-toggle", "props", "theme"]`. The manifest is written by `vlx` with two
 * spaces, one key per line, so the keys above a line with less indentation are its parents.
 */
export const manifestPath = (text: string, line: number): ReadonlyArray<string> | undefined => {
  const lines = text.split("\n");
  const key = /^(\s*)"((?:[^"\\]|\\.)*)"\s*:/;
  const own = key.exec(lines[line] ?? "");

  if (own === null) { return undefined; }

  const path = [own[2]!];
  let indent = own[1]!.length;

  for (let at = line - 1; at >= 0 && indent > 0; at -= 1) {
    const parent = key.exec(lines[at]!);

    if (parent !== null && parent[1]!.length < indent) { path.unshift(parent[2]!); indent = parent[1]!.length; }
  }

  return path;
};

/**
 * Go to Definition, for the manifest line the language server answered with: the ONE place the name is declared, in the author's file: the template that defines a component, where it first
 * uses a prop or raises an event, the state field or command in `main.ts`. The framework's own names go to its README. Nothing here chooses between several places.
 */
export const authoredPlace = (wiring: Wiring | undefined, manifestText: string, line: number): Place | undefined => {
  const path = manifestPath(manifestText, line);

  return path === undefined || wiring === undefined ? undefined : wiring.definitions[path.join("/")];
};

/**
 * Find All References, for the same manifest line: every place the name is USED. This is the many-sided end of a connection, which a jump cannot express, because a handler can be bound to many
 * events and a component used in many places:
 *
 *   an event or command of a component   where its template raises it, and every `on.x=` that handles it, in every caller
 *   a prop of a component                where its template reads it, and every attribute that passes it
 *   a state field the layout reads       every place the layout reads it
 *   a command the layout runs            every place it is run
 *   a component                          where `src/main.ts` declares it, and every place it is used
 */
export const referencesOf = (wiring: Wiring | undefined, manifestText: string, line: number): ReadonlyArray<Place> => {
  const path = manifestPath(manifestText, line);

  if (path === undefined || wiring === undefined || path[0] !== "components") { return []; }

  const key = path.join("/");

  if (path.length === 2) {
    const declared = wiring.tree?.find((each) => each.name === path[1])?.declared;

    return [...(declared === undefined ? [] : [declared]), ...wiring.uses.filter((use) => use.tag === path[1] && !use.at.file.includes("/views/") && !use.at.file.startsWith("..")).map((use) => use.at)];
  }

  if (path.length !== 4) { return []; }

  if (path[1] === "layout") {
    if (path[2] === "scope") { return wiring.state.find((each) => each.name === path[3])?.readBy ?? []; }
    if (path[2] === "commands") { return wiring.commands.find((each) => each.name === path[3])?.runBy ?? []; }

    return [];
  }

  return wiring.bindings[key] ?? [];
};

// ---- CodeLens ------------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface Lens {
  /** Zero-based line the lens sits above. */
  readonly line: number;
  readonly title: string;
  /** Where clicking goes: one place opens it, several are peeked, none does nothing. */
  readonly targets: ReadonlyArray<Place>;
}

const base = (file: string): string => file.split("/").pop() ?? file;
const at = (place: Place): string => `${base(place.file)}:${place.line}`;
const MAX = 3;
const declaredIn = (place: Place | undefined): string => place === undefined ? "" : ` · declared in ${at(place)}`;

const listing = (places: ReadonlyArray<Place>): string => places.length <= MAX ? places.map(at).join(", ") : `${places.slice(0, MAX).map(at).join(", ")} +${places.length - MAX}`;

/**
 * The lenses for one authored file (relative to the project): each end of each connection says where the other end is.
 *
 *   a use of a component     → the template, what is passed, what is done on each event
 *   a component's template   at the top: where it is declared and who uses it; its prop: who passes it, as what; its event: who handles it, and what that does
 *   src/main.ts              each component: its template and its place in the tree; each prop and event it lists: where the template reads or raises it, who passes or handles it;
 *                            each state field and command: who reads or runs it
 */
export const lensesFor = (wiring: Wiring, file: string): ReadonlyArray<Lens> => {
  const found: Array<Lens> = [];

  for (const use of wiring.uses.filter((each) => each.at.file === file)) {
    const parts = [...use.props.map((prop) => `${prop.name} ← ${prop.from}`), ...use.events.map((event) => `on ${event.name} ⇒ ${event.to}`)];

    found.push({ line: use.at.line - 1, title: `→ ${base(use.target.file)}${parts.length === 0 ? "" : `  ·  ${parts.join("  ·  ")}`}`, targets: [use.target] });
  }

  const callersOf = (target: string): ReadonlyArray<Place> => wiring.uses.filter((use) => use.target.file === target && !use.at.file.includes("/views/") && !use.at.file.startsWith("..")).map((use) => use.at);

  // The tree, from both ends: a template says where it is declared and used; `src/main.ts` says what each declaration is.
  for (const node of (wiring.tree ?? []).filter((each) => each.file === file)) {
    const callers = callersOf(file);
    const role = node.parents.includes("(application)") ? (node.name === "layout" ? "the application's layout" : "replaces a built-in") : `in ${node.parents.join(", ")}`;
    const where = node.declared === undefined ? [] : [node.declared];

    found.push({ line: 0, title: [role, ...(node.declared === undefined ? [] : [`declared in ${at(node.declared)}`]), ...(callers.length === 0 ? [] : [`used in ${listing(callers)}`])].join("  ·  "), targets: [...where, ...callers] });
  }

  for (const node of (wiring.tree ?? []).filter((each) => each.declared?.file === file)) {
    const own = wiring.components.find((each) => each.name === node.name);

    found.push({ line: node.declared!.line - 1, title: `→ ${base(node.file)}${node.parents.includes("(application)") ? "" : `  ·  in ${node.parents.join(", ")}`}${node.uses.length === 0 ? "" : `  ·  uses ${node.uses.join(", ")}`}`, targets: [{ file: node.file, line: 1, column: 1 }] });

    for (const prop of own?.props ?? []) {
      const where = prop.declared ?? node.declared!;

      found.push({ line: where.line - 1, title: `prop ${prop.name} · read in ${at(prop.at)}${prop.passedBy.length === 0 ? " · not passed by any template" : ` · passed from ${prop.passedBy.map((each) => `${at(each.at)} as ${each.from}`).join(", ")}`}`, targets: [prop.at, ...prop.passedBy.map((each) => each.at)] });
    }

    for (const event of own?.events ?? []) {
      const where = event.declared ?? node.declared!;

      found.push({ line: where.line - 1, title: `event ${event.name} · raised in ${at(event.at)}${event.handledBy.length === 0 ? " · not handled by any template" : ` · handled in ${event.handledBy.map((each) => `${at(each.at)} ⇒ ${each.to}`).join(", ")}`}`, targets: [event.at, ...event.handledBy.map((each) => each.at)] });
    }
  }

  for (const component of wiring.components.filter((each) => each.file === file)) {
    const callers = callersOf(file);

    if (wiring.tree === undefined && callers.length > 0) { found.push({ line: 0, title: `used in ${listing(callers)}`, targets: callers }); }

    for (const prop of component.props) {
      found.push({ line: prop.at.line - 1, title: prop.passedBy.length === 0 ? `prop ${prop.name}${declaredIn(prop.declared)} · not passed by any template` : `prop ${prop.name}${declaredIn(prop.declared)} · passed from ${prop.passedBy.map((each) => `${at(each.at)} as ${each.from}`).join(", ")}`, targets: prop.passedBy.map((each) => each.at) });
    }

    for (const event of component.events) {
      found.push({ line: event.at.line - 1, title: event.handledBy.length === 0 ? `event ${event.name}${declaredIn(event.declared)} · not handled by any template` : `event ${event.name}${declaredIn(event.declared)} · handled in ${event.handledBy.map((each) => `${at(each.at)} ⇒ ${each.to}`).join(", ")}`, targets: event.handledBy.map((each) => each.at) });
    }
  }

  for (const state of wiring.state.filter((each) => each.source.file === file)) {
    found.push({ line: state.source.line - 1, title: state.readBy.length === 0 ? `state · not read by any template` : `state · read in ${listing(state.readBy)}`, targets: state.readBy });
  }

  for (const command of wiring.commands.filter((each) => each.source.file === file)) {
    found.push({ line: command.source.line - 1, title: command.runBy.length === 0 ? `command · not run by any template` : `command · run in ${listing(command.runBy)}`, targets: command.runBy });
  }

  return found;
};

// ---- the imports in src/main.ts ------------------------------------------------------------------------------------------------------------------------------------

export interface TemplateImport {
  /** Zero-based line, and the columns of the specifier text (inside the quotes). */
  readonly line: number;
  readonly start: number;
  readonly end: number;
  /** As written: `./theme-toggle.mprx`. */
  readonly specifier: string;
}

/**
 * The template files `src/main.ts` imports. TypeScript knows `*.mprx` only as an ambient module, so ctrl+click on the specifier would land on that declaration instead of the template; the
 * extension makes the specifier a link to the file.
 */
export const templateImports = (text: string): ReadonlyArray<TemplateImport> =>
  text.split("\n").flatMap((content, line) => Array.from(content.matchAll(/\bfrom\s+(["'])(\.{1,2}\/[^"']*\.mprx)\1/g), (match) => {
    const start = match.index! + match[0].indexOf(match[2]!);

    return { line, start, end: start + match[2]!.length, specifier: match[2]! };
  }));
