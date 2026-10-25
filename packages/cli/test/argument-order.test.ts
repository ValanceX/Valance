// B3 (audit I2): a bare command takes an event's arguments by position, in its input struct's field order. `vlx check` warns (`command-argument-order`) where a template passes
// arguments whose names say otherwise; the binding stays positional, and a warning does not fail the check.
import { afterEach, describe, expect, it, vi } from "vitest";

import { check } from "../src/check.js";
import { main } from "../src/cli.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MAIN = `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";

export default defineApp({
  layout: component(layout),
  state: { from: field(Schema.String, "a"), to: field(Schema.String, "b") },
  commands: (command) => ({
    move: command(Schema.Struct({ from: Schema.String, to: Schema.String }), ({ from, to }, state) => ({ ...state, from: to, to: from })),
  }),
});
`;

const app = (call: string): string =>
  project({
    "content/index.md": PAGE(),
    "src/main.ts": MAIN,
    "src/layout.mprx": `<shell class="x" theme="light">\n<button class="b" pressed="false" on.click={${call}}>go</button>\n</shell>`,
  });

describe("command-argument-order", () => {
  it("warns where an argument's name is another field's, at the handler", async () => {
    const found = (await check(app("move(to, from)"))).diagnostics;

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "src/layout.mprx", line: 2, code: "command-argument-order", severity: "warning" });
    expect(found[0]!.message).toContain("move(from, to)");
  });

  it("does not warn when the names are the fields in order, or an argument has no name", async () => {
    expect((await check(app("move(from, to)"))).diagnostics).toEqual([]);
    expect((await check(app('move("a", "b")'))).diagnostics).toEqual([]);
  });

  it("is a warning: `vlx check` prints it and still succeeds", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(await main(["check"], app("move(to, from)"))).toBe(0);
    expect(errors.mock.calls.flat().join("\n")).toContain("warning command-argument-order");
  });
});
