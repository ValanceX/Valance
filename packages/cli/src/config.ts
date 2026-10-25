// Project configuration. `valance.json` is the project's (what it is called); `valance.web.json` is the web target's (where it is served). Nothing else is configurable, on purpose: a setting
// is added when something needs it. Unknown keys are errors with the line, because a misspelt key that is ignored is a setting the author thinks they have. The JSON Schemas in
// `schemas/` describe the same files for editors; this is the check the tools make.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Budget } from "./size.js";
import { budgetProblems } from "./size.js";
import type { Diagnostic } from "./diagnostics.js";
import { AppError, diagnostic, lineOf } from "./diagnostics.js";
import { DEFAULT_TITLE } from "@valancex/common/internal";
import type { SiteInfo } from "@valancex/common/internal";

export const PROJECT_FILE = "valance.json";
export const WEB_FILE = "valance.web.json";
export const DESKTOP_FILE = "valance.desktop.json";
/** The only version of both files there is. */
export const CONFIG_VERSION = 1;

export interface Config {
  readonly name: string;
  /** The targets the project is built for: each one whose settings file it has (`valance.web.json`, `valance.desktop.json`), else the web alone. One application, one build per target. */
  readonly targets: ReadonlyArray<"web" | "desktop">;
  /** How the document's title is written from a page's title and the site's name: `{page}` and `{site}`. */
  readonly title: string;
  readonly web: {
    readonly base: string;
    readonly url: string;
    /** Write the security headers file beside the built site. */
    readonly headers: boolean;
    /** Announce a page change made in place to assistive technology. */
    readonly announce: boolean;
  };
  /** The application's backend: the address its requests are made to (a path on the site's own origin, or an absolute https address), and, for `vlx dev`, where a path is proxied to. */
  readonly api: { readonly base: string; readonly proxy: string };
  /** The size budgets a production build is held to (Tier 2): the project's own, or none, in which case the framework's start-up budgets apply (W14). Never checked by `vlx dev`. */
  readonly budgets: ReadonlyArray<Budget> | undefined;
  /** What `vlx dev --record` leaves out of a session log (Tier 2; R9, R14): nothing, unless the project says. */
  readonly record: { readonly redact: { readonly scope: ReadonlyArray<ReadonlyArray<string>>; readonly commands: ReadonlyArray<string> } };
}

const read = (root: string, file: string): { readonly text: string; readonly value: unknown } | undefined => {
  const path = join(root, file);

  if (!existsSync(path)) {
    return undefined;
  }

  const text = readFileSync(path, "utf8");

  try {
    return { text, value: JSON.parse(text) };
  } catch (error) {
    throw new AppError([diagnostic(file, 1, "config-syntax", `not valid JSON: ${error instanceof Error ? error.message : String(error)}`)]);
  }
};

const check = (
  file: string,
  text: string,
  value: unknown,
  keys: Readonly<Record<string, (value: unknown) => string | undefined>>,
  required: ReadonlyArray<string>,
): ReadonlyArray<Diagnostic> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [diagnostic(file, 1, "config-shape", "must be a JSON object")];
  }

  const found: Array<Diagnostic> = [];
  const record = value as Record<string, unknown>;

  for (const key of required) {
    if (!(key in record)) {
      found.push(diagnostic(file, 1, "config-missing", `"${key}" is required`));
    }
  }

  for (const [key, given] of Object.entries(record)) {
    const rule = keys[key];

    if (rule === undefined) {
      found.push(diagnostic(file, lineOf(text, `"${key}"`), "config-unknown", `unknown setting "${key}" (known: ${Object.keys(keys).join(", ")})`));
      continue;
    }

    const problem = rule(given);

    if (problem !== undefined) {
      found.push(diagnostic(file, lineOf(text, `"${key}"`), "config-value", `"${key}" ${problem}`));
    }
  }

  return found;
};

const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? undefined : "must be a non-empty string");
const version = (value: unknown): string | undefined => (value === CONFIG_VERSION ? undefined : `must be ${CONFIG_VERSION} (the only version there is)`);
const schema = (value: unknown): string | undefined => (typeof value === "string" ? undefined : "must be a string");
const base = (value: unknown): string | undefined =>
  typeof value === "string" && /^\/([\w.~-]+\/)*$/.test(value) ? undefined : 'must start and end with "/" (for example "/" or "/docs/")';
const url = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return "must be a string";
  }

  try {
    return new URL(value).protocol.startsWith("http") && !value.endsWith("/") ? undefined : 'must be an http(s) address without a trailing "/"';
  } catch {
    return "must be an absolute address such as https://example.com";
  }
};

const title = (value: unknown): string | undefined =>
  typeof value === "string" && value.includes("{page}") && value.length <= 120 && !/[{}]/.test(value.replaceAll("{page}", "").replaceAll("{site}", ""))
    ? undefined
    : 'must contain "{page}" and may use "{site}", for example "{page} · {site}" (at most 120 characters)';
