// A minimal terminal PORT (Bet 12, K2): a third target, to test that the contract and the vocabulary designed for the web and the desktop are not secretly shaped like them. It draws the portable core
// as text cells with colors from a theme's tokens, keeps a focus among the controls, and reports key presses as the events the tree binds. It is not a product, and it says what it cannot draw.
import type { RenderTree } from "@valancex/mesh-runtime";
import type { Report, Target, TargetFactory } from "@valancex/valance";

import type { Control } from "./draw.js";
import { draw, DRAWN } from "./draw.js";
import type { Palette } from "./palette.js";
import { DEFAULT_PALETTE } from "./palette.js";

export type { Control } from "./draw.js";
export type { Palette } from "./palette.js";
export { DEFAULT_PALETTE, paletteOf } from "./palette.js";
export { DRAWN } from "./draw.js";

/** A key press: a named key, or a character typed. */
export type Key = "tab" | "shift-tab" | "enter" | "space" | "backspace" | "escape" | { readonly text: string };

export interface Screen {
  readonly lines: ReadonlyArray<string>;
  /** The same lines with 24-bit color escapes and the focused control in reverse video. */
  readonly ansi: ReadonlyArray<string>;
  readonly controls: ReadonlyArray<Control>;
  /** The control that has the focus (its key), if there is one. */
  readonly focus: string | undefined;
  /** The primitives of the tree this PORT does not draw: it draws their content and says so here. */
  readonly limits: ReadonlyArray<string>;
}

export interface TerminalTarget extends Target {
  /** What is drawn now. */
  readonly screen: () => Screen;
  /** A key press: moves the focus, activates the focused control, or edits a text field. A press that does nothing returns `false`. */
  readonly press: (key: Key) => boolean;
}

export interface TerminalOptions {
  readonly palette?: Palette;
}

/** The terminal target. `report` is where its events go, as for any PORT: the handler the tree bound and, for a field, a check box and a toggle, the new value. */
export const terminalTarget =
  (options: TerminalOptions = {}): TargetFactory<TerminalTarget> =>
  (report: Report) => {
    const palette = options.palette ?? DEFAULT_PALETTE;
    let tree: RenderTree | undefined;
    let focus: string | undefined;
    // what has been typed into a field and not yet been drawn back from the application (the application owns the value: this is only what the person sees until it answers)
    const typed = new Map<string, string>();

    const screen = (): Screen => {
      const drawn = draw(tree, palette, focus, typed);

      // a focus on a control that is gone moves to the first one
      if (focus !== undefined && !drawn.controls.some((each) => each.key === focus)) {
        focus = drawn.controls[0]?.key;
      }

      return { lines: drawn.plain, ansi: drawn.ansi, controls: drawn.controls, focus, limits: drawn.limits };
    };

    const accept = (next: RenderTree): void => {
      tree = next;
      typed.clear();
      focus = screen().focus ?? draw(tree, palette, undefined, typed).controls[0]?.key;
    };

    return {
      draw: accept,
      update: accept,
      focus: (key) => void (focus = key),
      unmount: () => {
        tree = undefined;
        focus = undefined;
        typed.clear();
      },
      screen,
      press: (key) => {
        const now = draw(tree, palette, focus, typed);
        const at = now.controls.findIndex((each) => each.key === focus);
        const control = at < 0 ? undefined : now.controls[at];

        if (key === "tab" || key === "shift-tab") {
          if (now.controls.length === 0) {
            return false;
          }

          const next = (at + (key === "tab" ? 1 : -1) + now.controls.length) % now.controls.length;

          focus = now.controls[next]!.key;

          return true;
        }

        if (control === undefined) {
          return false;
        }

        const fire = (event: string, payload?: string | boolean): boolean => {
          const handler = control.events[event];

          if (handler === undefined) {
            return false;
          }

          report(handler, payload);

          return true;
        };

        switch (control.kind) {
          case "button":
            return key === "enter" || key === "space" ? fire("click") : false;
          case "toggle":
            return key === "enter" || key === "space" ? fire("change", control.value !== true) : false;
          case "checkbox":
            return key === "space" || key === "enter" ? fire("change", control.value !== true) : false;
          case "textfield": {
            const value = String(control.value);

            if (key === "enter") {
              return fire("submit");
            }

            if (key === "escape") {
              return fire("cancel");
            }

            const next = key === "backspace" ? value.slice(0, -1) : typeof key === "object" ? value + key.text : key === "space" ? `${value} ` : undefined;

            if (next === undefined) {
              return false;
            }

            typed.set(control.key, next);

            return fire("change", next);
          }
        }
      },
    };
  };
