// A copy of the default theme on disk with a deliberate mistake in it: the way to show that a check fails on a wrong value (and so that its passing means something).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

import { checkTheme, loadTheme, root } from "../src/index.js";

const made: string[] = [];

afterEach(() => {
  for (const directory of made.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

type Json = any; // eslint-disable-line

/** The default theme, with `change` applied to the named JSON files (path relative to the theme's directory) before it is loaded and checked. */
export const themeWith = (change: (edit: (file: string, change: (json: Json) => void) => void) => void) => {
  const directory = mkdtempSync(join(tmpdir(), "theme-"));

  made.push(directory);
  cpSync(join(root, "themes", "default"), directory, { recursive: true });

  change((file, edit) => {
    const path = join(directory, file);
    const json = JSON.parse(readFileSync(path, "utf8")) as Json;

    edit(json);
    writeFileSync(path, JSON.stringify(json, null, 2));
  });

  const loaded = loadTheme(join(directory, "theme.json"), (path) => path.slice(directory.length + 1));

  return { loaded, checked: checkTheme(loaded) };
};

export const codes = (problems: ReadonlyArray<{ readonly code: string }>): string[] => [...new Set(problems.map((each) => each.code))].sort();
