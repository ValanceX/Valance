// Build time, in Node: the templates → one MESH program. Templates are found, never listed: every `.mprx` file under `src/` is a component named by its file (`src/callout.mprx` is
// `<callout>`), and the framework's own (`views/` in this package) fill in what the author did not write. A template with the same name as a built-in replaces it. The manifest MESH checks
// the templates against is derived (Valance's `manifest`) from the tag table, the layout's scope and the command table, so there is no manifest file to keep in step.
import { compileProgram } from "@valancex/mesh-compiler";
import type { Template as CompiledTemplate } from "@valancex/mesh-compiler";
import type * as Valance from "@valancex/valance";
import { manifest } from "@valancex/valance/web/build";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { commandTable, scopeSchema } from "@valancex/common/internal";
import type { Diagnostic } from "./diagnostics.js";
import { AppError, diagnostic } from "./diagnostics.js";
import type { Component, DefinedApp } from "@valancex/common";
import type { Node, Place } from "./tree.js";
import { declarationsOf, declaredOf, linked, nameOf, treeOf } from "./tree.js";
import { tagsOf } from "./outline.js";
import { entryOf } from "./contract.js";
import { idOf, libraryOf, librariesOf } from "./libraries.js";
import { locateKey } from "./wiring.js";
import { namesOf, webVocabulary, WHOLE } from "@valancex/common/internal";
import type { Vocabulary } from "@valancex/common/internal";
import { checkReferences, checkTemplate } from "./rules.js";
import { ENTRY_FILE, GENERATED_DIR } from "./project.js";

export const SOURCE_DIR = "src";
/** The component the page is drawn by. */
export const ROOT = "layout";

export const BUILT_IN = fileURLToPath(new URL("../views/", import.meta.url));
/** The desktop target's built-in views: the same components as the web's, written in the desktop vocabulary. */
export const BUILT_IN_DESKTOP = fileURLToPath(new URL("../views-desktop/", import.meta.url));
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

/** A library component left out of a target's program because its library does not support the target (K5): the tag is reported at each use, once, where the application can act. */
export interface Excluded {
  readonly id: string;
  readonly library: string;
  readonly supports: ReadonlyArray<string>;
}

export interface Templates {
  readonly all: ReadonlyArray<Template>;
  /** The library components this target leaves out, by tag. */
  readonly excluded: ReadonlyMap<string, Excluded>;
  /** The declared tree, in `src/main.ts`'s own words. */
  readonly tree: ReadonlyArray<Node>;
}

/**
 * Built-in templates, then the author's. The author's are exactly the ones `src/main.ts` declares: `layout`, `components` and `override`. A file under `src/` that is not declared is an error, not
 * a guess; a registered component that no template writes is allowed (it is not part of the program until one does). Which components a template uses is read from the template. A name that is a built-in's replaces it only through `override`.
 */
