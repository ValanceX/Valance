// The author's side of a library (Bet 12; K7, K8, K13): `vlx init library` makes a workspace (the library, and a playground application that uses it), `vlx library build` writes what is published
// (JavaScript, declarations, and the templates and stylesheets as source), `vlx library check` holds the package to the rules a consumer's build relies on. The consumer's side (finding a marked
// package, the build settings, the diagnostics at the use site) is `libraries.ts`.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import { check } from "./check.js";
import { loadConfig } from "./config.js";
import type { Diagnostic } from "./diagnostics.js";
import { diagnostic, isProblem } from "./diagnostics.js";
import { cliSpec, commonSpec, packageName, runCommand } from "./init.js";
import type { PackageManager } from "./init.js";
import { CONDITION, hasCondition, installedAt } from "./libraries.js";
import { themeFileProblems } from "./theme.js";

const own = (): { readonly version: string; readonly dependencies: Readonly<Record<string, string>> } =>
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string; dependencies: Record<string, string> };

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

// ---- vlx init library ---------------------------------------------------------------------------------------------------------------------------------------------

export interface LibraryAnswers {
  /** The library's package name (`acme-ui`, `@acme/ui`). */
  readonly name: string;
  /** Where the workspace is written: absolute. */
  readonly dir: string;
  readonly packageManager: PackageManager;
  readonly cli?: string;
}

const MPRX_D_TS = `// What importing a template file gives TypeScript: the file's address. (The bundler makes the import; see @valancex/common/types/mprx.d.ts.)
declare module "*.mprx" {
  const template: { readonly mprx: string };
  export default template;
}
`;

