/**
 * An event's payload, with its kind declared. PORT's event realization builds a payload with a function, and a function does not say what kind of value it builds; MESH's
 * manifest must. `event` builds the realization and remembers the kind, so `manifest` (./web-manifest.ts) can state it without a second declaration. The result is an
 * ordinary PORT `EventRealization`: it works in any primitives table whether or not a manifest is derived from it.
 */
import type { BoundaryValue } from "@valancex/mesh-runtime";
import type { EventRealization } from "@valancex/port-web";

export type PayloadKind = "string" | "number" | "boolean" | "any";

const kinds = new WeakMap<object, PayloadKind>();

/** The kind `event` declared for `realization`, or undefined for one built any other way. */
export const payloadKindOf = (realization: EventRealization): PayloadKind | undefined => kinds.get(realization);

/**
 * The DOM event `type` constitutes the event. With `payload`, the event carries the value `of(event, element)` builds, of the declared `kind`: `event("input", { kind: "string",
 * of: (_event, element) => (element as HTMLInputElement).value })`. Without it, the event carries nothing.
 */
export const event = (type: string, payload?: { readonly kind: PayloadKind; readonly of: (event: Event, element: Element) => BoundaryValue }): EventRealization => {
  const realization: EventRealization = payload === undefined ? { type } : { type, payload: payload.of };

  if (payload !== undefined) {
    kinds.set(realization, payload.kind);
  }

  return realization;
};
