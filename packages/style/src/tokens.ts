// Design Tokens Community Group documents (format 2025.10): validated against the group's own JSON Schemas (vendored unchanged in schema/dtcg-2025.10/, see its NOTICE.md), then the graph pass
// the schemas cannot make. A schema checks one document's shape; it cannot follow an alias to its target, so a cycle, a reference to nothing, a `$extends` of a group that is not there, and an alias
// whose target has another type are found here.
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { root } from "./load.js";
import type { Problem, ResolvedToken, TokenType } from "./types.js";

const BASE = "https://www.designtokens.org/schemas/2025.10/";
const directory = join(root, "schema", "dtcg-2025.10");

let validator: ValidateFunction | undefined;

const files = (dir: string): ReadonlyArray<string> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith(".json") ? [join(dir, entry.name)] : []));

/** The validator for a whole token document: the group's `format.json` with every schema it references. */
export const dtcgValidator = (): ValidateFunction => {
  if (validator === undefined) {
    const ajv = new Ajv.default({ strict: false, allErrors: false });

    (addFormats as unknown as (instance: unknown) => void)(ajv);

    for (const file of files(directory)) {
      ajv.addSchema(JSON.parse(readFileSync(file, "utf8")) as object, BASE + relative(directory, file).split("\\").join("/"));
    }

    validator = ajv.getSchema(`${BASE}format.json`)!;
  }

  return validator;
};

/** Whether `document` is a valid token document, and the first error if not. */
export const validateDocument = (document: unknown): { readonly valid: boolean; readonly error?: string } => {
  const validate = dtcgValidator();

  if (validate(document)) {
    return { valid: true };
  }

  const first = validate.errors?.[0];

  return { valid: false, error: first === undefined ? "invalid" : `${first.instancePath === "" ? "(document)" : first.instancePath} ${first.message ?? ""}`.trim() };
};

// ---- the graph pass -----------------------------------------------------------------------------------------------------------------------------------------------------------

type Json = null | boolean | number | string | ReadonlyArray<Json> | { readonly [key: string]: Json };
type Group = { [key: string]: Json };

const isObject = (value: unknown): value is Group => typeof value === "object" && value !== null && !Array.isArray(value);
/** A token has a `$value`, or is defined by a JSON Pointer `$ref` to a value (the format allows both). */
const isToken = (value: unknown): value is Group => isObject(value) && ("$value" in value || typeof value["$ref"] === "string");
const valueOf = (token: Group): Json => (token["$value"] !== undefined ? token["$value"] : { $ref: token["$ref"]! });
const ALIAS = /^\{([^{}]+)\}$/;

const lookup = (document: Group, path: string): Json | undefined => {
  let at: Json | undefined = document;

  for (const part of path.split(".")) {
    at = isObject(at) ? (at as Group)[part] : undefined;

    if (at === undefined) {
      return undefined;
    }
  }

  return at;
};

const merge = (base: Group, over: Group): Group => {
  const out: Group = { ...base };

  for (const [key, value] of Object.entries(over)) {
    const was = out[key];

    out[key] = isObject(value) && isObject(was) && !isToken(value) && !isToken(was) ? merge(was, value) : value;
  }

  return out;
};

/** Every `$extends` replaced by what it extends (a group's own members win). Reports an `$extends` that points at nothing or loops. */
const expand = (document: Group, problems: Array<Problem>, file: string): Group => {
  const expanding: string[] = [];

  const visit = (node: Group, path: string): Group => {
    let result: Group = {};
    const extended = node["$extends"];

    if (typeof extended === "string") {
      const match = ALIAS.exec(extended);
      const target = match === null ? undefined : lookup(document, match[1]!);

      if (match === null || !isObject(target) || isToken(target)) {
        problems.push({ file, path, code: "extends-unresolved", message: `${path === "" ? "the document" : path} extends ${extended}, which is not a group` });
      } else if (expanding.includes(match[1]!) || match[1] === path) {
        problems.push({
          file,
          path,
          code: "extends-cycle",
          message: `${path === "" ? "the document" : path} extends ${extended}, which leads back to it (${[...expanding, match[1]!].join(" -> ")})`,
        });
      } else {
        expanding.push(match[1]!);
        result = visit(target, match[1]!);
        expanding.pop();
      }
    }

    const own: Group = {};

    for (const [key, value] of Object.entries(node)) {
      if (key !== "$extends") {
        own[key] = isObject(value) && !isToken(value) ? visit(value, path === "" ? key : `${path}.${key}`) : value;
      }
    }

    return merge(result, own);
  };

  return visit(document, "");
};

interface Flat {
  readonly type: string | undefined;
  readonly value: Json;
}

const flatten = (document: Group): Map<string, Flat> => {
  const flat = new Map<string, Flat>();

  const visit = (node: Group, path: string, inherited: string | undefined): void => {
    const type = typeof node["$type"] === "string" ? node["$type"] : inherited;

    for (const [key, value] of Object.entries(node)) {
      if (key === "$root" && isToken(value)) {
        flat.set(path, { type: typeof value["$type"] === "string" ? value["$type"] : type, value: valueOf(value) });
      } else if (!key.startsWith("$") && isObject(value)) {
        const here = path === "" ? key : `${path}.${key}`;

        if (isToken(value)) {
          flat.set(here, { type: typeof value["$type"] === "string" ? value["$type"] : type, value: valueOf(value) });
        } else {
          visit(value, here, type);
        }
      }
    }
  };

  visit(document, "", undefined);

  return flat;
};