const flag = (value: unknown): string | undefined => (typeof value === "boolean" ? undefined : "must be true or false");
const api = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return 'must be an object such as { "base": "/api" }';
  }

  const given = value as Record<string, unknown>;
  const unknown = Object.keys(given).filter((key) => key !== "base" && key !== "proxy");

  if (unknown.length > 0) {
    return `has unknown settings ${unknown.map((key) => `"${key}"`).join(", ")} (known: base, proxy)`;
  }
  if (typeof given["base"] !== "string" || !/^(\/([\w.~-]+\/?)*|https:\/\/[^\s/]+(\/[^\s]*)?)$/.test(given["base"]) || given["base"].endsWith("//")) {
    return '"base" must be a path on the site ("/api") or an absolute https address ("https://api.example.com")';
  }
  if (given["proxy"] !== undefined) {
    try {
      const target = new URL(String(given["proxy"]));

      if (!target.protocol.startsWith("http") || !given["base"].startsWith("/")) {
        return '"proxy" is an http(s) address that a path "base" is forwarded to while you run vlx dev';
      }
    } catch {
      return '"proxy" must be an absolute address such as http://localhost:3000';
    }
  }

  return undefined;
};

const record = (value: unknown): string | undefined => {
  const redact = (value as { readonly redact?: unknown } | null)?.redact;

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => key !== "redact") ||
    typeof redact !== "object" ||
    redact === null ||
    Array.isArray(redact)
  ) {
    return 'must be an object such as { "redact": { "scope": [["password"]], "commands": ["login/type"] } }';
  }

  const { scope, commands, ...others } = redact as { scope?: unknown; commands?: unknown };

  if (Object.keys(others).length > 0) {
    return `"redact" has unknown settings ${Object.keys(others)
      .map((key) => `"${key}"`)
      .join(", ")} (known: scope, commands)`;
  }

  if (
    scope !== undefined &&
    (!Array.isArray(scope) || scope.some((path) => !Array.isArray(path) || path.length === 0 || path.some((step) => typeof step !== "string" || step === "")))
  ) {
    return '"redact.scope" must be a list of paths, each a non-empty list of field names ("*" is any list index or field): [["password"], ["people", "*", "pin"]]';
  }

  if (commands !== undefined && (!Array.isArray(commands) || commands.some((name) => typeof name !== "string" || !/^[\w-]+\/[\w-]+$/.test(name)))) {
    return '"redact.commands" must be a list of "component/name" commands whose parameters are not recorded: ["login/type"]';
  }

  return undefined;
};

/** Reads and validates the project's configuration. Every problem in both files is reported together. */
export const loadConfig = (root: string): Config => {
  const project = read(root, PROJECT_FILE);

  if (project === undefined) {
    throw new AppError([diagnostic(PROJECT_FILE, 0, "config-missing", `there is no ${PROJECT_FILE} in ${root}`)]);
  }

  const web = read(root, WEB_FILE);
  const desktop = read(root, DESKTOP_FILE);
  const problems = [
    ...(desktop === undefined ? [] : check(DESKTOP_FILE, desktop.text, desktop.value, { $schema: schema, version }, [])),
    ...check(PROJECT_FILE, project.text, project.value, { $schema: schema, version, name: text, title, record, budgets: budgetProblems }, ["name"]),
    ...(web === undefined ? [] : check(WEB_FILE, web.text, web.value, { $schema: schema, version, base, url, headers: flag, announce: flag, api }, [])),
  ];

  if (problems.length > 0) {
    throw new AppError(problems);
  }

  const given = (web?.value ?? {}) as {
    readonly base?: string;
    readonly url?: string;
    readonly headers?: boolean;
    readonly announce?: boolean;
    readonly api?: { readonly base: string; readonly proxy?: string };
  };
  const named = project.value as {
    readonly name: string;
    readonly title?: string;
    readonly record?: { readonly redact: { readonly scope?: string[][]; readonly commands?: string[] } };
    readonly budgets?: ReadonlyArray<Budget>;
  };

  return {
    name: named.name,
    targets: desktop === undefined ? ["web"] : web === undefined ? ["desktop"] : ["web", "desktop"],
    title: named.title ?? DEFAULT_TITLE,
    web: { base: given.base ?? "/", url: given.url ?? "", headers: given.headers ?? true, announce: given.announce ?? true },
    api: { base: given.api?.base ?? "", proxy: given.api?.proxy ?? "" },
    budgets: named.budgets,
    record: { redact: { scope: named.record?.redact.scope ?? [], commands: named.record?.redact.commands ?? [] } },
  };
};

export const siteInfo = (config: Config): SiteInfo => ({
  name: config.name,
  base: config.web.base,
  url: config.web.url,
  title: config.title,
  api: config.api.base,
  announce: config.web.announce,
});

/**
 * The nearest directory at or above `from` that holds a `valance.json`, as its real path. The bundler names a file by its real path, so a project reached through a symlink, or by a short
 * Windows name (`RUNNER~1`), must be called the same thing here or a file is not the file the bundler means.
 */
export const findRoot = (from: string): string => {
  let at = from;

  for (;;) {
    if (existsSync(join(at, PROJECT_FILE))) {
      return realpathSync.native(at);
    }

    const parent = dirname(at);

    if (parent === at) {
      throw new AppError([
        diagnostic(PROJECT_FILE, 0, "no-project", `no ${PROJECT_FILE} in ${from} or any directory above it. Run this from your project, or create one with {"name": "…"}`),
      ]);
    }

    at = parent;
  }
};
