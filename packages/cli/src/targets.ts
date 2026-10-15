// The targets an application can be developed for: the web, and a desktop window. The wizard, `vlx init` and the flags are written against this list, so a target that arrives later is one more
// entry here (and its template under `templates/`, its built-in views, its vocabulary), not a change to them.
import { fromManifests, webVocabulary } from "@valancex/common/internal";
import type { Vocabulary } from "@valancex/common/internal";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { BUILT_IN, BUILT_IN_DESKTOP } from "./compile.js";

export interface Target {
  /** The flag (`--web`) and the name in `valance.<id>.json`. */
  readonly id: "web" | "desktop";
  readonly label: string;
  readonly hint: string;
  /** The tags its templates may write. A project builds against its target's vocabulary. */
  readonly vocabulary: Vocabulary;
  /** Where the framework's own templates for this target are (the layout and the views that draw a page's blocks): a project's own `layout` and `override`s replace them by name. */
  readonly views: string;
}

/**
 * The Desktop PORT's vocabulary: its components as data (`vocabulary.json`: columns, rows, text, a button, a checkbox, a text field; `content.json`: what Markdown produces), read from the
 * PORT's own package (`@valancex/port-desktop-vocabulary`), not from a copy kept here.
 */
const desktopVocabulary = (): Vocabulary => {
  const need = createRequire(import.meta.url);
  const read = (name: string): { readonly components: Readonly<Record<string, unknown>> } =>
    JSON.parse(readFileSync(need.resolve(`@valancex/port-desktop-vocabulary/${name}`), "utf8")) as { readonly components: Readonly<Record<string, unknown>> };

  return fromManifests("desktop", read("vocabulary.json"), read("content.json"));
};

export const TARGETS: ReadonlyArray<Target> = [
  { id: "web", label: "Web", hint: "a website: Markdown pages and templates, built to a static site (settings in valance.web.json)", vocabulary: webVocabulary, views: BUILT_IN },
  {
    id: "desktop",
    label: "Desktop",
    hint: "a native window on Linux and Windows: Markdown pages and templates, drawn by the Desktop PORT (settings in valance.desktop.json)",
    vocabulary: desktopVocabulary(),
    views: BUILT_IN_DESKTOP,
  },
];

export const targetOf = (id: TargetId): Target => TARGETS.find((each) => each.id === id)!;

export type TargetId = Target["id"];

export const isTarget = (name: string): name is TargetId => TARGETS.some((each) => each.id === name);

/** What `--yes` makes: the web alone is the one that needs nothing else installed. */
export const DEFAULT_TARGETS: ReadonlyArray<TargetId> = ["web"];