/** Every file \`vlx init library\` writes, without writing any: relative path (\`/\` separated) → text. */
export const planLibrary = (answers: LibraryAnswers): ReadonlyMap<string, string> => {
  const out = new Map<string, string>();
  const manager = answers.packageManager;
  const slug = packageName(answers.name.replace(/^@[^/]+\//, ""));
  const lib = `packages/${slug}`;
  const common = own().dependencies["@valancex/common"];
  const range = common === undefined || common.startsWith("workspace:") ? `^${own().version}` : common;
  const link = manager === "pnpm" ? "workspace:*" : "*";
  const effect = own().dependencies["effect"] ?? "^3.10.0";
  const q = '"';

  out.set(
    "package.json",
    json({
      name: `${slug}-workspace`,
      version: "0.0.0",
      private: true,
      type: "module",
      ...(manager === "pnpm" ? {} : { workspaces: ["packages/*", "playground"] }),
      scripts: {
        // each through the package's own script: `vlx` is installed in the package that uses it, not at the workspace root, where a script cannot find it
        "build:library": `cd ${lib} && ${runCommand(manager)} build`,
        "check:library": `cd ${lib} && ${runCommand(manager)} check`,
        playground: `cd playground && ${runCommand(manager)} dev`,
      },
    }),
  );

  if (manager === "pnpm") {
    out.set("pnpm-workspace.yaml", `packages:\n  - "packages/*"\n  - playground\nallowBuilds:\n  esbuild: false\n`);
  }

  out.set(".gitignore", "node_modules\ndist\n.valance\n");
  out.set(
    `${lib}/package.json`,
    json({
      name: answers.name,
      version: "0.0.0",
      description: "A VALANCE component library.",
      license: "MIT",
      type: "module",
      files: ["dist"],
      // the condition is what marks a library: the consumer's build processes the package instead of loading it in Node, which does not know .mprx or .css (decision K11)
      exports: { ".": { types: "./dist/index.d.ts", [CONDITION]: "./dist/index.js" } },
      sideEffects: ["**/*.css"],
      valance: { kind: "components", targets: ["web", "desktop"] },
      scripts: { build: "vlx library build", check: "vlx library check" },
      peerDependencies: { "@valancex/common": range, effect: ">=3.10.0 <4" },
      devDependencies: { "@types/node": "^22.0.0", "@valancex/cli": cliSpec(manager, answers.cli), "@valancex/common": commonSpec(manager), effect, typescript: "^5.6.0" },
    }),
  );
  out.set(
    `${lib}/tsconfig.json`,
    json({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2022", "DOM"],
        types: ["node"],
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        skipLibCheck: true,
        declaration: true,
        rootDir: "src",
        outDir: "dist",
      },
      include: ["src"],
    }),
  );
  out.set(`${lib}/src/mprx.d.ts`, MPRX_D_TS);
  out.set(
    `${lib}/src/index.ts`,
    `// What the library exports: its components, and the list of them an application can pass to \`components\`. Removing an export, a component, a prop or an event is a breaking change (decision K8).
export { greeting } from "./greeting.js";
import { greeting } from "./greeting.js";

export const components = [greeting];
`,
  );
  out.set(
    `${lib}/src/greeting.mprx`,
    `<column>
  <heading>{title}</heading>
  <text>{message}</text>
  <button on.click={dismiss()}>Dismiss</button>
</column>
`,
  );
  out.set(
    `${lib}/src/greeting.ts`,
    `import { component } from "@valancex/common";
import { Schema } from "effect";
import template from "./greeting.mprx";

// The interface of \`<greeting>\`, stated once, where it is defined. It is built from the portable core (\`column\`, \`heading\`, \`text\`, \`button\`), so it runs on every target the package declares.
export const greeting = component(template, {
  props: { title: Schema.String, message: Schema.String },
  events: { dismiss: Schema.Void },
});
`,
  );
  out.set(
    `${lib}/README.md`,
    `# ${answers.name}

A VALANCE component library. Its templates ship as source and the application's build compiles them; the package says so with the \`valance\` export condition, and says what it supports in its \`valance\` field.

\`\`\`
${runCommand(manager)} build:library   # vlx library build: JavaScript, declarations, templates and stylesheets into dist/
${runCommand(manager)} check:library   # vlx library check: the package, and the playground that uses every component
${runCommand(manager)} playground      # the playground application, served
\`\`\`

The playground (\`../../playground\`) is an application that depends on this package the way a consumer does; it is how each target the package declares is checked.
`,
  );

  out.set(
    "playground/package.json",
    json({
      name: `${slug}-playground`,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: { dev: "vlx dev", build: "vlx build", check: "vlx check", prepare: "vlx sync" },
      dependencies: { "@valancex/common": commonSpec(manager), effect, [answers.name]: link },
      devDependencies: { "@types/node": "^22.0.0", "@valancex/cli": cliSpec(manager, answers.cli), typescript: "^5.6.0" },
    }),
  );
  out.set("playground/valance.json", json({ $schema: "./node_modules/@valancex/cli/schemas/valance.schema.json", version: 1, name: `${slug} playground` }));
  out.set("playground/valance.web.json", json({ $schema: "./node_modules/@valancex/cli/schemas/valance.web.schema.json", version: 1 }));
  out.set("playground/valance.desktop.json", json({ $schema: "./node_modules/@valancex/cli/schemas/valance.desktop.schema.json", version: 1 }));
  out.set(
    "playground/tsconfig.json",
    json({
      compilerOptions: {
        types: ["node"],
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022", "DOM"],
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        skipLibCheck: true,
        isolatedModules: true,
        noEmit: true,
        allowArbitraryExtensions: true,
        rootDirs: ["src", ".valance/types"],
      },
      include: ["src", ".valance/types/*.d.ts"],
    }),
  );
  out.set("playground/.gitignore", "node_modules\ndist\n.valance\n");
  out.set("playground/content/index.md", `---\ntitle: ${answers.name} playground\n---\n\n# ${answers.name}\n\nEvery component of the library, on every target it declares.\n`);
  out.set(
    "playground/src/main.ts",
    `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import { components } from ${q}${answers.name}${q};
import layout from "./layout.mprx";
import desktopLayout from "./desktop/layout.mprx";

// The playground uses the library the way an application does: it lists its components, and a template writes their tags. Each target the library declares has a layout here, so \`vlx library check\`
// holds every component to every target it says it supports.
export default defineApp({
  targets: { desktop: { layout: component(desktopLayout) } },
  layout: component(layout),
  components,
  state: { dismissed: field(Schema.Boolean, false) },
  commands: (command) => ({ dismiss: command((state) => ({ ...state, dismissed: true })) }),
});
`,
  );
  const layout = `<column>
  {#if dismissed}
    <text>Dismissed</text>
  {:else}
    <greeting title="Hello" message="This is the playground." on.dismiss={dismiss()} />
  {/if}
</column>
`;

  out.set("playground/src/layout.mprx", layout);
  out.set("playground/src/desktop/layout.mprx", layout);

  return out;
};

/** Writes the workspace. Throws if the directory has something in it. Returns the files written. */
export const scaffoldLibrary = (answers: LibraryAnswers): ReadonlyArray<string> => {
  if (existsSync(answers.dir) && readdirSync(answers.dir).filter((each) => each !== ".git").length > 0) {
    throw new Error(`${answers.dir} is not empty`);
  }

  const made = planLibrary(answers);

  for (const [name, text] of made) {
    const path = join(answers.dir, ...name.split("/"));

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }

  return [...made.keys()].sort();
};

// ---- vlx library check -----------------------------------------------------------------------------------------------------------------------------------------

interface Package {
  readonly name?: string;
  readonly exports?: unknown;
  readonly sideEffects?: unknown;
  readonly valance?: { readonly kind?: string; readonly styles?: ReadonlyArray<string>; readonly targets?: ReadonlyArray<string>; readonly theme?: string };
  readonly peerDependencies?: Readonly<Record<string, string>>;
}

const FILE = "package.json";

/** The files under `dir` with `extension`, relative and sorted. */
const under = (dir: string, extension: string): ReadonlyArray<string> =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: "utf8" })
        .map((each) => each.split(sep).join("/"))
        .filter((each) => each.endsWith(extension) && !each.split("/").includes("node_modules"))
        .sort()
    : [];

