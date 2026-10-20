// Runs in Node, before the browser: compiles the default theme and the same theme with deliberate wrong values, and hands the browser the stylesheets and the resolved tokens to compare with.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestProject } from "vitest/node";

import { checkTheme, compileWeb, defaultInputs, loadTheme, root } from "../src/index.js";

export interface Provided {
  readonly css: string;
  /** The theme with one wrong value in each of three places: the accent, the button's radius, the heading's size. */
  readonly wrong: string;
  /** Mode name to token path to its resolved value. */
  readonly tokens: Record<string, Record<string, unknown>>;
}

declare module "vitest" {
  export interface ProvidedContext {
    style: Provided;
  }
}

const compile = (directory: string, strict = true): { css: string; tokens: Record<string, Record<string, unknown>> } => {
  const loaded = loadTheme(join(directory, "theme.json"), (path) => path);
  const inputs = defaultInputs();
  const problems = checkTheme(loaded, inputs).problems;

  if (strict && problems.length > 0) {
    throw new Error(`the theme has problems: ${JSON.stringify(problems)}`);
  }

  return {
    css: compileWeb(loaded, inputs),
    tokens: Object.fromEntries(Object.entries(loaded.modes).map(([mode, tokens]) => [mode, Object.fromEntries([...tokens].map(([path, token]) => [path, token.value]))])),
  };
};

export default (project: TestProject): (() => void) => {
  const right = compile(join(root, "themes", "default"));
  const copy = mkdtempSync(join(tmpdir(), "theme-wrong-"));

  cpSync(join(root, "themes", "default"), copy, { recursive: true });

  const edit = (file: string, change: (json: any) => void): void => {
    const json = JSON.parse(readFileSync(join(copy, file), "utf8"));

    change(json);
    writeFileSync(join(copy, file), JSON.stringify(json));
  };

  edit("tokens/light.tokens.json", (json) => Object.assign(json.color.accent.$value, { hex: "#00aa00", components: [0, 0.6667, 0] }));
  edit("recipes/button.json", (json) => (json.base.radius = "radius.1"));
  edit("recipes/heading.json", (json) => (json.base.type = "type.label"));

  // (the wrong accent also breaks the contrast the theme declares, which `check` refuses; the stylesheet is compiled anyway, to show the browser comparison finds it too)
  const wrong = compile(copy, false).css;

  rmSync(copy, { recursive: true, force: true });
  project.provide("style", { css: right.css, wrong, tokens: right.tokens });

  return () => undefined;
};
