// The web's part of the MESH manifest, generated from the specifications and the web's realizations: for each tag, the props a template may write (typed and required as the specification says, or
// as the realization says for a prop of the web only) and the events it may handle. The Desktop's is its own data (decision P1): it is checked against the specifications in parity.ts.
import type { Specification, Type, WebRealization, WebRealizations } from "./types.js";
import { typeOfRealization } from "./web.js";

export interface ManifestEntry {
  readonly props: Readonly<Record<string, { readonly type: Type; readonly required: boolean }>>;
  readonly events: Readonly<Record<string, { readonly payload?: Type }>>;
  readonly commands: Readonly<Record<string, never>>;
  readonly scope: Readonly<Record<string, never>>;
}

/** The portable prop a web prop realizes, by the realization's renames (`alt` realizes `label`). */
export const portablePropOf = (realization: WebRealization, webProp: string): string => {
  const renamed = Object.entries(realization.rename ?? {}).find(([, name]) => name === webProp);

  return renamed === undefined ? webProp : renamed[0];
};

export const manifestEntry = (specifications: Readonly<Record<string, Specification>>, tag: string, realization: WebRealization): ManifestEntry => {
  const specification = specifications[realization.primitive];

  if (specification === undefined) {
    throw new Error(`the web tag "${tag}" realizes "${realization.primitive}", which has no specification`);
  }

  const props: Record<string, { type: Type; required: boolean }> = {};

  for (const [name, how] of Object.entries(realization.props ?? {})) {
    const declared = specification.props[portablePropOf(realization, name)];

    props[name] =
      declared === undefined || declared.webOnly === true
        ? // a hook of the web's: typed by how it is realized, required unless the realization says it need not be (a boolean attribute is never required)
          {
            type: typeOfRealization(how),
            required: how.optional !== true && typeOfRealization(how).kind !== "boolean",
          }
        : {
            type: declared.type,
            required: declared.required && how.optional !== true,
          };
  }

  const events: Record<string, { payload?: Type }> = {};

  for (const [name] of Object.entries(realization.events ?? {})) {
    const payload = specification.events[name]?.payload;

    events[name] = payload === undefined ? {} : { payload };
  }

  return { props, events, commands: {}, scope: {} };
};

/** Every tag's entry. */
export const webManifest = (specifications: Readonly<Record<string, Specification>>, realizations: WebRealizations): Readonly<Record<string, ManifestEntry>> =>
  Object.fromEntries(Object.entries(realizations.primitives).map(([tag, realization]) => [tag, manifestEntry(specifications, tag, realization)]));
