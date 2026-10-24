// The Web PORT's adapter: the five operations over `createWebPort`, in whatever DOM the caller gives (jsdom in Node, or a real page in Chromium). It observes through the platform's own
// computations: the role from ARIA in HTML (`dom-accessibility-api`, then `aria-query`'s element table), the name and description by the Accessible Name and Description Computation.
import {
  computeAccessibleDescription,
  computeAccessibleName,
  getRole,
} from "dom-accessibility-api";
import { elementRoles, roles } from "aria-query";
import type { WebPort, WebPrimitives } from "@valancex/port-web";

import type {
  Adapter,
  Capabilities,
  Capability,
  Declared,
  Interaction,
  Observation,
  Reported,
  Tree,
} from "../protocol.js";
import { Refused } from "../protocol.js";

export interface WebEnvironment {
  /** Makes the PORT, reporting to `report`. The caller owns the container and the table. */
  readonly create: (
    report: (handler: string, payload?: unknown) => void,
  ) => WebPort;
  /** The element the PORT draws into. */
  readonly container: Element;
  /** Presses a key as a person does, to the focused element (a real keyboard). Without it the adapter cannot do `key`. */
  readonly press?: (key: string) => Promise<void>;
  readonly version: string;
  /** What this DOM can do besides the basics, and what it declares it cannot. */
  readonly can?: ReadonlyArray<Capability>;
  readonly unsupported?: ReadonlyArray<Declared>;
  /** Forces a state on an element (Chromium's DevTools protocol). */
  readonly force?: (
    element: Element,
    state: "hover" | "pressed" | "focus" | "focus-visible",
  ) => Promise<void>;
}

const rolesByElement = (element: Element): string | undefined => {
  const found = getRole(element);

  if (found !== null) {
    return found;
  }

  for (const [description, names] of elementRoles.entries()) {
    const attributes = description.attributes ?? [];

    if (
      description.name === element.localName &&
      attributes.every((each) =>
        each.value === undefined
          ? element.hasAttribute(each.name)
          : element.getAttribute(each.name) === String(each.value),
      )
    ) {
      return [...names][0];
    }
  }

  return undefined;
};

const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

