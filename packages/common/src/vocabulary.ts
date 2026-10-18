// A target's vocabulary: the tags a template may write and what each becomes there. MESH has no primitive set of its own ("each application's manifest declares its own"), so this is the one
// thing a template's meaning depends on that is not portable. State, commands, content, slots, props and events are the same on every target; the tags are the target's.
//
// Today the type is the web's realization table (`WebPrimitives`), because that is the only table `manifest()` derives a MESH manifest from. That is itself a finding: a second target would
// need the manifest derivation to take its own table type. The build takes a `Vocabulary` rather than importing the web's, so a template can be checked against any vocabulary, and a
// second one is a value to pass, not code to change.
import type { WebPrimitives } from "@valancex/port-web";

import { declared, primitives, rules } from "./primitives.js";

/**
 * A target's vocabulary has one of two forms. The web's is a table of PORT Web's realizations, from which the manifest is derived (`tags`). Any other target's is a MESH manifest, as data
 * (`components`): the PORT ships it (the Desktop PORT's `vocabulary.json` and `content.json`), and the build reads it as it is.
 */
export interface WebVocabulary {
  /** The target's id (`web`). */
  readonly target: string;
  /** The tags, each with its props and events. */
  readonly tags: WebPrimitives;
  /**
   * The props a template may leave out, by tag. PORT Web's table says how a prop is realized, not whether it is required, so the manifest derived from it makes every prop required but a boolean
   * one; this is the author-facing rule beside it. An absent prop is not in the render tree, and PORT Web realizes an absent prop as no attribute (or the element's own initial value).
   */
  readonly optional?: Readonly<Record<string, ReadonlyArray<string>>>;
  /**
   * What each tag's props and events are, as a specification states them: the type of a prop and whether a use must write it, which the table alone cannot say. Where present it settles the manifest
   * entry's props and events (the table still says how they are realized); `optional` then applies to what it does not cover.
   */
  readonly rules?: {
    readonly named: ReadonlyArray<string>;
    readonly only: Readonly<Record<string, ReadonlyArray<string>>>;
    readonly within: Readonly<Record<string, ReadonlyArray<string>>>;
  };
  readonly declared?: Readonly<
    Record<
      string,
      {
        readonly props: Readonly<Record<string, { readonly type: Readonly<Record<string, unknown>>; readonly required: boolean }>>;
        readonly events: Readonly<Record<string, { readonly payload?: Readonly<Record<string, unknown>> }>>;
      }
    >
  >;
}

export interface ManifestVocabulary {
  readonly target: string;
  /** MESH manifest components: each with its props and events. */
  readonly components: Readonly<Record<string, unknown>>;
}

export type Vocabulary = WebVocabulary | ManifestVocabulary;

/** The names a template may write as a primitive in this vocabulary. */
export const namesOf = (vocabulary: Vocabulary): ReadonlyArray<string> => Object.keys("tags" in vocabulary ? vocabulary.tags : vocabulary.components);

/** A vocabulary that is a MESH manifest (or several: their components are merged, and a name may not be in two). */
export const fromManifests = (target: string, ...manifests: ReadonlyArray<{ readonly components: Readonly<Record<string, unknown>> }>): ManifestVocabulary => {
  const components: Record<string, unknown> = {};

  for (const manifest of manifests) {
    for (const [name, each] of Object.entries(manifest.components)) {
      if (name in components) {
        throw new Error(`the ${target} vocabulary declares "${name}" twice`);
      }

      components[name] = each;
    }
  }

  return { target, components };
};

/** The web's vocabulary: HTML elements, with `class`, `theme`, `id` and `aria-*` as styling and accessibility hooks. */
export const webVocabulary: WebVocabulary = {
  target: "web",
  tags: primitives,
  declared,
  rules,
};
