// Build time, in Node: the templates → one MESH program. Templates are found, never listed: every `.mprx` file under `src/` is a component named by its file (`src/callout.mprx` is
// `<callout>`), and the framework's own (`views/` in this package) fill in what the author did not write. A template with the same name as a built-in replaces it. The manifest MESH checks
// the templates against is derived (Valance's `manifest`) from the tag table, the layout's scope and the command table, so there is no manifest file to keep in step.
import { compileProgram } from "@valancex/mesh-compiler";
import type * as Valance from "@valancex/valance";
import { manifest } from "@valancex/valance/web/build";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { commandTable, scopeSchema } from "@valancex/common/internal";
import type { Diagnostic } from "./diagnostics.js";
import { AppError, diagnostic } from "./diagnostics.js";
import type { DefinedApp } from "@valancex/common";
import type { Node, Place } from "./tree.js";
import { declarationsOf, linked, nameOf, treeOf } from "./tree.js";
import { tagsOf } from "./outline.js";
import { entryOf } from "./contract.js";
import { locateKey } from "./wiring.js";
import { primitives } from "@valancex/common/internal";
import { ENTRY_FILE } from "./project.js";

export const SOURCE_DIR = "src";
/** The component the page is drawn by. */
export const ROOT = "layout";

export const BUILT_IN = fileURLToPath(new URL("../views/", import.meta.url));
/** The package directory: where its README, which documents the framework's own names, is. */
export const PACKAGE_DIR = fileURLToPath(new URL("../", import.meta.url));

interface Template {
  readonly component: string;
  /** As shown in a diagnostic. */
  readonly path: string;
  readonly source: string;
  readonly builtIn: boolean;
}

const mprxIn = (dir: string): ReadonlyArray<string> =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((file) => file.endsWith(".mprx"))
        .sort()
    : [];

const entryText = (root: string): string => {
  try {
    return readFileSync(join(root, ENTRY_FILE), "utf8");
  } catch {
    return "";
  }
};

export interface Templates {
  readonly all: ReadonlyArray<Template>;
  /** The declared tree, in `src/main.ts`'s own words. */
  readonly tree: ReadonlyArray<Node>;
}

/**
 * Built-in templates, then the author's. The author's are exactly the ones `src/main.ts` declares: `layout`, `components` and `override`. A file under `src/` that is not declared is an error, not
 * a guess; a registered component that no template writes is allowed (it is not part of the program until one does). Which components a template uses is read from the template. A name that is a built-in's replaces it only through `override`.
 */
export const templatesOf = (root: string, author: DefinedApp | undefined): Templates => {
  const found = new Map<string, Template>();

  for (const file of mprxIn(BUILT_IN)) {
    const component = basename(file, ".mprx");

    found.set(component, { component, path: `@valancex/cli/views/${file}`, source: readFileSync(join(BUILT_IN, file), "utf8"), builtIn: true });
  }

  const layout = author?.layout;
  const overrides = author?.override ?? [];
  const declared = treeOf(layout, overrides, author?.components ?? []);
  const declarations = declarationsOf(root);
  const problems: Array<Diagnostic> = [];
  /** Where a template's component is defined: its `component(…)` call, else where it is imported, else the top of the entry file. */
  const at = (file: string): Place => {
    const site = declarations.get(file);
    return site?.call ?? site?.imported ?? { file: ENTRY_FILE, line: 1, column: 1 };
  };
  const problem = (place: Place, code: string, message: string): void => {
    problems.push(diagnostic(place.file, place.line, code, message, place.column));
  };

  // The layout's inputs are the state and the commands, so it has no props or events of its own to declare.
  if (layout !== undefined && (layout.props !== undefined || layout.events !== undefined)) {
    problem(
      at(layout.template.mprx),
      "layout-contract",
      "the layout takes no props and raises no events: its inputs are the state and the commands. Declare state fields and commands in defineApp instead",
    );
  }

  if (layout !== undefined && nameOf(layout.template.mprx) !== ROOT) {
    problem(at(layout.template.mprx), "layout-name", `the layout's template must be named ${ROOT}.mprx, not ${basename(layout.template.mprx)}`);
  }

  const builtInNames = new Set(found.keys());

  for (const each of overrides) {
    const name = nameOf(each.template.mprx);

    if (!builtInNames.has(name) && name !== ROOT) {
      problem(
        at(each.template.mprx),
        "override-unknown",
        `<${name}> is not a built-in component, so there is nothing to override; list it in the \`uses\` of the component that uses it`,
      );
    }
  }

  const files = new Map<string, string>();

  for (const node of declared) {
    const place = at(node.file);

    if (files.has(node.name) && files.get(node.name) !== node.file) {
      problem(place, "template-duplicate", `${files.get(node.name)} is also <${node.name}>: a component is named by its file, so the name must be unique`);
      continue;
    }
    if (node.name in primitives) {
      problem(place, "template-primitive", `<${node.name}> is already a tag the framework draws as an element; name the file something else`);
      continue;
    }
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(node.name)) {
      problem(place, "template-name", `"${node.name}" cannot be a tag: use lowercase words joined by - (for example callout or post-card)`);
      continue;
    }
    if (!existsSync(join(root, node.file))) {
      problem(place, "template-missing", `${node.file} does not exist`);
      continue;
    }

    files.set(node.name, node.file);
    found.set(node.name, { component: node.name, path: node.file, source: readFileSync(join(root, node.file), "utf8"), builtIn: false });
  }

  // Every template under src/ must be somewhere in the tree.
  for (const file of mprxIn(join(root, SOURCE_DIR))) {
    const path = `${SOURCE_DIR}/${file}`;

    if (![...files.values()].includes(path)) {
      problems.push(
        diagnostic(
          path,
          0,
          "template-unused",
          `${path} is not in the component tree: import it in ${ENTRY_FILE} and ${basename(file) === `${ROOT}.mprx` ? "pass it as `layout`" : "list it in `components`"}`,
        ),
      );
    }
  }

  // Who uses whom is what the templates write: a component's uses are the declared components whose tags its template has.
  const tree = linked(declared, layout, overrides, (name) => [...tagsOf(found.get(name)?.source ?? "").keys()]);

  if (problems.length > 0) {
    throw new AppError(problems);
  }

  return { all: [...found.values()], tree };
};