export const webAdapter = (environment: WebEnvironment): Adapter => {
  let reports: Reported[] = [];
  let port: WebPort | undefined;
  let keys = new Map<Node, string>();
  let tree: Tree | undefined;

  const index = (made: Tree): void => {
    keys = new Map();

    const walk = (node: {
      readonly type: string;
      readonly key: string;
      readonly children?: ReadonlyArray<unknown>;
    }): void => {
      const found = port?.inspect(node.key);

      if (found !== undefined) {
        keys.set(found, node.key);
      }

      for (const child of node.children ?? []) {
        walk(child as never);
      }
    };

    walk(made.root as never);
  };

  const element = (key: string): Element => {
    const found = port?.inspect(key);

    if (found === undefined || found.nodeType !== 1) {
      throw new Error(`there is no element at ${key}`);
    }

    return found as Element;
  };

  const can: ReadonlyArray<Capability> = [
    "roles",
    "names",
    ...(environment.press === undefined ? [] : (["keys"] as const)),
    ...(environment.force === undefined ? [] : (["force"] as const)),
    ...(environment.can ?? []),
  ];

  return {
    capabilities: async (): Promise<Capabilities> => ({
      port: "port-web",
      version: environment.version,
      can: [...new Set(can)],
      unsupported: environment.unsupported ?? [],
    }),
    load: async (made) => {
      port?.unmount();
      reports = [];
      port = environment.create((handler, payload) =>
        reports.push(payload === undefined ? [handler] : [handler, payload]),
      );

      try {
        port.draw(made as never);
      } catch (error) {
        port = undefined;
        throw new Refused(
          (error as { code?: string }).code ?? "refused",
          error instanceof Error ? error.message : String(error),
        );
      }

      tree = made;
      index(made);
    },
    update: async (made) => {
      if (port === undefined) {
        throw new Error("nothing is drawn");
      }

      try {
        port.update(made as never);
      } catch (error) {
        throw new Refused(
          (error as { code?: string }).code ?? "refused",
          error instanceof Error ? error.message : String(error),
        );
      }

      tree = made;
      index(made);
    },
    observe: async (key): Promise<Observation | undefined> => {
      const found = port?.inspect(key);

      if (found === undefined || found.nodeType !== 1) {
        return undefined;
      }

      const el = found as HTMLElement & {
        value?: string;
        checked?: boolean;
        disabled?: boolean;
      };
      const role = rolesByElement(el);
      // a role that prohibits a name (paragraph, generic, …) has none, whatever a computation over its words would say: ARIA 1.2 names which roles may be named
      const prohibited =
        role !== undefined &&
        (
          (
            roles.get(role as never) as unknown as
              | { nameFrom?: ReadonlyArray<string> }
              | undefined
          )?.nameFrom ?? []
        ).includes("prohibited");
      const name = prohibited ? "" : computeAccessibleName(el);
      const description = computeAccessibleDescription(el);
      const input = el.localName === "input" || el.localName === "textarea";
      const checkable =
        el.localName === "input" &&
        ["checkbox", "radio"].includes((el as HTMLInputElement).type);
      const component =
        (tree?.root as { component?: string } | undefined)?.component ??
        el.localName;

      return {
        key,
        component: findComponent(tree, key) ?? component,
        ...(role === undefined || role === "generic" ? {} : { role }),
        ...(name === "" ? {} : { name }),
        ...(description === "" ? {} : { description }),
        text: el.textContent ?? "",
        ...(input ? { value: el.value ?? "" } : {}),
        enabled:
          el.disabled !== true && el.getAttribute("aria-disabled") !== "true",
        ...(checkable ? { checked: el.checked === true } : {}),
        ...(el.hasAttribute("aria-pressed")
          ? { pressed: el.getAttribute("aria-pressed") === "true" }
          : {}),
        ...(el.hasAttribute("aria-invalid")
          ? { invalid: el.getAttribute("aria-invalid") === "true" }
          : {}),
        children: [...el.children]
          .map((child) => keys.get(child))
          .filter((each): each is string => each !== undefined),
      };
    },
    interact: async (key, how: Interaction) => {
      const el = element(key) as HTMLElement & { value?: string };

      reports = [];

      switch (how.kind) {
        case "activate":
          el.click();
          break;
        case "type":
          el.focus();
          // coming to the field is not what is being asked about: its focus is reported by the `focus` interaction
          reports = [];
          el.value = how.text;
          el.dispatchEvent(
            new (
              el.ownerDocument.defaultView as Window & typeof globalThis
            ).Event("input", { bubbles: true }),
          );
          break;
        case "key":
          if (environment.press === undefined) {
            throw new Error("this adapter has no keyboard");
          }

          el.focus();
          reports = [];
          await environment.press(how.key);
          break;
        case "focus":
          el.focus();
          break;
        case "blur":
          el.focus();
          reports = [];
          el.blur();
          break;
        case "pointer-hover":
          el.dispatchEvent(
            new (
              el.ownerDocument.defaultView as Window & typeof globalThis
            ).MouseEvent("mouseover", { bubbles: true }),
          );
          break;
      }

      await tick();

      return reports.splice(0);
    },
    ...(environment.force === undefined
      ? {}
      : {
          force: (
            key: string,
            state: "hover" | "pressed" | "focus" | "focus-visible",
          ) => environment.force!(element(key), state),
        }),
    unmount: async () => {
      port?.unmount();
      port = undefined;
      tree = undefined;
      keys = new Map();
      reports = [];
    },
  };
};

const findComponent = (
  made: Tree | undefined,
  key: string,
): string | undefined => {
  const walk = (node: {
    readonly key?: string;
    readonly component?: string;
    readonly children?: ReadonlyArray<unknown>;
  }): string | undefined =>
    node.key === key
      ? node.component
      : (node.children ?? [])
          .map((child) => walk(child as never))
          .find((found) => found !== undefined);

  return made === undefined ? undefined : walk(made.root as never);
};

export type { WebPrimitives };