const pointer = (document: Group, reference: string): Json | undefined => {
  if (!reference.startsWith("#/")) {
    return undefined;
  }

  const parts = reference.slice(2).split("/");

  // a pointer reaches into a token's value (the format: it points at a part of `$value`), never at a group, a description or other metadata
  if (!parts.includes("$value")) {
    return undefined;
  }

  let at: Json | undefined = document;

  for (const part of parts) {
    const key = decodeURIComponent(part).replaceAll("~1", "/").replaceAll("~0", "~");

    at = isObject(at) ? (at as Group)[key] : Array.isArray(at) && /^(0|[1-9]\d*)$/.test(key) ? (at as ReadonlyArray<Json>)[Number(key)] : undefined;

    if (at === undefined) {
      return undefined;
    }
  }

  return at;
};

export interface Resolved {
  readonly tokens: ReadonlyMap<string, ResolvedToken>;
  readonly problems: ReadonlyArray<Problem>;
  /** The document with every `$extends`, alias and pointer replaced by what it stands for, and a `$type` on every token: what the schemas judge a second time, because an alias can put a value where its type is wrong. */
  readonly resolved: Json;
}

/** The pass over one document that has already been checked against the schemas: follows `$extends`, curly-brace aliases and JSON Pointer `$ref`s to their ends. */
export const resolveDocument = (document: unknown, file: string): Resolved => {
  const problems: Problem[] = [];

  if (!isObject(document)) {
    return { tokens: new Map(), problems: [{ file, code: "token-document", message: "a token document is an object" }], resolved: null };
  }

  const expanded = expand(document, problems, file);
  const flat = flatten(expanded);
  const tokens = new Map<string, ResolvedToken>();
  const resolving: string[] = [];
  const failed = new Set<string>();

  const resolveToken = (path: string): ResolvedToken | undefined => {
    const done = tokens.get(path);

    if (done !== undefined) {
      return done;
    }

    const entry = flat.get(path);

    if (entry === undefined || failed.has(path)) {
      return undefined;
    }

    if (resolving.includes(path)) {
      problems.push({ file, path, code: "token-cycle", message: `${path} refers to itself through ${[...resolving.slice(resolving.indexOf(path)), path].join(" -> ")}` });
      failed.add(path);

      return undefined;
    }

    resolving.push(path);
    const value = resolveValue(entry.value, path, entry.type);
    resolving.pop();

    if (value === undefined) {
      failed.add(path);

      return undefined;
    }

    const type = entry.type ?? value.type;

    if (type === undefined) {
      problems.push({ file, path, code: "token-no-type", message: `${path} has no type: give it \`$type\`, or put it in a group that has one` });
      failed.add(path);

      return undefined;
    }

    const resolved: ResolvedToken = { path, type: type as TokenType, value: value.value };

    tokens.set(path, resolved);

    return resolved;
  };

  /** The value with its aliases and pointers followed, and the type of the alias it ended at, if the whole value is one. */
  const resolveValue = (value: Json, path: string, declared: string | undefined): { readonly value: Json; readonly type?: string } | undefined => {
    if (typeof value === "string") {
      const match = ALIAS.exec(value);

      if (match === null) {
        return { value };
      }

      const target = match[1]!;
      const end = resolveToken(target);

      if (end === undefined) {
        if (!failed.has(target) && !flat.has(target)) {
          problems.push({ file, path, code: "token-unresolved", message: `${path} refers to {${target}}, which is not a token` });
        }

        return undefined;
      }

      if (declared !== undefined && declared !== end.type) {
        problems.push({ file, path, code: "token-type-mismatch", message: `${path} is a ${declared} but refers to {${target}}, which is a ${end.type}` });

        return undefined;
      }

      return { value: end.value as Json, type: end.type };
    }

    if (Array.isArray(value)) {
      const items = (value as ReadonlyArray<Json>).map((each) => resolveValue(each, path, undefined));

      return items.some((each) => each === undefined) ? undefined : { value: items.map((each) => each!.value) };
    }

    if (isObject(value)) {
      const reference = value["$ref"];

      if (typeof reference === "string") {
        const target = pointer(expanded, reference);

        if (target === undefined) {
          problems.push({ file, path, code: "token-unresolved", message: `${path} points at ${reference}, which is nothing in the document` });

          return undefined;
        }

        if (resolving.includes(`ref:${reference}`)) {
          problems.push({ file, path, code: "token-cycle", message: `${path} points at ${reference}, which leads back to it` });

          return undefined;
        }

        resolving.push(`ref:${reference}`);
        const end = resolveValue(target, path, undefined);
        resolving.pop();

        return end;
      }

      const out: { [key: string]: Json } = {};

      for (const [key, each] of Object.entries(value)) {
        const resolved = resolveValue(each, path, undefined);

        if (resolved === undefined) {
          return undefined;
        }

        out[key] = resolved.value;
      }

      return { value: out };
    }

    return { value };
  };

  for (const path of flat.keys()) {
    resolveToken(path);
  }

  const withValue = (token: Group, end: ResolvedToken): Group => {
    const { $ref: _ref, ...rest } = token;

    return { ...rest, $type: end.type, $value: end.value as Json };
  };

  // the document again, with each token's value and type as resolved
  const substitute = (node: Group, path: string): Group => {
    const out: Group = {};

    for (const [key, value] of Object.entries(node)) {
      if (key === "$root" && isToken(value)) {
        const end = tokens.get(path);

        out[key] = end === undefined ? value : withValue(value, end);
      } else if (!key.startsWith("$") && isObject(value)) {
        const here = path === "" ? key : `${path}.${key}`;
        const end = isToken(value) ? tokens.get(here) : undefined;

        out[key] = isToken(value) ? (end === undefined ? value : withValue(value, end)) : substitute(value, here);
      } else {
        out[key] = value;
      }
    }

    return out;
  };

  return { tokens, problems, resolved: substitute(expanded, "") };
};
