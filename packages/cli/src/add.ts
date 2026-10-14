// `vlx generate`: the files for a new page or component, and, for a component, its registration in `src/main.ts`. Like `init`, this file is the work and prints nothing; `cli.ts` says what happened.
// Nothing here overwrites a file: a name that is taken is refused.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { BUILT_IN, BUILT_IN_DESKTOP, ROOT, SOURCE_DIR } from "./compile.js";
import { ENTRY_FILE } from "./project.js";
import { primitives } from "@valancex/common/internal";

export const KINDS = ["page", "component"] as const;
export type Kind = (typeof KINDS)[number];

export interface Generated {
  /** Files written, relative to the project. */
  readonly created: ReadonlyArray<string>;
  /** Files changed, relative to the project. */
  readonly changed: ReadonlyArray<string>;
  /** What is left to do by hand, in words. */
  readonly notes: ReadonlyArray<string>;
}

export class GenerateError extends Error {}

const words = (name: string): string => name.replace(/[-_]+/g, " ").replace(/^./, (first) => first.toUpperCase());
const camel = (name: string): string => name.replace(/-([a-z0-9])/g, (_, next: string) => next.toUpperCase());

const write = (root: string, file: string, text: string): void => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};

// ---- a page ------------------------------------------------------------------------------------------------------------------------------------------------

/** `guide/getting-started`, from what was typed: `/guide/getting-started`, `guide/getting-started.md`. */
export const pageName = (given: string): string =>
  given
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.md$/, "");

export const pageProblem = (name: string): string | undefined =>
  name === ""
    ? "the page needs a path: vlx generate page guide/getting-started"
    : name.split("/").every((segment) => /^[A-Za-z0-9][\w-]*$/.test(segment))
      ? undefined
      : `"${name}" cannot be a page's address: use words joined by - or _, and / between sections (guide/getting-started)`;

export const generatePage = (root: string, given: string, title?: string): Generated => {
  const name = pageName(given);
  const problem = pageProblem(name);

  if (problem !== undefined) {
    throw new GenerateError(problem);
  }

  const file = `content/${name}.md`;

  if (existsSync(join(root, file))) {
    throw new GenerateError(`${file} already exists`);
  }

  const heading = title ?? words(name.split("/").pop()!);

  write(root, file, `---\ntitle: ${heading}\n---\n\n# ${heading}\n\nWrite here.\n`);

  return { created: [file], changed: [], notes: [] };
};

// ---- a component -------------------------------------------------------------------------------------------------------------------------------------------

const builtIns = (): ReadonlySet<string> =>
  new Set(
    [...readdirSync(BUILT_IN), ...readdirSync(BUILT_IN_DESKTOP)]
      .filter((file) => file.endsWith(".mprx"))
      .map((file) => file.slice(0, -".mprx".length)),
  );

export const componentProblem = (name: string, root?: string): string | undefined => {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    return `"${name}" cannot be a tag: use lowercase words joined by - (callout, post-card)`;
  }
  if (name === ROOT) {
    return `<${ROOT}> is the page's shell; it is made by vlx init, and changed in ${SOURCE_DIR}/${ROOT}.mprx`;
  }
  if (name in primitives) {
    return `<${name}> is already a tag the framework draws as an element; name the component something else`;
  }
  if (builtIns().has(name)) {
    return `<${name}> is a built-in component; to replace it, write src/${name}.mprx and list it in \`override\` in ${ENTRY_FILE}`;
  }

  return root !== undefined && (existsSync(join(root, SOURCE_DIR, `${name}.mprx`)) || existsSync(join(root, SOURCE_DIR, `${name}.ts`)))
    ? `src/${name}.mprx or src/${name}.ts already exists`
    : undefined;
};

const TEMPLATE = (name: string): string => `<div class="${name}">\n  <mesh-slot />\n</div>\n`;

const DEFINITION = (name: string): string => `import { component } from "@valancex/common";
import template from "./${name}.mprx";

// The interface of <${name}>, stated once, where it is defined: the props its template reads and the events it raises, each with its type (an Effect Schema, from "effect"; Schema.Void is no
// payload). Delete both to let the interface be inferred from the template instead.
export default component(template, {
  props: {},
  events: {},
});
`;

const NEW_MAIN = (ident: string, name: string): string => `import { defineApp } from "@valancex/common";
import ${ident} from "./${name}.js";

export default defineApp({
  components: [${ident}],
});
`;

/** The `import` line, after the last import already there. */
const withImport = (text: string, line: string): string => {
  const imports = [...text.matchAll(/^import\b[^;]*;[^\S\n]*$/gm)];
  const last = imports[imports.length - 1];

  return last === undefined ? `${line}\n${text}` : `${text.slice(0, last.index! + last[0].length)}\n${line}${text.slice(last.index! + last[0].length)}`;
};

/** `main.ts` with `ident` added to `components`, or `undefined` when its definition is not written in the plain form this can edit. */
export const register = (text: string, ident: string, name: string): string | undefined => {
  const line = `import ${ident} from "./${name}.js";`;
  const list = /components\s*:\s*\[/.exec(text);

  if (list !== undefined && list !== null) {
    const open = list.index + list[0].length;
    const close = text.indexOf("]", open);

    if (close < 0 || /[[\]]/.test(text.slice(open, close))) {
      return undefined;
    }

    const inside = text.slice(open, close);
    const items = inside.trim().replace(/,$/, "");
    const multiline = inside.includes("\n");
    const next = multiline
      ? `${inside.replace(/\s*$/, "").replace(/,?$/, ",")}\n${/^\s*/.exec(inside.split("\n")[1] ?? "    ")![0]}${ident},\n${/[^\n]*$/.exec(inside)![0]}`
      : items === ""
        ? ident
        : `${items}, ${ident}`;

    return withImport(`${text.slice(0, open)}${next}${text.slice(close)}`, line);
  }

  const define = /defineApp\(\s*\{/.exec(text);

  if (define === null) {
    return undefined;
  }

  const at = define.index + define[0].length;

  return withImport(`${text.slice(0, at)}\n  components: [${ident}],${text.slice(at)}`, line);
};

export const generateComponent = (root: string, name: string): Generated => {
  const problem = componentProblem(name, root);

  if (problem !== undefined) {
    throw new GenerateError(problem);
  }

  const ident = camel(name);
  const created = [`${SOURCE_DIR}/${name}.mprx`, `${SOURCE_DIR}/${name}.ts`];
  const entry = join(root, ENTRY_FILE);
  const notes: Array<string> = [];
  const changed: Array<string> = [];

  write(root, created[0]!, TEMPLATE(name));
  write(root, created[1]!, DEFINITION(name));

  if (!existsSync(entry)) {
    write(root, ENTRY_FILE, NEW_MAIN(ident, name));
    created.push(ENTRY_FILE);
  } else {
    const text = readFileSync(entry, "utf8");
    const edited = new RegExp(`\\b${ident}\\b`).test(text) ? undefined : register(text, ident, name);

    if (edited === undefined) {
      notes.push(`add it to ${ENTRY_FILE} yourself: import ${ident} from "./${name}.js"; and list ${ident} in the \`components\` of defineApp`);
    } else {
      writeFileSync(entry, edited);
      changed.push(ENTRY_FILE);
    }
  }

  notes.push(`use it by writing <${name}></${name}> in a template`);

  return { created, changed, notes };
};