/**
 * The rules a consumer's build relies on, held at the library where its author can act (K7, K8, K11, K13): the marker, the entry that exists, a peer on `@valancex/common`, no entry Node would load
 * unmarked, stylesheets that exist and a `sideEffects` that keeps them, and the playground: an application that depends on this package, builds every target the package declares, and uses every
 * template the package ships (so no template is shipped that no target has checked).
 */
export const checkLibrary = async (dir: string, options: { readonly app?: string } = {}): Promise<ReadonlyArray<Diagnostic>> => {
  const problems: Array<Diagnostic> = [];
  const problem = (code: string, message: string): void => void problems.push(diagnostic(FILE, 0, code, message));
  let manifest: Package;

  try {
    manifest = JSON.parse(readFileSync(join(dir, FILE), "utf8")) as Package;
  } catch {
    return [diagnostic(FILE, 0, "library-package", `there is no ${FILE} in ${dir}: run \`vlx library check\` in the library's package directory`)];
  }

  if (!hasCondition(manifest.exports)) {
    problem(
      "library-unmarked",
      `${FILE} has no "valance" export condition: add ${JSON.stringify({ exports: { ".": { types: "./dist/index.d.ts", valance: "./dist/index.js" } } })}; the condition is what marks a library`,
    );

    return problems;
  }

  const entry = (manifest.exports as Record<string, Record<string, unknown>> | undefined)?.["."];
  const marked = typeof entry?.[CONDITION] === "string" ? (entry[CONDITION] as string) : undefined;

  if (marked === undefined) {
    problem("library-entry", `exports["."] needs a "valance" condition that is the file: "valance": "./dist/index.js"`);
  } else if (!existsSync(resolve(dir, marked))) {
    problem("library-entry", `exports["."].valance is ${marked}, which does not exist: run \`vlx library build\``);
  }

  // Node would load whatever else the entry offers; that is the .mprx failure the condition exists to prevent.
  for (const key of ["default", "import", "require", "node"]) {
    const other = entry?.[key];

    if (other !== undefined && other !== marked) {
      problem(
        "library-default",
        `exports["."].${key} is ${JSON.stringify(other)}: a tool that does not know the "valance" condition would load it and meet a template. Remove it, or make it the same file as "valance"`,
      );
    }
  }

  const isTheme = manifest.valance?.kind === "theme";

  if (!isTheme && manifest.peerDependencies?.["@valancex/common"] === undefined) {
    problem(
      "library-peer",
      `${FILE} should declare @valancex/common as a peer dependency (one copy of the framework in an application; removing it from the peers is breaking, K8)`,
    );
  }

  const styles = manifest.valance?.styles ?? [];

  if (styles.length > 0) {
    const sideEffects = manifest.sideEffects;
    const keepsCss = Array.isArray(sideEffects) && sideEffects.some((each) => typeof each === "string" && each.includes(".css"));

    if (sideEffects === true || sideEffects === undefined || keepsCss) {
      // (true and absent keep every file; a list must name the stylesheets)
    } else {
      problem("library-side-effects", `"sideEffects" in ${FILE} drops stylesheets from a bundle: use ["**/*.css"] (K6)`);
    }
  }

  // A theme is data: it is checked as a project's theme is (tokens, recipes, the contrast of the pairs it declares), and needs no playground.
  if (isTheme) {
    const file = manifest.valance?.theme === undefined ? undefined : resolve(dir, manifest.valance.theme);

    if (file === undefined || !existsSync(file)) {
      problem("library-field", `"valance.theme" in ${FILE} must name the package's theme.json`);
    } else {
      problems.push(...themeFileProblems(file, dir));
    }

    return problems;
  }

  // the playground
  const app = options.app ?? ["../../playground", "playground", "../playground"].map((each) => resolve(dir, each)).find((each) => existsSync(join(each, FILE)));

  if (app === undefined) {
    problem(
      "library-playground",
      "no playground application was found (../../playground, ./playground or ../playground; or --app <dir>): an application that depends on this package and uses each of its components is how each target it declares is checked",
    );

    return problems;
  }

  const label = relative(dir, app).split(sep).join("/");
  const config = await (async () => {
    try {
      return loadConfig(app);
    } catch (error) {
      problem("library-playground", `${label}: ${error instanceof Error ? error.message : String(error)}`);

      return undefined;
    }
  })();

  if (config === undefined) {
    return problems;
  }

  const declared = manifest.valance?.targets ?? ["web", "desktop"];

  for (const target of declared) {
    if (!config.targets.includes(target as never)) {
      problem(
        "library-playground-target",
        `the package declares ${target}, but the playground (${label}) does not build for it: add valance.${target}.json there, so that target is checked`,
      );
    }
  }

  if (installedAt(app, manifest.name ?? "") === undefined) {
    problem("library-playground", `the playground (${label}) has no ${manifest.name} installed: install the workspace, and run \`vlx library build\` first`);

    return problems;
  }

  const result = await check(app);

  // the playground's warnings are about the playground's own templates, not the library
  for (const each of result.diagnostics.filter(isProblem)) {
    problems.push({ ...each, file: `${label}/${each.file}` });
  }

  // every template the package ships is used by the playground: a target it declares has then checked it
  const shipped = under(resolve(dir, dirname(marked ?? "dist/index.js")), ".mprx").map((each) => basename(each, ".mprx"));
  const checked = new Set(result.components);

  for (const name of shipped) {
    if (!checked.has(name)) {
      problems.push(
        diagnostic(
          `${label}/src/layout.mprx`,
          0,
          "library-unused",
          `the package ships <${name}>, but the playground's templates never write it, so no target has checked it: use it there`,
        ),
      );
    }
  }

  return problems;
};

