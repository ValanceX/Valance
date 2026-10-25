// The third target (K2): the playground's desktop program, rendered by the MESH runtime and drawn by the terminal PORT as text cells. The PORT reports what it cannot draw, moves a focus, and turns key
// presses into the events the tree binds; the handlers it reports mean the application's commands when the runtime is asked.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dispatch } from "@valancex/mesh-runtime";
import { describe, expect, it } from "vitest";

import { DRAWN, paletteOf, terminalTarget } from "@valancex/port-terminal";

import { playground, rendered, root } from "./helpers.js";

const VALUES = {
  name: "Ada",
  tabs: [
    { id: "one", title: "One" },
    { id: "two", title: "Two" },
  ],
  rows: [
    { id: "a", label: "Alpha", detail: "first" },
    { id: "b", label: "Beta", detail: "second" },
  ],
};

const started = async () => {
  const run = await rendered("desktop", VALUES);
  const reported: Array<{ readonly handler: string; readonly payload: unknown }> = [];
  const target = terminalTarget()((handler, payload) => void reported.push({ handler, payload }));

  target.draw(run.tree);

  return { run, target, reported };
};

describe("the terminal PORT draws the library's portable components", () => {
  it("draws every portable component as text, and says nothing it cannot draw", async () => {
    const { target } = await started();
    const screen = target.screen();

    expect(screen.lines).toEqual([
      "Components",
      "==========",
      "Name  [Ada_        ]",
      "[ Details ]",
      "(*) One  ( ) Two",
      "Panel One",
      "- Alpha  first",
      "- Beta  second",
    ]);
    expect(screen.controls.map((each) => `${each.kind}:${each.label}`)).toEqual(["textfield:Name", "button:Details", "toggle:One", "toggle:Two"]);
    expect(screen.limits).toEqual([]);
  });

  it("moves the focus with Tab and Shift+Tab, wrapping, and shows it in reverse video", async () => {
    const { target } = await started();
    const first = target.screen().focus;

    expect(target.press("tab")).toBe(true);
    expect(target.screen().focus).not.toBe(first);
    expect(target.press("shift-tab")).toBe(true);
    expect(target.screen().focus).toBe(first);
    expect(target.press("shift-tab")).toBe(true);
    expect(target.screen().focus).toBe(target.screen().controls.at(-1)!.key);
    expect(target.screen().ansi.join("\n")).toContain("\u001b[7m");
  });

  it("turns typing into the field's change event, with the text so far, and the handler means the application's command", async () => {
    const { run, target, reported } = await started();

    target.press({ text: "!" });
    target.press("backspace");
    target.press({ text: "m" });

    expect(reported.map((each) => each.payload)).toEqual(["Ada!", "Ada", "Adam"]);

    const answer = await dispatch(run, reported[0]!.handler, reported[0]!.payload as string);

    expect(JSON.stringify(answer)).toContain("rename");
    expect(JSON.stringify(answer)).toContain("Ada!");
  });

  it("activates a button and a toggle with Enter or Space, and a toggle reports the value it is going to have", async () => {
    const { target, reported } = await started();

    // the focus starts on the field; Tab reaches the button, whose click Enter reports
    target.press("tab");
    expect(target.press("enter")).toBe(true);
    expect(reported).toHaveLength(1);
    expect(reported[0]!.payload).toBeUndefined();
    // the first toggle is on: Space reports the value it is going to have, off; the second reports on
    target.press("tab");
    expect(target.press("space")).toBe(true);
    expect(reported[1]!.payload).toBe(false);
    target.press("tab");
    expect(target.press("space")).toBe(true);
    expect(reported[2]!.payload).toBe(true);
  });

  it("reports what it cannot draw for a tree written for the web, and draws its content anyway", async () => {
    const web = await rendered("web", VALUES);
    // the web tree of the playground uses only what the PORT draws; one primitive it has no drawing for is named, and its content is still drawn
    const tree = JSON.parse(JSON.stringify(web.tree).replaceAll('"component":"span"', '"component":"image"')) as typeof web.tree;
    const target = terminalTarget()(() => undefined);

    target.draw(web.tree);
    expect(target.screen().limits).toEqual([]);
    target.draw(tree);

    const screen = target.screen();

    expect(screen.limits).toEqual(["image"]);
    expect(screen.lines.join("\n")).toContain("new");
    expect(DRAWN).not.toContain("image");
  });

  it("takes its colors from the token document of whichever theme: the contrast theme's accent is not the plain theme's", async () => {
    const tokens = (theme: string): unknown => JSON.parse(readFileSync(join(root, "packages", theme, "theme", "tokens", "light.tokens.json"), "utf8"));
    const { run } = await started();
    const drawn = (palette: ReturnType<typeof paletteOf>): string => {
      const target = terminalTarget({ palette })(() => undefined);

      target.draw(run.tree);

      return target.screen().ansi.join("\n");
    };

    expect(paletteOf(tokens("theme-plain")).accent).toBe("#4a2fc0");
    expect(paletteOf(tokens("theme-contrast")).accent).toBe("#0000b3");
    expect(drawn(paletteOf(tokens("theme-plain")))).not.toBe(drawn(paletteOf(tokens("theme-contrast"))));
    expect(playground.length).toBeGreaterThan(0);
  });
});
