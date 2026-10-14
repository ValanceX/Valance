// `vlx init`: a new application on disk. This file is the work (names, what the questions mean, the files written, the install); the interface that asks the questions is `ui/init.tsx`, and
// answers can equally come from flags, so everything here takes plain answers and nothing here prints.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PROJECT_FILE, WEB_FILE } from "./config.js";
import type { TargetId } from "./targets.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export const PACKAGE_MANAGERS: ReadonlyArray<PackageManager> = ["npm", "pnpm", "yarn", "bun"];

export interface Answers {
  /** The application's name, as people read it (the site's title). */
  readonly name: string;
  /** Where it is written: absolute. */
  readonly dir: string;
  readonly targets: ReadonlyArray<TargetId>;
  /** The web target's settings; an empty `base` or `url` is the default. */
  readonly web: { readonly base: string; readonly url: string };
  readonly packageManager: PackageManager;
  readonly install: boolean;
  readonly git: boolean;
  /** What `@valancex/cli` is in the new project's package.json; `undefined` is "this package, as it is installed". */
  readonly cli?: string;
}

const PACKAGE = new URL("../", import.meta.url);
const TEMPLATES = new URL("../templates/", import.meta.url);

const own = (): { readonly version: string; readonly private?: boolean; readonly dependencies: Readonly<Record<string, string>> } =>
  JSON.parse(readFileSync(new URL("package.json", PACKAGE), "utf8")) as ReturnType<typeof own>;

/** The package name an application gets: lowercase, URL-safe. */
export const packageName = (name: string): string => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "");

  return slug === "" ? "app" : slug;
};

/** A reason the name cannot be used, or `undefined`. The directory is checked separately (it may be a path). */
export const nameProblem = (name: string): string | undefined => {
  if (name.trim() === "") {
    return "the application needs a name";
  }
  // oxlint-disable-next-line no-control-regex -- control characters are exactly what is refused
  if (/[\u0000-\u001f"\\]/.test(name)) {
    return "the name cannot contain quotes, backslashes or control characters";
  }

  return undefined;
};

/** The directory a name is made in: the name itself, written as a path, resolved from `cwd`. `my-app`, `./my-app` and `../x/my-app` are the directory; `My App` becomes `my-app`. */
export const directoryFor = (name: string, cwd: string): string => {
  const trimmed = name.trim();

  return /[\\/]/.test(trimmed) || trimmed.startsWith(".") ? resolve(cwd, trimmed) : resolve(cwd, packageName(trimmed));
};

/** The title a name gives the site: a path's last part, as written. */
export const titleOf = (name: string): string => basename(name.trim().replace(/[\\/]+$/, "")) || name.trim();

/** What is in the way of writing into `dir`: nothing (it is absent or empty), or a sentence. */
export const directoryProblem = (dir: string): string | undefined => {
  if (!existsSync(dir)) {
    return undefined;
  }

  const entries = readdirSync(dir).filter((each) => each !== ".git");

  return entries.length === 0 ? undefined : `${dir} is not empty`;
};

/** Which package manager started this: from the user agent npm, pnpm, yarn and bun set for what they run (`npm create`, `pnpm dlx`); `npm` otherwise. */
export const detectPackageManager = (env: NodeJS.ProcessEnv = process.env): PackageManager => {
  const name = (env["npm_config_user_agent"] ?? "").split("/")[0];

  return PACKAGE_MANAGERS.find((each) => each === name) ?? "npm";
};

export const runCommand = (manager: PackageManager): string => (manager === "npm" ? "npm run" : manager === "bun" ? "bun run" : manager);

const inCheckout = (): boolean => (own().dependencies["@valancex/common"] ?? "").startsWith("workspace:");

/** What `@valancex/cli` is in the new package.json. A published package is a range; run from a checkout of the repository, the package this command came from, by path (the only place it can be installed from). */
export const cliSpec = (manager: PackageManager, given?: string): string => {
  if (given !== undefined) {
    return given;
  }

  const manifest = own();

  // Installed from the registry, a dependency on a sibling is a range; in a checkout of the repository it is still `workspace:`, and the package can only be installed from where it is.
  if (!inCheckout()) {
    return `^${manifest.version}`;
  }

  const path = fileURLToPath(PACKAGE).replace(/[\\/]$/, "");

  return `${manager === "pnpm" ? "link" : "file"}:${path}`;
};

/**
 * What `@valancex/common` is in the new package.json: the range this package depends on once published; inside the workspace (where that is `workspace:*`) the sibling package, by path, like
 * `cliSpec`.
 */
export const commonSpec = (manager: PackageManager): string => {
  if (!inCheckout()) {
    return own().dependencies["@valancex/common"] ?? "*";
  }

  return `${manager === "pnpm" ? "link" : "file"}:${fileURLToPath(new URL("../common/", PACKAGE)).replace(/[\\/]$/, "")}`;
};

const mesh = (): string => own().dependencies["@valancex/mesh-compiler"] ?? "^0.11.0";

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const files = (dir: URL, prefix = ""): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`],
  );

/** The name a template file has once written: npm drops `.gitignore` from a package, so it ships as `gitignore`. */
const written = (name: string): string => (name === "gitignore" ? ".gitignore" : name);

export interface Plan {
  /** Relative path (`/` separated) → text. */
  readonly files: ReadonlyMap<string, string>;
}

/** Every file the answers make, without writing any. */
export const plan = (answers: Answers): Plan => {
  const out = new Map<string, string>();
  const title = titleOf(answers.name);
  const web = answers.targets.includes("web");
  const hasBase = answers.web.base !== "" && answers.web.base !== "/";
  const settings = [hasBase ? `base ${answers.web.base}` : "", answers.web.url !== "" ? `url ${answers.web.url}` : ""].filter((each) => each !== "");
  const tokens: Readonly<Record<string, string>> = {
    name: title,
    run: runCommand(answers.packageManager),
    web_note: web && settings.length > 0 ? `, and \`${WEB_FILE}\` says where the web site is served (${settings.join(", ")})` : "",
  };
  const fill = (text: string): string => text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => tokens[key] ?? match);

  if (web) {
    const root = new URL("web/", TEMPLATES);

    for (const file of files(root)) {
      out.set(written(file), fill(readFileSync(new URL(file, root), "utf8")));
    }
  }

  out.set(PROJECT_FILE, json({ $schema: "./node_modules/@valancex/cli/schemas/valance.schema.json", version: 1, name: title }));

  if (web && (hasBase || answers.web.url !== "")) {
    out.set(
      WEB_FILE,
      json({
        $schema: "./node_modules/@valancex/cli/schemas/valance.web.schema.json",
        version: 1,
        ...(hasBase ? { base: answers.web.base } : {}),
        ...(answers.web.url !== "" ? { url: answers.web.url } : {}),
      }),
    );
  }

  out.set(
    "package.json",
    json({
      name: packageName(basename(answers.dir)),
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: { dev: "vlx dev", build: "vlx build", check: "vlx check", typecheck: "vlx sync && tsc --noEmit", prepare: "vlx sync" },
      dependencies: { "@valancex/common": commonSpec(answers.packageManager), effect: own().dependencies["effect"] ?? "^3.10.0" },
      devDependencies: { "@types/node": "^22.0.0", "@valancex/cli": cliSpec(answers.packageManager, answers.cli), "@valancex/mesh-lsp": mesh(), typescript: "^5.6.0" },
    }),
  );

  return { files: out };
};

