// One definition, more than one target: what a target sees of the author's definition. The templates (layout, components, overrides) are the target's own; the state, the commands, the title and
// the backend are the application's. Build time only: the runtime entries never read `targets`.
import type { DefinedApp } from "./index.js";

export type TargetName = "web" | "desktop";

/** On a definition made by `forTarget`: the definition it was made from, so the toolchain can still see every target's templates. */
export const WHOLE = Symbol.for("valancex.common.whole");

/** The definition as `target` sees it: its own layout in place of the top-level one, its components and overrides added. */
export const forTarget = (author: DefinedApp | undefined, target: TargetName): DefinedApp | undefined => {
  if (author === undefined) {
    return undefined;
  }

  const parts = author.targets?.[target];

  if (parts === undefined) {
    return author;
  }

  const layout = parts.layout ?? author.layout;

  return {
    ...author,
    ...({ [WHOLE]: author } as object),
    ...(layout === undefined ? {} : { layout }),
    components: [...(author.components ?? []), ...(parts.components ?? [])],
    override: [...(author.override ?? []), ...(parts.override ?? [])],
  };
};

/** Every target the definition has templates for. */
export const targetsOf = (author: DefinedApp | undefined): ReadonlyArray<TargetName> => Object.keys(author?.targets ?? {}) as ReadonlyArray<TargetName>;
