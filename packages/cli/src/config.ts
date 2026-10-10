// Project configuration. `valance.json` is the project's (what it is called); `valance.web.json` is the web target's (where it is served). Nothing else is configurable, on purpose: a setting
// is added when something needs it. Unknown keys are errors with the line, because a misspelt key that is ignored is a setting the author thinks they have. The JSON Schemas in
// `schemas/` describe the same files for editors; this is the check the tools make.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Diagnostic } from "./diagnostics.js";
import { AppError, diagnostic, lineOf } from "./diagnostics.js";
import type { SiteInfo } from "./model.js";

export const PROJECT_FILE = "valance.json";
export const WEB_FILE = "valance.web.json";
/** The only version of both files there is. */
export const CONFIG_VERSION = 1;

export interface Config {
  readonly name: string;
  readonly web: { readonly base: string; readonly url: string };
}

const read = (root: string, file: string): { readonly text: string; readonly value: unknown } | undefined => {
  const path = join(root, file);

  if (!existsSync(path)) { return undefined; }

  const text = readFileSync(path, "utf8");

  try {
    return { text, value: JSON.parse(text) };
  } catch (error) {
    throw new AppError([diagnostic(file, 1, "config-syntax", `not valid JSON: ${error instanceof Error ? error.message : String(error)}`)]);
  }
};

const check = (file: string, text: string, value: unknown, keys: Readonly<Record<string, (value: unknown) => string | undefined>>, required: ReadonlyArray<string>): ReadonlyArray<Diagnostic> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) { return [diagnostic(file, 1, "config-shape", "must be a JSON object")]; }

  const found: Array<Diagnostic> = [];
  const record = value as Record<string, unknown>;

  for (const key of required) {
    if (!(key in record)) { found.push(diagnostic(file, 1, "config-missing", `"${key}" is required`)); }
  }

  for (const [key, given] of Object.entries(record)) {
    const rule = keys[key];

    if (rule === undefined) {
      found.push(diagnostic(file, lineOf(text, `"${key}"`), "config-unknown", `unknown setting "${key}" (known: ${Object.keys(keys).join(", ")})`));
      continue;
    }

    const problem = rule(given);

    if (problem !== undefined) { found.push(diagnostic(file, lineOf(text, `"${key}"`), "config-value", `"${key}" ${problem}`)); }
  }

  return found;
};

const text = (value: unknown): string | undefined => typeof value === "string" && value.trim() !== "" ? undefined : "must be a non-empty string";
const version = (value: unknown): string | undefined => value === CONFIG_VERSION ? undefined : `must be ${CONFIG_VERSION} (the only version there is)`;
const schema = (value: unknown): string | undefined => typeof value === "string" ? undefined : "must be a string";
const base = (value: unknown): string | undefined => typeof value === "string" && /^\/([\w.~-]+\/)*$/.test(value) ? undefined : 'must start and end with "/" (for example "/" or "/docs/")';
const url = (value: unknown): string | undefined => {
  if (typeof value !== "string") { return "must be a string"; }

  try { return new URL(value).protocol.startsWith("http") && !value.endsWith("/") ? undefined : 'must be an http(s) address without a trailing "/"'; } catch { return "must be an absolute address such as https://example.com"; }
};

/** Reads and validates the project's configuration. Every problem in both files is reported together. */
export const loadConfig = (root: string): Config => {
  const project = read(root, PROJECT_FILE);

  if (project === undefined) { throw new AppError([diagnostic(PROJECT_FILE, 0, "config-missing", `there is no ${PROJECT_FILE} in ${root}`)]); }

  const web = read(root, WEB_FILE);
  const problems = [
    ...check(PROJECT_FILE, project.text, project.value, { $schema: schema, version, name: text }, ["name"]),
    ...(web === undefined ? [] : check(WEB_FILE, web.text, web.value, { $schema: schema, version, base, url }, [])),
  ];

  if (problems.length > 0) { throw new AppError(problems); }

  const given = (web?.value ?? {}) as { readonly base?: string; readonly url?: string };

  return { name: (project.value as { readonly name: string }).name, web: { base: given.base ?? "/", url: given.url ?? "" } };
};

export const siteInfo = (config: Config): SiteInfo => ({ name: config.name, base: config.web.base, url: config.web.url });

/** The nearest directory at or above `from` that holds a `valance.json`. */
export const findRoot = (from: string): string => {
  let at = from;

  for (;;) {
    if (existsSync(join(at, PROJECT_FILE))) { return at; }

    const parent = dirname(at);

    if (parent === at) {
      throw new AppError([diagnostic(PROJECT_FILE, 0, "no-project", `no ${PROJECT_FILE} in ${from} or any directory above it. Run this from your project, or create one with {"name": "…"}`)]);
    }

    at = parent;
  }
};
