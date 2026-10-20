// A theme on disk: `theme.json`, its token documents by mode and its recipes. Loading reads and checks everything that can be checked from the files alone (the schemas, the Design Tokens format, the
// graph pass, that every mode defines the same tokens); `check.ts` then checks the recipes against the primitives' specifications.
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { loadSchema } from "./load.js";
import { resolveDocument, validateDocument } from "./tokens.js";
import type { LoadedTheme, Problem, Recipe, ResolvedToken, Theme } from "./types.js";

const ajv = new Ajv.default({ strict: false, allErrors: true });
const validateTheme = ajv.compile(loadSchema("theme-v1.schema.json"));
export const validateRecipe = ajv.compile(loadSchema("recipe-v1.schema.json"));

const read = (path: string): { readonly value?: unknown; readonly problem?: string } => {
  try {
    return { value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** `over` laid on `base`, group by group (a token of `over` replaces the token of `base`). */
const lay = (base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(over)) {
    const was = out[key];

    out[key] = isObject(value) && isObject(was) && !("$value" in value) && !("$value" in was) ? lay(was, value) : value;
  }

  return out;
};

const schemaProblems = (file: string, errors: ReadonlyArray<{ instancePath: string; message?: string }> | null | undefined): Problem[] =>
  (errors ?? [])
    .slice(0, 5)
    .map((each) => ({ file, path: each.instancePath, code: "schema", message: `${each.instancePath === "" ? "(document)" : each.instancePath} ${each.message ?? "is invalid"}` }));

/** Reads the theme at `themeFile`. Never throws for a mistake in the theme: that is what `problems` is for. */
export const loadTheme = (themeFile: string, display: (path: string) => string = (path) => relative(process.cwd(), path)): LoadedTheme => {
  const directory = dirname(themeFile);
  const problems: Problem[] = [];
  const shown = display(themeFile);
  const parsed = read(themeFile);

  if (parsed.problem !== undefined) {
    return {
      theme: { version: 1, name: "unreadable", modes: { light: "" }, recipes: [] },
      directory,
      modes: {},
      recipes: [],
      problems: [{ file: shown, code: "theme-unreadable", message: parsed.problem }],
    };
  }

  if (!validateTheme(parsed.value)) {
    problems.push(...schemaProblems(shown, validateTheme.errors));

    return { theme: { version: 1, name: "invalid", modes: { light: "" }, recipes: [] }, directory, modes: {}, recipes: [], problems };
  }

  const theme = parsed.value as Theme;

  // the tokens, by mode: the base document laid under each mode's own
  const documents: Record<string, Record<string, unknown>> = {};
  const baseFile = theme.base === undefined ? undefined : join(directory, theme.base);
  const base = baseFile === undefined ? undefined : read(baseFile);

  if (base?.problem !== undefined) {
    problems.push({ file: display(baseFile!), code: "tokens-unreadable", message: base.problem });
  }

  for (const [mode, relativeFile] of Object.entries(theme.modes)) {
    const file = join(directory, relativeFile);
    const own = read(file);

    if (own.problem !== undefined) {
      problems.push({ file: display(file), code: "tokens-unreadable", message: own.problem });
      continue;
    }

    for (const [name, document] of [[display(file), own.value] as const, ...(base?.value === undefined ? [] : [[display(baseFile!), base.value] as const])]) {
      const checked = validateDocument(document);

      if (!checked.valid && !problems.some((each) => each.file === name && each.code === "tokens-format")) {
        problems.push({ file: name, code: "tokens-format", message: `not a Design Tokens (2025.10) document: ${checked.error}` });
      }
    }

    documents[mode] = lay(isObject(base?.value) ? (base!.value as Record<string, unknown>) : {}, isObject(own.value) ? own.value : {});
  }

  const modes: Record<string, ReadonlyMap<string, ResolvedToken>> = {};

  for (const [mode, document] of Object.entries(documents)) {
    const file = display(join(directory, theme.modes[mode]!));
    const resolved = resolveDocument(document, file);

    problems.push(...resolved.problems);

    // an alias can put a value where its type is wrong: the resolved document is judged by the schemas again
    if (resolved.problems.length === 0) {
      const again = validateDocument(resolved.resolved);

      if (!again.valid) {
        problems.push({ file, code: "tokens-format", message: `after its references are followed the ${mode} mode is not a Design Tokens document: ${again.error}` });
      }
    }

    modes[mode] = resolved.tokens;
  }

  // every mode defines the same tokens as `light`
  const light = modes["light"];

  if (light !== undefined) {
    for (const [mode, tokens] of Object.entries(modes)) {
      for (const path of light.keys()) {
        if (!tokens.has(path)) {
          problems.push({
            file: display(join(directory, theme.modes[mode]!)),
            path,
            code: "mode-missing-token",
            message: `the ${mode} mode does not define ${path}, which the light mode does`,
          });
        }
      }

      for (const path of tokens.keys()) {
        if (!light.has(path)) {
          problems.push({
            file: display(join(directory, theme.modes[mode]!)),
            path,
            code: "mode-extra-token",
            message: `the ${mode} mode defines ${path}, which the light mode does not`,
          });
        }
      }
    }
  }

  const recipes: Array<{ file: string; recipe: Recipe }> = [];

  for (const relativeFile of theme.recipes) {
    const file = join(directory, relativeFile);
    const own = read(file);

    if (own.problem !== undefined) {
      problems.push({ file: display(file), code: "recipe-unreadable", message: own.problem });
    } else if (!validateRecipe(own.value)) {
      problems.push(...schemaProblems(display(file), validateRecipe.errors).map((each) => ({ ...each, code: "recipe-schema" })));
    } else {
      recipes.push({ file: display(file), recipe: own.value as Recipe });
    }
  }

  return { theme, directory, modes, recipes, problems };
};
