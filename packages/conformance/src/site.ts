// The gallery as a page (Node): the gallery's tree drawn by the Web PORT's server entry, with the default theme's stylesheet, as a static document that a person can open and a verifier can check.
import { loadSpecifications, loadWeb, webTable } from "@valancex/primitives";
import { realizeHtml } from "@valancex/port-web/server";
import { compileWeb, defaultInputs, loadTheme, root as styleRoot } from "@valancex/style";
import * as Web from "@valancex/valance/web";
import { join } from "node:path";

import { cellsOf, galleryTree } from "./gallery.js";
import type { Cell } from "./gallery.js";

/** The layout of the portable core on the web, as `vlx` writes it (`core.css`). */
const CORE_CSS = `@layer vlx-library, vlx-theme, vlx-app;
@layer vlx-library { vlx-column { display: flex; flex-direction: column; gap: 0.5rem; } vlx-row { display: flex; flex-direction: row; align-items: center; gap: 0.5rem; } }
`;

export interface Site {
  readonly html: string;
  readonly cells: ReadonlyArray<Cell>;
  readonly modes: ReadonlyArray<string>;
}

/** The gallery page for the default theme: every cell in every mode the theme has. */
export const gallerySite = (): Site => {
  const cells = cellsOf(loadSpecifications(), loadWeb());
  const loaded = loadTheme(join(styleRoot, "themes", "default", "theme.json"), (path) => path);
  const modes = Object.keys(loaded.modes);
  const css = compileWeb(loaded, defaultInputs());
  const body = realizeHtml(galleryTree(cells, modes) as never, webTable(loadWeb(), Web as never));
  const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>The gallery</title>\n<style>\n${CORE_CSS}${css}</style>\n</head>\n<body>\n<main>\n<h1>The gallery</h1>\n${body}\n</main>\n</body>\n</html>\n`;

  return { html, cells, modes };
};