/** Writes the application. Throws if the directory has something in it. Returns the files written, relative and sorted. */
export const scaffold = (answers: Answers): ReadonlyArray<string> => {
  const problem = directoryProblem(answers.dir);

  if (problem !== undefined) {
    throw new Error(problem);
  }

  const { files: made } = plan(answers);

  for (const [name, text] of made) {
    const path = join(answers.dir, ...name.split("/"));

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }

  return [...made.keys()].sort();
};

export interface Ran {
  readonly ok: boolean;
  /** What the command printed to stderr, the last lines of it: why it failed. */
  readonly output: string;
}

/** Runs `command args` in `cwd`, quietly. A `.cmd` shim on Windows needs a shell; nothing here takes user text as an argument. */
export const run = (command: string, args: ReadonlyArray<string>, cwd: string): Promise<Ran> =>
  new Promise((done) => {
    const child = spawn(command, [...args], { cwd, stdio: ["ignore", "ignore", "pipe"], shell: process.platform === "win32" });
    let output = "";

    child.stderr.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000);
    });
    child.on("error", (error) => {
      done({ ok: false, output: error.message });
    });
    child.on("close", (code) => {
      done({ ok: code === 0, output: output.trim().split("\n").slice(-6).join("\n") });
    });
  });

export const install = (answers: Pick<Answers, "dir" | "packageManager">): Promise<Ran> => run(answers.packageManager, ["install"], answers.dir);

/** `git init` and a first commit's worth of staging is not ours to do: the repository is made, the author commits. */
export const initGit = (dir: string): Promise<Ran> => run("git", ["init", "--quiet"], dir);

export type Step = "files" | "install" | "git";

export type Progress = "start" | "done" | "skipped" | "failed";

export interface Outcome {
  readonly files: ReadonlyArray<string>;
  readonly installed: boolean;
  readonly git: boolean;
  /** Why an install or `git init` did not happen, for the person to read. */
  readonly notes: ReadonlyArray<string>;
}

/** Does everything the answers say, in order, and says how each step goes. Only writing the files can throw; an install or `git init` that fails is a note, not the end of the application. */
export const execute = async (answers: Answers, report: (step: Step, progress: Progress, detail?: string) => void = () => undefined): Promise<Outcome> => {
  const notes: Array<string> = [];

  report("files", "start");

  const made = scaffold(answers);

  report("files", "done", `${made.length} files`);

  let installed = false;
  let git = false;

  if (answers.install) {
    report("install", "start");

    const ran = await install(answers);

    installed = ran.ok;
    report("install", ran.ok ? "done" : "failed", ran.ok ? undefined : ran.output);

    if (!ran.ok) {
      notes.push(`the dependencies were not installed (${answers.packageManager} install failed); run it yourself in the new directory`);
    }
  } else {
    report("install", "skipped");
  }

  if (answers.git) {
    report("git", "start");

    const ran = await initGit(answers.dir);

    git = ran.ok;
    report("git", ran.ok ? "done" : "failed", ran.ok ? undefined : ran.output);

    if (!ran.ok) {
      notes.push("no git repository was made (git init failed)");
    }
  } else {
    report("git", "skipped");
  }

  return { files: made, installed, git, notes };
};
