// The project's theme. A project that writes none has the default theme (Tier 1: nothing to do, and every primitive of the portable core is styled); a project that has a `theme/` directory with a
// `theme.json` (Tier 2) uses it instead, whole: its token documents by mode and its recipes. A recipe's `escape` block (Tier 3) is the marked way to a CSS property outside the contract, for the web.
// The stylesheet is compiled here, at build time; nothing is computed in the browser.
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

import { checkTheme, compileWeb, coverageOf, defaultInputs, loadTheme, resolveForDesktop, root as styleRoot } from "@valancex/style";
import type { Problem } from "@valancex/style";

import { diagnostic } from "./diagnostics.js";
import type { Diagnostic } from "./diagnostics.js";

export const THEME_DIR = "theme";

/** The theme file the project uses: its own `theme/theme.json`, else the default theme's. */
export const themeFileOf = (root: string): { readonly file: string; readonly custom: boolean } => {
  const own = join(root, THEME_DIR, "theme.json");

  return existsSync(own) ? { file: own, custom: true } : { file: join(styleRoot, "themes", "default", "theme.json"), custom: false };
};

const asDiagnostic = (each: Problem): Diagnostic => diagnostic(each.file, 0, each.code, `${each.path === undefined || each.path === "" ? "" : `${each.path}: `}${each.message}`);

export interface ThemeResult {
  readonly custom: boolean;
  readonly name: string;
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  readonly contrast: ReadonlyArray<{ readonly mode: string; readonly text: string; readonly on: string; readonly min: number; readonly ratio: number; readonly passes: boolean }>;
  /** The stylesheet, when the theme has no problem. */
  readonly css?: string;
  /** The theme as the Desktop is told it (resolved values), when the theme has no problem. */
  readonly desktop?: unknown;
}

/** Loads and checks the project's theme. */
export const themeOf = (root: string): ThemeResult => {
  const { file, custom } = themeFileOf(root);
  const loaded = loadTheme(file, (path) => relative(root, path).split("\\").join("/"));
  const inputs = defaultInputs();
  const checked = checkTheme(loaded, inputs);
  const diagnostics = checked.problems.map(asDiagnostic);

  return {
    custom,
    name: loaded.theme.name,
    diagnostics,
    contrast: checked.contrast,
    ...(diagnostics.length === 0 ? { css: compileWeb(loaded, inputs), desktop: resolveForDesktop(loaded, inputs) } : {}),
  };
};

/** What `vlx theme check` says: the theme's problems, the contrast of every pair it declares, and what each target applies of it. */
export const themeReport = (root: string) => {
  const { file } = themeFileOf(root);
  const loaded = loadTheme(file, (path) => relative(root, path).split("\\").join("/"));
  const inputs = defaultInputs();
  const checked = checkTheme(loaded, inputs);

  return {
    custom: themeFileOf(root).custom,
    name: loaded.theme.name,
    modes: Object.keys(loaded.modes),
    diagnostics: checked.problems.map(asDiagnostic),
    contrast: checked.contrast,
    coverage: (["web", "desktop"] as const).map((target) => coverageOf(loaded, inputs, target)),
  };
};
