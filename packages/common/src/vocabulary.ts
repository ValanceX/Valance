// A target's vocabulary: the tags a template may write and what each becomes there. MESH has no primitive set of its own ("each application's manifest declares its own"), so this is the one
// thing a template's meaning depends on that is not portable. State, commands, content, slots, props and events are the same on every target; the tags are the target's.
//
// Today the type is the web's realization table (`WebPrimitives`), because that is the only table `manifest()` derives a MESH manifest from. That is itself a finding: a second target would
// need the manifest derivation to take its own table type. The build takes a `Vocabulary` rather than importing the web's, so a template can be checked against any vocabulary, and a
// second one is a value to pass, not code to change.
import type { WebPrimitives } from "@valancex/port-web";

import { primitives } from "./primitives.js";

export interface Vocabulary {
  /** The target's id (`web`). */
  readonly target: string;
  /** The tags, each with its props and events. */
  readonly tags: WebPrimitives;
}

/** The web's vocabulary: HTML elements, with `class`, `theme`, `id` and `aria-*` as styling and accessibility hooks. */
export const webVocabulary: Vocabulary = { target: "web", tags: primitives };
