// Build time, in Node: the templates → one MESH program. Templates are found, never listed: every `.mprx` file under `src/` is a component named by its file (`src/callout.mprx` is
// `<callout>`), and the framework's own (`views/` in this package) fill in what the author did not write. A template with the same name as a built-in replaces it. The manifest MESH checks
// the templates against is derived (Valance's `manifest`) from the tag table, the layout's scope and the command table, so there is no manifest file to keep in step.
import { compileProgram } from "@valancex/mesh-compiler";
import type * as Valance from "@valancex/valance";
import { manifest } from "@valancex/valance/web/build";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { commandTable, scopeSchema } from "./app.js";
import type { Diagnostic } from "./diagnostics.js";
import { AppError, diagnostic } from "./diagnostics.js";
import type { DefinedApp } from "./index.js";
import { primitives } from "./primitives.js";

export const SOURCE_DIR = "src";
/** The component the page is drawn by. */
export const ROOT = "layout";

const BUILT_IN = fileURLToPath(new URL("../views/", import.meta.url));
/** The package directory: where its README, which documents the framework's own names, is. */
export const PACKAGE_DIR = fileURLToPath(new URL("../", import.meta.url));

interface Template {
  readonly component: string;
  /** As shown in a diagnostic. */
  readonly path: string;
  readonly source: string;
  readonly builtIn: boolean;
}

const mprxIn = (dir: string): ReadonlyArray<string> => existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".mprx")).sort() : [];

/** Built-in templates, then the author's: a name the author uses again replaces the built-in. */
export const templatesOf = (root: string): ReadonlyArray<Template> => {
  const found = new Map<string, Template>();

  for (const file of mprxIn(BUILT_IN)) {
    const component = basename(file, ".mprx");

    found.set(component, { component, path: `@valancex/cli/views/${file}`, source: readFileSync(join(BUILT_IN, file), "utf8"), builtIn: true });
  }

  const own = new Map<string, string>();
  const problems: Array<Diagnostic> = [];

  for (const file of mprxIn(join(root, SOURCE_DIR))) {
    const component = basename(file, ".mprx");
    const path = `${SOURCE_DIR}/${file}`;

    if (own.has(component)) { problems.push(diagnostic(path, 0, "template-duplicate", `${own.get(component)} is also <${component}>: a component is named by its file, so the name must be unique under ${SOURCE_DIR}/`)); continue; }
    if (component in primitives) { problems.push(diagnostic(path, 0, "template-primitive", `<${component}> is already a tag the framework draws as an element; name the file something else`)); continue; }
    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(component)) { problems.push(diagnostic(path, 0, "template-name", `"${component}" cannot be a tag: use lowercase words joined by - (for example callout or post-card)`)); continue; }

    own.set(component, path);
    found.set(component, { component, path, source: readFileSync(join(root, path), "utf8"), builtIn: false });
  }

  if (problems.length > 0) { throw new AppError(problems); }

  return [...found.values()];
};

const TAG = /<([a-z][a-z0-9-]*)[\s/>]/g;

/** The templates the root reaches, following the tags each uses. A template nothing uses is not part of the program (the compiler refuses one). */
const reachable = (all: ReadonlyArray<Template>): { readonly used: ReadonlyArray<Template>; readonly unused: ReadonlyArray<Template> } => {
  const byName = new Map(all.map((template) => [template.component, template]));
  const seen = new Set<string>();
  const queue = [ROOT];

  while (queue.length > 0) {
    const name = queue.pop()!;
    const template = byName.get(name);

    if (template === undefined || seen.has(name)) { continue; }

    seen.add(name);

    for (const tag of template.source.matchAll(TAG)) { queue.push(tag[1]!); }
  }

  return { used: all.filter((template) => seen.has(template.component)), unused: all.filter((template) => !seen.has(template.component)) };
};

export const manifestOf = (author: DefinedApp | undefined) => manifest({
  primitives,
  scopes: { [ROOT]: scopeSchema(author) },
  commands: commandTable(author) as never,
});

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
  /** Every template the program was built from, with its source text and its file relative to the project (a built-in's is under the package, so it may start with `..`). */
  readonly templates: ReadonlyArray<{ readonly component: string; readonly file: string; readonly source: string; readonly builtIn: boolean }>;
}

/** Compiles the application's templates. Fails with every diagnostic, each pointing into the file it is about. */
export const compileViews = async (root: string, author: DefinedApp | undefined): Promise<Compiled> => {
  const all = templatesOf(root);
  const { used, unused } = reachable(all);
  const model = manifestOf(author);
  const orphans = unused.filter((template) => !template.builtIn).map((template) => diagnostic(template.path, 1, "template-unused", `<${template.component}> is never used: it is not reached from ${SOURCE_DIR}/${ROOT}.mprx (or the built-in layout), and an unused component is not compiled`));

  if (!used.some((template) => template.component === ROOT)) { throw new AppError([diagnostic(`${SOURCE_DIR}/${ROOT}.mprx`, 0, "layout-missing", "there is no layout")]); }

  const result = await compileProgram({
    model: { manifest: JSON.stringify(model), path: ".valance/manifest.json" },
    root: ROOT,
    components: used.map((template) => ({ component: template.component, source: template.source, path: template.path })),
  });

  if (result.program === undefined) {
    const found = [
      ...(result.components ?? []).flatMap((entry) => entry.diagnostics.diagnostics.filter((each) => each.severity === "error").map((each) => diagnostic(each.path, each.span.start.line, each.code, each.message + (each.suggestions.length > 0 ? ` (did you mean ${each.suggestions.map((suggestion) => `"${suggestion.replacement}"`).join(" or ")}?)` : ""), each.span.start.column))),
      ...(((result.assembly as { readonly diagnostics?: ReadonlyArray<{ readonly code: string; readonly message: string; readonly path?: string; readonly span?: { readonly start: { readonly line: number; readonly column: number } } }> } | undefined)?.diagnostics ?? []).map((each) => diagnostic(each.path ?? "program", each.span?.start.line ?? 0, each.code, each.message, each.span?.start.column ?? 0))),
    ];

    throw new AppError([...found.map((each) => relocate(each, root)), ...orphans]);
  }

  if (orphans.length > 0) { throw new AppError(orphans); }

  const program = result.program as unknown as Valance.Program;
  const enriched = (program as unknown as { readonly model: unknown }).model;

  return {
    program,
    manifest: typeof enriched === "string" ? JSON.parse(enriched) : enriched,
    files: Object.fromEntries(used.filter((template) => !template.builtIn).map((template) => [template.path, template.component])),
    components: used.map((template) => template.component),
    templates: used.map((template) => ({ component: template.component, file: template.builtIn ? relative(root, join(BUILT_IN, `${template.component}.mprx`)).split(sep).join("/") : template.path, source: template.source, builtIn: template.builtIn })),
  };
};

const relocate = (each: Diagnostic, root: string): Diagnostic => ({ ...each, file: each.file.startsWith(root) ? relative(root, each.file) : each.file });
