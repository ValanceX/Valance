// The web's table of primitives, generated from the realizations: the shape `@valancex/port-web` takes (`WebPrimitives`), built with the helpers `@valancex/valance/web` provides. The helpers are
// passed in, so this package needs no runtime dependency on the web.
import type { WebPrimitives } from "@valancex/valance/web";

import type { EventRealization, PropRealization, Type, WebRealizations } from "./types.js";

/** The parts of `@valancex/valance/web` the table is built with. */
export interface WebHelpers {
  readonly attribute: (name: string) => unknown;
  readonly booleanAttribute: (name: string) => unknown;
  readonly controlled: (name: string) => unknown;
  readonly controlledBoolean: (name: string) => unknown;
  readonly property: (name: string, holds: "boolean" | "number" | "value") => unknown;
  readonly textProperty: (name: string) => unknown;
  readonly event: (
    type: string,
    payload?: {
      readonly kind: "string" | "number" | "boolean" | "any";
      readonly of: (event: Event, element: Element) => never;
    },
    options?: { readonly key?: string },
  ) => unknown;
}

/** The extractors an event realization may name: what a payload is built from, in the DOM. */
export const extractors = {
  checked: (_event: Event, element: Element) => (element as HTMLInputElement).checked,
  value: (_event: Event, element: Element) => (element as HTMLInputElement).value,
} as const;

const propOf = (web: WebHelpers, realization: PropRealization): unknown => {
  switch (realization.kind) {
    case "attribute":
      return web.attribute(realization.name);
    case "boolean-attribute":
      return web.booleanAttribute(realization.name);
    case "controlled":
      return web.controlled(realization.name);
    case "controlled-boolean":
      return web.controlledBoolean(realization.name);
    case "text-property":
      return web.textProperty(realization.name);
    case "property":
      return web.property(realization.name, realization.holds);
  }
};

const eventOf = (web: WebHelpers, realization: EventRealization): unknown =>
  web.event(
    realization.type,
    realization.payload === undefined
      ? undefined
      : {
          kind: realization.payload.kind,
          of: extractors[realization.payload.of] as never,
        },
    realization.key === undefined ? undefined : { key: realization.key },
  );

/** The table `createWebPort` is given and the manifest is derived from, in the order the realizations list the tags. */
export const webTable = (realizations: WebRealizations, web: WebHelpers): WebPrimitives =>
  Object.fromEntries(
    Object.entries(realizations.primitives).map(([tag, each]) => [
      tag,
      {
        element: each.element,
        ...(each.attributes === undefined ? {} : { attributes: each.attributes }),
        ...(each.props === undefined
          ? {}
          : {
              props: Object.fromEntries(Object.entries(each.props).map(([name, realization]) => [name, propOf(web, realization)])),
            }),
        ...(each.events === undefined
          ? {}
          : {
              events: Object.fromEntries(Object.entries(each.events).map(([name, realization]) => [name, eventOf(web, realization)])),
            }),
      },
    ]),
  ) as unknown as WebPrimitives;

/** The kind a web prop's value has, by how it is realized. */
export const typeOfRealization = (realization: PropRealization): Type => {
  switch (realization.kind) {
    case "attribute":
    case "controlled":
    case "text-property":
      return { kind: "string" };
    case "boolean-attribute":
    case "controlled-boolean":
      return { kind: "boolean" };
    case "property":
      return {
        kind: realization.holds === "value" ? "any" : realization.holds,
      };
  }
};