// ---- vlx library build -----------------------------------------------------------------------------------------------------------------------------------------

export interface BuiltLibrary {
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  /** The files copied beside the compiled JavaScript: templates and stylesheets, relative to `dist/`. */
  readonly copied: ReadonlyArray<string>;
}

/** The TypeScript compiler of the library's own installation. */
const tscOf = (dir: string): string | undefined => {
  const installed = installedAt(dir, "typescript");

  return installed === undefined ? undefined : join(installed, "bin", "tsc");
};

/**
 * Writes `dist/`: the TypeScript compiled to JavaScript with declarations (the contracts of the components are the types `component()` gives them), and every `.mprx` and `.css` under `src/` copied beside
 * it, because templates ship as source and the consumer's build compiles them (K3). It does not check the package; `vlx library check` does.
 */
export const buildLibrary = (dir: string): BuiltLibrary => {
  const src = join(dir, "src");

  if (!existsSync(src)) {
    return { diagnostics: [diagnostic("src", 0, "library-source", `there is no src/ in ${dir}: run \`vlx library build\` in the library's package directory`)], copied: [] };
  }

  const tsc = tscOf(dir);

  if (tsc === undefined) {
    return { diagnostics: [diagnostic(FILE, 0, "library-build", "typescript is not installed here: add it to the library's devDependencies and install")], copied: [] };
  }

  // dist/ is made by this build alone: a file left from a component that was renamed or removed would be shipped (and its template checked as if it were a component)
  rmSync(join(dir, "dist"), { recursive: true, force: true });

  const ran = spawnSync(process.execPath, [tsc, "-p", join(dir, "tsconfig.json")], { cwd: dir, encoding: "utf8" });

  if (ran.status !== 0) {
    const lines = `${ran.stdout}${ran.stderr}`.split("\n").filter((each) => each.trim() !== "");

    return { diagnostics: lines.map((line) => diagnostic("tsconfig.json", 0, "library-build", line)), copied: [] };
  }

  const dist = join(dir, "dist");
  const copied: Array<string> = [];

  for (const file of [...under(src, ".mprx"), ...under(src, ".css")]) {
    mkdirSync(dirname(join(dist, file)), { recursive: true });
    copyFileSync(join(src, file), join(dist, file));
    copied.push(file);
  }

  return { diagnostics: [], copied };
};