/** The templates the root reaches, following the tags each uses. A template nothing uses is not part of the program (the compiler refuses one). */
const reachable = (all: ReadonlyArray<Template>): ReadonlyArray<Template> => {
  const byName = new Map(all.map((template) => [template.component, template]));
  const seen = new Set<string>();
  const queue = [ROOT];

  while (queue.length > 0) {
    const name = queue.pop()!;
    const template = byName.get(name);

    if (template === undefined || seen.has(name)) {
      continue;
    }

    seen.add(name);

    for (const tag of tagsOf(template.source).keys()) {
      queue.push(tag);
    }
  }

  return all.filter((template) => seen.has(template.component));
};

export const manifestOf = (author: DefinedApp | undefined) =>
  manifest({
    primitives,
    scopes: { [ROOT]: scopeSchema(author) },
    commands: commandTable(author) as never,
  });

const isManifestError = (error: unknown): error is Error & { readonly path: string } => error instanceof Error && (error as { readonly _tag?: string })._tag === "ManifestError";

/**
 * The model the templates are checked against: the derived one (the tags, the layout's scope, the commands), and an entry for each component that declares its interface. A declared interface is
 * exactly what was written, an omitted side being none, and it overrides inference; a component that declares neither props nor events keeps the contract MESH infers from its template and its
 * uses. MESH checks every use against it (an undeclared prop, a missing one, a wrong type, an undeclared event in a handler), at the use or in the template. A schema with no model type is a
 * diagnostic at the declaration, not a crash.
 */