export const templatesOf = (root: string, author: DefinedApp | undefined, vocabulary: Vocabulary = webVocabulary, views: string = BUILT_IN): Templates => {
  const found = new Map<string, Template>();

  for (const file of mprxIn(views)) {
    const component = basename(file, ".mprx");

    found.set(component, { component, path: `@valancex/cli/${basename(views)}/${file}`, source: readFileSync(join(views, file), "utf8"), builtIn: true });
  }

  const layout = author?.layout;
  const overrides = author?.override ?? [];
  const { libraries } = librariesOf(root);
  const resolved = author?.resolve ?? {};
  const overridden = new Set(overrides.map((each) => nameOf(each.template.mprx)));
  const excluded = new Map<string, Excluded>();
  const idFor = (component: Component): string => idOf(libraries, root, component.template.mprx, nameOf(component.template.mprx));
  // The components of this target's program. A library's component is left out when its library does not support this target (K5: one diagnostic at the use, not several inside the library), when the
  // application's own template of that name replaces it (`override`), and when `resolve` chose another of that name (K14).
  const components = (author?.components ?? []).filter((each) => {
    const name = nameOf(each.template.mprx);
    const library = libraryOf(libraries, root, each.template.mprx);

    if (library === undefined) {
      return true;
    }

    if (!library.targets.includes(vocabulary.target as never)) {
      excluded.set(name, { id: idFor(each), library: library.name, supports: library.targets });

      return false;
    }

    return !overridden.has(name) && (resolved[name] === undefined || resolved[name] === idFor(each));
  });
  const declared = treeOf(layout, overrides, components);
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

    if (
      !builtInNames.has(name) &&
      name !== ROOT &&
      !(author?.components ?? []).some((other) => nameOf(other.template.mprx) === name && libraryOf(libraries, root, other.template.mprx) !== undefined)
    ) {
      problem(
        at(each.template.mprx),
        "override-unknown",
        `<${name}> is not a built-in component and no library component in \`components\` has that name, so there is nothing to override; register it in \`components\` instead`,
      );
    }
  }

  for (const [tag, id] of Object.entries(resolved)) {
    if (!(author?.components ?? []).some((each) => idFor(each) === id)) {
      const named = (author?.components ?? []).filter((each) => nameOf(each.template.mprx) === tag).map(idFor);

      problem(
        { file: ENTRY_FILE, line: 1, column: 1 },
        "resolve-unknown",
        `\`resolve\` says <${tag}> is ${id}, but no component in \`components\` has that id${named.length === 0 ? ` (nothing named ${tag} is listed)` : ` (listed with that name: ${named.join(", ")})`}`,
      );
    }
  }

  // A name is one component. Two files of one name, from anywhere in the definition (two libraries', or a library's and the application's), are an error: the first listed must not win silently
  // (decision K14). A component that is not listed in `override` and is named like a built-in is the same collision, with the built-in.
  // A library's component is named by its qualified id (`acme-ui/disclosure`) in a diagnostic and in `resolve`; the application's own, by the bare name.
  const listed = declaredOf(layout, overrides, components);
  const firstOf = new Map<string, { readonly file: string; readonly id: string }>();
  const idOfFile = (file: string, name: string): string => idOf(libraries, root, file, name);

  for (const each of listed) {
    const first = firstOf.get(each.name);
    const id = idOfFile(each.file, each.name);

    if (first === undefined) {
      firstOf.set(each.name, { file: each.file, id });
      if (
        each.role === "component" &&
        builtInNames.has(each.name) &&
        resolved[each.name] !== id &&
        !listed.some((other) => other.role !== "component" && other.name === each.name)
      ) {
        problem(
          at(each.file),
          "template-builtin",
          `${id} is <${each.name}>, which is also a built-in component: list your own template of that name in \`override\` to replace the built-in, or choose this one with \`resolve: { ${each.name}: "${id}" }\``,
        );
      }
    } else if (first.file !== each.file) {
      const libraryMade = id !== each.name || first.id !== each.name;

      problem(
        at(each.file),
        "template-duplicate",
        libraryMade
          ? `${id === each.name ? each.file : id} and ${first.id === each.name ? first.file : first.id} are both <${each.name}>: a component is named by its file, so the name must be unique; choose one with \`resolve: { ${each.name}: "${id === each.name ? first.id : id}" }\` in defineApp, or replace both with your own template of that name in \`override\``
          : `${each.file} is also <${each.name}>, like ${first.file}: a component is named by its file, so the name must be unique; rename one of the files`,
      );
    }
  }

  const files = new Map<string, string>();

  for (const node of declared) {
    const place = at(node.file);

    if (namesOf(vocabulary).includes(node.name)) {
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

  // Every template under src/ must be somewhere in a tree: this target's, or another target's (a project for more than one target keeps each one's templates side by side).
  const claimed = new Set(files.values());

  const whole = ((author as unknown as Record<symbol, DefinedApp | undefined> | undefined)?.[WHOLE] ?? author) as DefinedApp | undefined;

  for (const parts of [whole, ...Object.values(whole?.targets ?? {})]) {
    for (const node of declaredOf(parts?.layout, parts?.override ?? [], parts?.components ?? [])) {
      claimed.add(node.file);
    }
  }

  for (const file of mprxIn(join(root, SOURCE_DIR))) {
    const path = `${SOURCE_DIR}/${file}`;

    if (!claimed.has(path)) {
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

  return { all: [...found.values()], tree, excluded };
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

export const manifestOf = (author: DefinedApp | undefined, vocabulary: Vocabulary = webVocabulary) => {
  const derived = manifest({
    // A web vocabulary is a table the manifest is derived from; any other is a manifest already, and its components are merged in as they are.
    primitives: "tags" in vocabulary ? vocabulary.tags : {},
    scopes: { [ROOT]: scopeSchema(author) },
    commands: commandTable(author) as never,
  });

  if (!("tags" in vocabulary)) {
    return { ...derived, components: { ...vocabulary.components, ...derived.components } };
  }

  // What the vocabulary declares of a tag's props and events (the specification's) settles what the table alone derived.
  const components = { ...derived.components } as Record<string, (typeof derived.components)[string]>;

  for (const [tag, declared] of Object.entries(vocabulary.declared ?? {})) {
    const entry = components[tag];

    if (entry !== undefined) {
      components[tag] = {
        ...entry,
        props: Object.fromEntries(Object.entries(entry.props).map(([name, prop]) => [name, declared.props[name] === undefined ? prop : { ...prop, ...declared.props[name] }])),
        events: Object.fromEntries(
          Object.entries(entry.events).map(([name, event]) => [name, declared.events[name] === undefined ? event : { ...event, ...declared.events[name] }]),
        ),
      } as never;
    }
  }

  // The props the vocabulary says a template may leave out.

  for (const [tag, names] of Object.entries(vocabulary.optional ?? {})) {
    const entry = components[tag];

    if (entry !== undefined) {
      components[tag] = {
        ...entry,
        props: Object.fromEntries(Object.entries(entry.props).map(([name, prop]) => [name, names.includes(name) ? { ...prop, required: false } : prop])),
      };
    }
  }

  return { ...derived, components };
};

const isManifestError = (error: unknown): error is Error & { readonly path: string } => error instanceof Error && (error as { readonly _tag?: string })._tag === "ManifestError";

/**
 * The model the templates are checked against: the derived one (the tags, the layout's scope, the commands), and an entry for each component that declares its interface. A declared interface is
 * exactly what was written, an omitted side being none, and it overrides inference; a component that declares neither props nor events keeps the contract MESH infers from its template and its
 * uses. MESH checks every use against it (an undeclared prop, a missing one, a wrong type, an undeclared event in a handler), at the use or in the template. A schema with no model type is a
 * diagnostic at the declaration, not a crash.
 */
const modelOf = (root: string, author: DefinedApp | undefined, tree: ReadonlyArray<Node>, vocabulary: Vocabulary): unknown => {
  const problems: Array<Diagnostic> = [];
  const mainText = entryText(root);
  let derived: ReturnType<typeof manifestOf> | undefined;

  try {
    derived = manifestOf(author, vocabulary);
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
      const place = site?.member(each.kind === "unit" ? "props" : each.kind, each.name) ?? site?.call ?? site?.imported ?? { file: ENTRY_FILE, line: 1, column: 1 };

      problems.push(
        diagnostic(
          place.file,
          place.line,
          "component-schema",
          each.message === undefined
            ? `${node.name}'s ${each.kind === "props" ? "prop" : each.kind === "unit" ? "unit field or command" : "event"} "${each.name}" has no type the model can hold: ${each.reason}`
            : `${node.name}: ${each.message}`,
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

/** The anchors of the content's headings: the ids the built-in views give them (the generated `content.json`, which the content stage wrote before this one). */
const anchorsOf = (root: string): ReadonlySet<string> => {
  try {
    const content = JSON.parse(readFileSync(join(root, GENERATED_DIR, "content.json"), "utf8")) as {
      readonly pages?: ReadonlyArray<{ readonly blocks?: ReadonlyArray<{ readonly anchor?: string }> }>;
    };

    return new Set((content.pages ?? []).flatMap((page) => (page.blocks ?? []).flatMap((block) => (block.anchor === undefined ? [] : [block.anchor]))));
  } catch {
    return new Set();
  }
};

/** A tag the web renamed (decision P7: `para` is `paragraph`): said where a template still writes the old one. */
const renamedHint = (
  vocabulary: Vocabulary,
  used: ReadonlyArray<{ readonly path: string; readonly source: string }>,
  at: { readonly path: string; readonly message?: string; readonly span: { readonly start: { readonly line: number; readonly column: number } } },
): string => {
  // a prop the web renamed (decision I29: a popover's `kind` is `mode`): the diagnostic names the tag and the prop
  const prop = /component "([^"]+)" has no prop "([^"]+)"/.exec(at.message ?? "");
  const renamedProp = prop === null || !("tags" in vocabulary) ? undefined : vocabulary.renamedProps?.[prop[1]!]?.[prop[2]!];

  if (renamedProp !== undefined) {
    return ` (\`${prop![2]}\` on \`${prop![1]}\` is now \`${renamedProp}\`)`;
  }

  const renamed = "tags" in vocabulary ? vocabulary.renamed : undefined;
  const line = used.find((template) => template.path === at.path)?.source.split("\n")[at.span.start.line - 1];

  if (renamed === undefined || line === undefined) {
    return "";
  }

  const tag = /<\/?([A-Za-z][\w-]*)/.exec(line.slice(Math.max(0, at.span.start.column - 2)))?.[1];

  return tag !== undefined && Object.hasOwn(renamed, tag) ? ` (\`${tag}\` is now \`${renamed[tag]}\`)` : "";
};

/** Compiles the application's templates against a target's vocabulary (the web's by default). Fails with every diagnostic, each pointing into the file it is about. */
export const compileViews = async (root: string, author: DefinedApp | undefined, vocabulary: Vocabulary = webVocabulary, views: string = BUILT_IN): Promise<Compiled> => {
  const { all, tree, excluded } = templatesOf(root, author, vocabulary, views);
  const used = reachable(all);
  const model = modelOf(root, author, tree, vocabulary);

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
          .map((each) => {
            // a library component this target leaves out (K5): one sentence at the use, in place of the compiler's "unknown component"
            const left = each.code === "unknown-component" ? excluded.get(/component "([^"]+)"/.exec(each.message)?.[1] ?? "") : undefined;

            return left === undefined
              ? each
              : {
                  ...each,
                  code: "unsupported-target",
                  message: `<${each.message.match(/component "([^"]+)"/)![1]}> is ${left.id}, and ${left.library} supports ${left.supports.join(" and ")} only; this project builds for ${vocabulary.target}. Use a component that ${vocabulary.target} has, or build ${left.library} for ${vocabulary.target}`,
                  suggestions: [],
                };
          })
          .map((each) =>
            diagnostic(
              each.path,
              each.span.start.line,
              each.code,
              each.message +
                (each.suggestions.length > 0 ? ` (did you mean ${each.suggestions.map((suggestion) => `"${suggestion.replacement}"`).join(" or ")}?)` : "") +
                renamedHint(vocabulary, used, each),
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
  const rules = "tags" in vocabulary ? vocabulary.rules : undefined;

  if (rules !== undefined) {
    const texts = (program as unknown as { readonly templates: ReadonlyArray<string> }).templates;
    const known = new Set(namesOf(vocabulary));
    const broken = used.flatMap((template, index) =>
      checkTemplate(
        template.path,
        template.source,
        JSON.parse(texts[index] ?? "{}") as CompiledTemplate,
        rules,
        known,
        tree.find((node) => node.name === template.component)?.interface?.name,
      ),
    );

    const compiled = used.map((template, index) => ({
      file: template.path,
      source: template.source,
      template: JSON.parse(texts[index] ?? "{}") as CompiledTemplate,
      builtIn: template.builtIn,
    }));
    broken.push(...checkReferences(compiled, anchorsOf(root)));

    if (broken.length > 0) {
      throw new AppError(broken.map((each) => relocate(each, root)));
    }
  }

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
        ? relative(root, join(views, `${template.component}.mprx`))
            .split(sep)
            .join("/")
        : template.path,
      source: template.source,
      builtIn: template.builtIn,
    })),
  };
};

const relocate = (each: Diagnostic, root: string): Diagnostic => ({ ...each, file: each.file.startsWith(root) ? relative(root, each.file) : each.file });
