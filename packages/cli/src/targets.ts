// The targets an application can be developed for. Today there is one, the web; the wizard, `vlx init` and the flags are written against this list, so a target that arrives later is one more entry
// here (and its template under `templates/`), not a change to them.
import { webVocabulary } from "@valancex/common/internal";
import type { Vocabulary } from "@valancex/common/internal";

export interface Target {
  /** The flag (`--web`) and the name in `valance.<id>.json`. */
  readonly id: "web";
  readonly label: string;
  readonly hint: string;
  /** The tags its templates may write. A project builds against its target's vocabulary. */
  readonly vocabulary: Vocabulary;
}

export const TARGETS: ReadonlyArray<Target> = [
  { id: "web", label: "Web", hint: "a website: Markdown pages and templates, built to a static site (settings in valance.web.json)", vocabulary: webVocabulary },
];

export type TargetId = Target["id"];

export const isTarget = (name: string): name is TargetId => TARGETS.some((each) => each.id === name);
