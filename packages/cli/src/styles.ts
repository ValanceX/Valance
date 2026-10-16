// Component stylesheets (web only). A stylesheet that sits beside a template and has its name (`src/theme-toggle.css` beside `src/theme-toggle.mprx`) belongs to that component: its rules apply
// inside the element that carries the component's name as a class (`class="theme-toggle"` on the template's root), and nowhere else. Every other stylesheet under `src/` stays global, as it
// always was. The design record is `docs/application-model/STYLING.md` (tier 1): this is web CSS, owned by a web template, and not part of the portable component.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import type { Plugin } from "vite";

import type { Diagnostic } from "./diagnostics.js";
import { diagnostic } from "./diagnostics.js";
import { stylesheets } from "./emit.js";
import { rootOf } from "./outline.js";

export interface ComponentStyle {
  /** The stylesheet, relative to the project (`src/theme-toggle.css`). */
  readonly file: string;
  /** The template it belongs to. */
  readonly template: string;
  /** The class that names the component: the stylesheet's rules apply inside the element that has it. */
  readonly scope: string;
}

/** The web's component stylesheets: each stylesheet whose template sits beside it. */
export const componentStyles = (root: string): ReadonlyArray<ComponentStyle> =>
  stylesheets(root).flatMap((file) => {
    const template = file.replace(/\.css$/, ".mprx");

    return existsSync(join(root, template)) ? [{ file, template, scope: basename(file, ".css") }] : [];
  });

/** The scope a stylesheet's path asks for, or `undefined` when the stylesheet is global. Cheap: it is asked for every stylesheet the bundler loads. */
const scopeOf = (root: string, path: string): string | undefined => {
  const file = relative(root, path).split(sep).join("/");

  return file.startsWith("src/") && !file.startsWith("src/desktop/") && file.endsWith(".css") && existsSync(join(dirname(path), `${basename(file, ".css")}.mprx`))
    ? basename(file, ".css")
    : undefined;
};

/** The stylesheet's rules inside `@scope`. Rules that must come first (`@charset`, `@import`) stay where they have to be. */
export const scoped = (css: string, scope: string): string => {
  const lead = /^(?:\s*(?:\/\*[\s\S]*?\*\/|@charset\s[^;]*;|@import\s[^;]*;))*/.exec(css)![0];

  return `${lead}\n@scope (.${scope}) {\n${css.slice(lead.length)}\n}\n`;
};

/** Wraps every component stylesheet the bundler loads (the build, the dev server, and the dev server's server-rendered head, which loads it with `?inline`). */
export const scoping = (root: string): Plugin => ({
  name: "vlx-component-styles",
  enforce: "pre",
  transform(code, id) {
    const scope = scopeOf(root, id.split("?")[0]!);

    return scope === undefined ? null : { code: scoped(code, scope), map: null };
  },
});

// A rule about the page as a whole can never match inside a component, so it would do nothing and say nothing.
const GLOBAL = /(^|[}{,;]|\*\/)\s*(html|body|:root)\b(?![\w-])/gm;

/** Mistakes in the web's component stylesheets, each a diagnostic about the stylesheet. */
export const checkStyles = (root: string): ReadonlyArray<Diagnostic> =>
  componentStyles(root).flatMap(({ file, template, scope }): ReadonlyArray<Diagnostic> => {
    const found: Array<Diagnostic> = [];
    const first = rootOf(readFileSync(join(root, template), "utf8"));

    if (first === undefined || first.name.startsWith("mesh-") || !first.classes.includes(scope)) {
      found.push(
        diagnostic(
          file,
          1,
          "style-scope",
          `${file} sits beside ${template}, so it is that component's stylesheet: its rules apply inside the element with class "${scope}", and ${
            first === undefined
              ? "the template has no element"
              : first.name.startsWith("mesh-")
                ? `the template starts with <${first.name}>, which is not an element`
                : `the template's first element, <${first.name}>, has no class "${scope}"`
          }. Write class="${scope}" on it, or move the rules to a stylesheet with no template beside it`,
        ),
      );
    }

    const css = readFileSync(join(root, file), "utf8");

    for (const match of css.matchAll(GLOBAL)) {
      const at = match.index + match[0].length - match[2]!.length;

      found.push(
        diagnostic(
          file,
          css.slice(0, at).split("\n").length,
          "style-global",
          `a rule for "${match[2]}" in ${file} can never match: the stylesheet applies inside .${scope}. Put rules about the whole page in a stylesheet with no template beside it`,
        ),
      );
    }

    return found;
  });
