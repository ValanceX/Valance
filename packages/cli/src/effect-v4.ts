// Two checks for a project still written against effect 3. `vlx check` loads `src/main.ts` through Vite, with no tsc, so the one v3 spelling that still runs, `Schema.Literal("a", "b")`
// (effect 4 keeps only "a"), would load and then behave wrongly. These say so before it does.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Diagnostic } from "./diagnostics.js";
import { diagnostic, lineOf } from "./diagnostics.js";

export const VERSION_CODE = "effect-version";
export const SCHEMA_CODE = "effect-v3-schema";

/** The version of the `effect` that resolves from `root` (the nearest `node_modules/effect` up the tree), or nothing when there is none: a missing package is `entry-load`'s to report. */
const installed = (root: string): string | undefined => {
  for (let dir = root; ; dir = dirname(dir)) {
    const file = join(dir, "node_modules", "effect", "package.json");

    if (existsSync(file)) {
      return (JSON.parse(readFileSync(file, "utf8")) as { readonly version?: string }).version;
    }

    if (dirname(dir) === dir) {
      return undefined;
    }
  }
};

export const effectVersion = (root: string): ReadonlyArray<Diagnostic> => {
  const version = installed(root);

  if (version === undefined || version.startsWith("4.")) {
    return [];
  }

  const manifest = join(root, "package.json");
  const line = existsSync(manifest) ? lineOf(readFileSync(manifest, "utf8"), '"effect"') : 1;

  return [diagnostic("package.json", line, VERSION_CODE, `effect ${version} is installed; Valance needs effect ^4.1.0`)];
};

/** `source` with every comment and string body replaced by spaces (newlines kept; a string keeps its quotes), so a call named inside one is not found and a comma inside one does not split arguments. */
const blank = (source: string): string => {
  let out = "";

  for (let at = 0; at < source.length;) {
    const char = source[at]!;
    const two = source.slice(at, at + 2);
    let end = at + 1;

    if (two === "//") {
      end = source.indexOf("\n", at);
      end = end < 0 ? source.length : end;
    } else if (two === "/*") {
      end = source.indexOf("*/", at + 2);
      end = end < 0 ? source.length : end + 2;
    } else if (char === '"' || char === "'" || char === "`") {
      // ponytail: a `${}` inside a template literal is blanked with it, and a regex literal holding a quote is read as a string; a call there goes unseen
      while (end < source.length && source[end] !== char) {
        end += source[end] === "\\" ? 2 : 1;
      }
      end = Math.min(end + 1, source.length);
    } else {
      out += char;
      at = end;
      continue;
    }

    // a string keeps its quotes, so it still counts as an argument
    const blanked = source.slice(at, end).replace(/[^\n]/g, " ");

    out += char === '"' || char === "'" || char === "`" ? char + blanked.slice(1, -1) + char : blanked;
    at = end;
  }

  return out;
};

/** The number of top-level arguments of the call whose `(` is at `open` (brackets respected), and the first character of the first one. */
const argumentsAt = (text: string, open: number): { readonly count: number; readonly first: string } => {
  let depth = 0;
  let count = 0;
  let first = "";
  let any = false;

  for (let at = open + 1; at < text.length; at += 1) {
    const char = text[at]!;

    if (depth === 0 && char === ")") {
      break;
    }

    if (depth === 0 && char === ",") {
      count += any ? 1 : 0;
      any = false;
    } else if (!/\s/.test(char)) {
      first = count === 0 && !any ? char : first;
      any = true;
      depth += "([{".includes(char) ? 1 : ")]}".includes(char) ? -1 : 0;
    }
  }

  return { count: count + (any ? 1 : 0), first };
};

const CALL = /\bSchema\.(Literal|Union|Tuple)\s*\(/g;

/** The v3 calls in one file's source. */
export const v3Calls = (file: string, source: string): ReadonlyArray<Diagnostic> => {
  const text = blank(source);
  const found: Array<Diagnostic> = [];

  for (const match of text.matchAll(CALL)) {
    const name = match[1]!;
    const { count, first } = argumentsAt(text, match.index + match[0].length - 1);

    if (name === "Literal" ? count > 1 : first !== "[") {
      const lines = text.slice(0, match.index).split("\n");
      const message =
        name === "Literal" ? "Schema.Literal takes one value in effect 4: write Schema.Literals([...])" : `Schema.${name} takes an array in effect 4: write Schema.${name}([...])`;

      found.push(diagnostic(file, lines.length, SCHEMA_CODE, message, lines[lines.length - 1]!.length + 1));
    }
  }

  return found;
};

const sources = (dir: string): Array<string> =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((each) => (each.isDirectory() ? sources(join(dir, each.name)) : each.name.endsWith(".ts") ? [join(dir, each.name)] : []))
    : [];

export const effectV3Schema = (root: string): ReadonlyArray<Diagnostic> =>
  sources(join(root, "src"))
    .sort()
    .flatMap((file) =>
      v3Calls(
        file
          .slice(root.length + 1)
          .split("\\")
          .join("/"),
        readFileSync(file, "utf8"),
      ),
    );
