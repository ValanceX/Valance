// The Web PORT in jsdom, in Node: the environment the kit's quick run uses. jsdom has no top layer and runs no default action of a key, and says so in its own data (decision Q6).
import { loadWeb, webTable } from "@valancex/primitives";
import { createWebPort } from "@valancex/port-web";
import * as Web from "@valancex/valance/web";
import { JSDOM } from "jsdom";

import type { Adapter, Declared } from "../protocol.js";
import { webAdapter } from "./web.js";

const unsupported: ReadonlyArray<Declared> = [
  {
    primitive: "dialog",
    case: "*",
    reason:
      "jsdom has no top layer: a modal dialog is shown in a real browser (the Chromium run covers it)",
  },
  {
    primitive: "popover",
    case: "*",
    reason:
      "jsdom has no top layer: a popover is shown in a real browser (the Chromium run covers it)",
  },
  {
    primitive: "*",
    case: "key:",
    reason:
      "jsdom runs no default action of a key press (Enter on a button, Space on a checkbox): the Chromium run presses real keys",
  },
  {
    primitive: "textfield",
    case: "event:submit",
    reason: "a key press: the Chromium run covers it",
  },
  {
    primitive: "textfield",
    case: "event:cancel",
    reason: "a key press: the Chromium run covers it",
  },
];

/** A fresh jsdom document and the Web PORT's table for it, with the globals the PORT reads set as its own tests set them. */
export const jsdomWorld = (): {
  readonly create: (
    report: (handler: string, payload?: unknown) => void,
  ) => ReturnType<typeof createWebPort>;
  readonly container: Element;
} => {
  const dom = new JSDOM(`<!doctype html><body><div id="root"></div></body>`);
  const globals = globalThis as Record<string, unknown>;

  for (const name of [
    "document",
    "window",
    "Node",
    "Element",
    "HTMLElement",
    "HTMLInputElement",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "MutationObserver",
    "CSS",
    "getComputedStyle",
  ]) {
    globals[name] = (dom.window as unknown as Record<string, unknown>)[name];
  }

  const container = dom.window.document.getElementById("root")!;
  const primitives = webTable(loadWeb(), Web as never);

  return {
    create: (report) => createWebPort({ container, primitives, report }),
    container,
  };
};

/** The Web PORT drawing into a fresh jsdom document. */
export const jsdomAdapter = (version: string): Adapter => {
  const world = jsdomWorld();

  return webAdapter({ ...world, version, unsupported });
};