const modelOf = (root: string, author: DefinedApp | undefined, tree: ReadonlyArray<Node>): unknown => {
  const problems: Array<Diagnostic> = [];
  const mainText = entryText(root);
  let derived: ReturnType<typeof manifestOf> | undefined;

  try {
    derived = manifestOf(author);
  } catch (error) {
    if (!isManifestError(error)) {
      throw error;
    }

    // `layout.theme.deep`: a state field (the layout's scope) names where; anything else is the commands.
    const field = /^layout\.([^.[]+)/.exec(error.path)?.[1];
    const place = field === undefined ? { file: ENTRY_FILE, line: 1, column: 1 } : locateKey(mainText, field);

    problems.push(
      diagnostic(
        place.file,
        place.line,
        "state-type",
        `${field === undefined ? error.path : `the state field "${field}"`} has no type the model can hold: ${error.message.replace(/^[\w.[\]]+: /, "")}`,
        place.column,
      ),
    );
  }

  const declarations = declarationsOf(root);
  const entries: Record<string, unknown> = {};

  for (const node of tree) {
    if (node.interface === undefined || node.name === ROOT) {
      continue;
    }

    const { entry, problems: bad } = entryOf(node.interface);
    const site = declarations.get(node.file);

    for (const each of bad) {
      const place = site?.member(each.kind, each.name) ?? site?.call ?? site?.imported ?? { file: ENTRY_FILE, line: 1, column: 1 };

      problems.push(
        diagnostic(
          place.file,
          place.line,
          "component-schema",
          `${node.name}'s ${each.kind === "props" ? "prop" : "event"} "${each.name}" has no type the model can hold: ${each.reason}`,
          place.column,
        ),
      );
    }

    entries[node.name] = entry;
  }

  if (problems.length > 0 || derived === undefined) {
    throw new AppError(problems);
  }

  return { ...derived, components: { ...derived.components, ...entries } };
};

export interface Compiled {
  readonly program: Valance.Program;
  /**
   * What a template may use: every tag, prop, event, scope name and command, **with the contracts the compiler inferred for the author's own components** (a component's props are the
   * arguments its uses pass). This is the program's own model. The manifest derived before compiling declares only the tags and the layout, so an editor checking one file against it
   * would call every component of the author's "unknown". For editors.
   */
  readonly manifest: unknown;
  /** Each template the program was built from, by source path, for the editor: `src/theme-toggle.mprx` → `theme-toggle`. Built-in templates are not listed (they are not in the project). */
  readonly files: Readonly<Record<string, string>>;
  readonly components: ReadonlyArray<string>;
  /** The component tree as `src/main.ts` declares it. */
  readonly tree: ReadonlyArray<Node>;
  /** Every template the program was built from, with its source text and its file relative to the project (a built-in's is under the package, so it may start with `..`). */
  readonly templates: ReadonlyArray<{ readonly component: string; readonly file: string; readonly source: string; readonly builtIn: boolean }>;
}

/** Compiles the application's templates. Fails with every diagnostic, each pointing into the file it is about. */
export const compileViews = async (root: string, author: DefinedApp | undefined): Promise<Compiled> => {
  const { all, tree } = templatesOf(root, author);
  const used = reachable(all);
  const model = modelOf(root, author, tree);

  if (!used.some((template) => template.component === ROOT)) {
    throw new AppError([diagnostic(`${SOURCE_DIR}/${ROOT}.mprx`, 0, "layout-missing", "there is no layout")]);
  }

  const result = await compileProgram({
    model: { manifest: JSON.stringify(model), path: ".valance/manifest.json" },
    root: ROOT,
    components: used.map((template) => ({ component: template.component, source: template.source, path: template.path })),
  });

  if (result.program === undefined) {
    const found = [
      ...(result.components ?? []).flatMap((entry) =>
        entry.diagnostics.diagnostics
          .filter((each) => each.severity === "error")
          .map((each) =>
            diagnostic(
              each.path,
              each.span.start.line,
              each.code,
              each.message + (each.suggestions.length > 0 ? ` (did you mean ${each.suggestions.map((suggestion) => `"${suggestion.replacement}"`).join(" or ")}?)` : ""),
              each.span.start.column,
            ),
          ),
      ),
      ...(
        (
          result.assembly as
            | {
                readonly diagnostics?: ReadonlyArray<{
                  readonly code: string;
                  readonly message: string;
                  readonly path?: string;
                  readonly span?: { readonly start: { readonly line: number; readonly column: number } };
                }>;
              }
            | undefined
        )?.diagnostics ?? []
      ).map((each) => diagnostic(each.path ?? "program", each.span?.start.line ?? 0, each.code, each.message, each.span?.start.column ?? 0)),
    ];

    throw new AppError(found.map((each) => relocate(each, root)));
  }

  const program = result.program as unknown as Valance.Program;
  const enriched = (program as unknown as { readonly model: unknown }).model;
  const manifestOfProgram = typeof enriched === "string" ? JSON.parse(enriched) : enriched;

  return {
    program,
    manifest: manifestOfProgram,
    tree,
    files: Object.fromEntries(used.filter((template) => !template.builtIn).map((template) => [template.path, template.component])),
    components: used.map((template) => template.component),
    templates: used.map((template) => ({
      component: template.component,
      file: template.builtIn
        ? relative(root, join(BUILT_IN, `${template.component}.mprx`))
            .split(sep)
            .join("/")
        : template.path,
      source: template.source,
      builtIn: template.builtIn,
    })),
  };
};

const relocate = (each: Diagnostic, root: string): Diagnostic => ({ ...each, file: each.file.startsWith(root) ? relative(root, each.file) : each.file });
