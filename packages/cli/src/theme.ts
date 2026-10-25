// The project's theme. A project that writes none has the default theme (Tier 1: nothing to do, and every primitive of the portable core is styled); a project that has a `theme/` directory with a
// `theme.json` (Tier 2) uses it instead, whole: its token documents by mode and its recipes. A recipe's `escape` block (Tier 3) is the marked way to a CSS property outside the contract, for the web.
// The stylesheet is compiled here, at build time; nothing is computed in the browser.
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { checkTheme, compileWeb, coverageOf, defaultInputs, loadTheme, resolveForDesktop, root as styleRoot } from "@valancex/style";
import type { Problem } from "@valancex/style";

import { diagnostic } from "./diagnostics.js";
import { librariesOf } from "./libraries.js";
import type { Diagnostic } from "./diagnostics.js";

export const THEME_DIR = "theme";

/** The theme package `valance.json` names, if it names one (read here without the rest of the configuration: `vlx check` reports a wrong `valance.json` itself). */
const themePackageOf = (root: string): string | undefined => {
  try {
    const given = (JSON.parse(readFileSync(join(root, "valance.json"), "utf8")) as { readonly theme?: unknown }).theme;

    return typeof given === "string" ? given : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The theme file the project uses: a theme package it names (`"theme": "acme-theme"` in `valance.json`; K12), else its own `theme/theme.json`, else the default theme's. The package's problems (not
 * installed, not a theme, and a `theme/` directory beside it) are `problems`.
 */
export const themeFileOf = (root: string): { readonly file: string; readonly custom: boolean; readonly problems: ReadonlyArray<Diagnostic> } => {
  const own = join(root, THEME_DIR, "theme.json");
  const named = themePackageOf(root);
  const fallback = existsSync(own) ? { file: own, custom: true } : { file: join(styleRoot, "themes", "default", "theme.json"), custom: false };

  if (named === undefined) {
    return { ...fallback, problems: [] };
  }

  const library = librariesOf(root).libraries.find((each) => each.name === named);

  if (library === undefined || library.kind !== "theme" || library.theme === undefined) {
    return {
      ...fallback,
      custom: true,
      problems: [
        diagnostic(
          "valance.json",
          0,
          "theme-package",
          `"theme": "${named}" is not an installed theme package: install it, and it must be marked (a "valance" export condition and \`"valance": { "kind": "theme", "theme": "./theme/theme.json" }\`)`,
        ),
      ],
    };
  }

  return {
    file: library.theme,
    custom: true,
    problems: existsSync(own)
      ? [diagnostic("valance.json", 0, "theme-conflict", `"theme": "${named}" and a theme/ directory are both given: a project has one theme; remove one`)]
      : [],
  };
};

const asDiagnostic = (each: Problem): Diagnostic => diagnostic(each.file, 0, each.code, `${each.path === undefined || each.path === "" ? "" : `${each.path}: `}${each.message}`);

/** The problems of a theme file, checked as a project's theme is (tokens, recipes, contrast of the pairs it declares); `base` is what a file's name is shown relative to. */
export const themeFileProblems = (file: string, base: string): ReadonlyArray<Diagnostic> => {
  const loaded = loadTheme(file, (path) => relative(base, path).split("\\").join("/"));

  return checkTheme(loaded, defaultInputs()).problems.map(asDiagnostic);
};

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
  const { file, custom, problems } = themeFileOf(root);
  const loaded = loadTheme(file, (path) => relative(root, path).split("\\").join("/"));
  const inputs = defaultInputs();
  const checked = checkTheme(loaded, inputs);
  const diagnostics = [...problems, ...checked.problems.map(asDiagnostic)];

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
    diagnostics: [...themeFileOf(root).problems, ...checked.problems.map(asDiagnostic)],
    contrast: checked.contrast,
    coverage: (["web", "desktop"] as const).map((target) => coverageOf(loaded, inputs, target)),
  };
};
