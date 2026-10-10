import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import type { Wiring } from "../src/wiring.js";
import { locateKey, scan } from "../src/wiring.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const MAIN = `import { defineApp, Schema } from "@valancex/cli";

export default defineApp({
  state: { schema: Schema.Struct({ count: Schema.Number }), initial: { count: 0 } },
  commands: (command) => ({
    bump: command((state) => ({ ...state, count: state.count + 1 })),
  }),
});
`;

const FILES = {
  "content/index.md": PAGE("Home"),
  "src/main.ts": MAIN,
  "src/layout.mprx": '<shell class="x" theme="light">\n  <counter n={count} label="clicks" on.bump={bump()} />\n  <para class="p">{site}</para>\n</shell>\n',
  "src/counter.mprx": '<button class="c" pressed="false" on.click={bump()}>{label}: {n}</button>\n',
};

const wiringOf = async (files: Record<string, string> = FILES): Promise<Wiring> => {
  const root = project(files);

  await build(root);

  return JSON.parse(readFileSync(join(root, ".valance/wiring.json"), "utf8")) as Wiring;
};

describe("reading a template", () => {
  it("finds elements with their attributes (and where each is written) and every name read or called inside braces, strings and member names excluded", () => {
    const text = '<counter n={count} label="a {b} c" on.bump={bump(1, { force: true })}>{user.name} {ok ? yes : no}</counter>';
    const { elements, reads } = scan(text);

    expect(elements[0]!.attributes.map(({ name, string, text: value, at }) => [name, string, value, at])).toEqual([
      ["n", false, "count", text.indexOf("n={")],
      ["label", true, "a {b} c", text.indexOf("label=")],
      ["on.bump", false, "bump(1, { force: true })", text.indexOf("on.bump")],
    ]);
    expect(reads.map((read) => `${read.name}${read.call ? "()" : ""}`)).toEqual(["count", "bump()", "user", "ok", "yes", "no"]);
  });

  it("finds the key a name is declared with, and says top of file when it cannot", () => {
    expect(locateKey(MAIN, "count")).toMatchObject({ file: "src/main.ts", line: 4 });
    expect(locateKey(MAIN, "bump")).toMatchObject({ line: 6 });
    expect(locateKey(MAIN, "missing")).toMatchObject({ line: 1, column: 1 });
  });
});

describe("both ends of each connection", () => {
  it("declares your state and command in src/main.ts, and a component's prop and event where its template first uses them", async () => {
    const { definitions: at } = await wiringOf();

    expect(at["components/layout/scope/count"]).toMatchObject({ file: "src/main.ts", line: 4 });
    expect(at["components/layout/commands/bump"]).toMatchObject({ file: "src/main.ts", line: 6 });
    expect(at["components/counter"]).toMatchObject({ file: "src/counter.mprx", line: 1 });
    expect(at["components/counter/props/n"]).toMatchObject({ file: "src/counter.mprx", line: 1 });
    expect(at["components/counter/events/bump"]).toMatchObject({ file: "src/counter.mprx", line: 1 });
  });

  it("binds a prop to the attribute that passes it and an event to the on.x that handles it: what a click inside the component goes to", async () => {
    const { bindings } = await wiringOf();

    expect(bindings["components/counter/props/n"]).toEqual([{ file: "src/layout.mprx", line: 2, column: 12 }]);
    expect(bindings["components/counter/scope/n"]).toEqual(bindings["components/counter/props/n"]);
    expect(bindings["components/counter/events/bump"]).toEqual([{ file: "src/layout.mprx", line: 2, column: 37 }]);
    expect(bindings["components/counter/commands/bump"]).toEqual(bindings["components/counter/events/bump"]);
  });

  it("describes a component from the inside: each prop with who passes it, each event with who handles it and what it does", async () => {
    const { components } = await wiringOf();
    const counter = components.find((each) => each.name === "counter")!;

    expect(counter.file).toBe("src/counter.mprx");
    expect(counter.props.find((prop) => prop.name === "n")!.passedBy).toEqual([{ at: expect.objectContaining({ file: "src/layout.mprx", line: 2 }), from: "{count}" }]);
    expect(counter.props.find((prop) => prop.name === "label")!.passedBy).toEqual([{ at: expect.objectContaining({ line: 2 }), from: '"clicks"' }]);
    expect(counter.events).toEqual([{ name: "bump", at: expect.objectContaining({ file: "src/counter.mprx", line: 1 }), handledBy: [{ at: expect.objectContaining({ file: "src/layout.mprx", line: 2 }), to: "bump()" }] }]);
  });

  it("records who uses what: the call site, the target, what is passed (with where) and what is done on an event", async () => {
    const { uses, state, commands } = await wiringOf();

    expect(uses).toEqual([{
      at: { file: "src/layout.mprx", line: 2, column: 3 },
      tag: "counter",
      target: { file: "src/counter.mprx", line: 1, column: 1 },
      props: [{ name: "n", from: "{count}", at: { file: "src/layout.mprx", line: 2, column: 12 } }, { name: "label", from: '"clicks"', at: { file: "src/layout.mprx", line: 2, column: 22 } }],
      events: [{ name: "bump", to: "bump()", at: { file: "src/layout.mprx", line: 2, column: 37 } }],
    }]);
    expect(state).toEqual([{ name: "count", source: expect.objectContaining({ line: 4 }), readBy: [expect.objectContaining({ file: "src/layout.mprx", line: 2 })] }]);
    expect(commands).toEqual([{ name: "bump", source: expect.objectContaining({ line: 6 }), runBy: [expect.objectContaining({ file: "src/layout.mprx", line: 2 })] }]);
  });

  it("does not mistake a component's own prop for the application's state of the same spelling", async () => {
    const { state } = await wiringOf({ ...FILES, "src/layout.mprx": '<shell class="x" theme="light"><counter n={count} label="a" on.bump={bump()} /></shell>', "src/counter.mprx": '<button class="c" pressed="false" on.click={bump()}>{label}: {n} {n}</button>' });

    expect(state[0]!.readBy).toHaveLength(1);                      // `count`, in the layout; `n` in counter is a prop
  });

  it("sends the framework's names and the elements to the README that ships with the package, on the line that explains them", async () => {
    const { definitions: at } = await wiringOf();
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8").split("\n");
    const line = (path: string): string => readme[at[path]!.line - 1]!;

    expect(at["components/layout/scope/site"]!.file).toMatch(/README\.md$/);
    expect(line("components/layout/scope/site")).toMatch(/^\| `site`, `home`/);
    expect(line("components/layout/scope/blocks")).toMatch(/^\| `blocks`/);
    expect(line("components/layout/commands/go")).toMatch(/`go` is the framework/);
    expect(line("components/header")).toMatch(/^Tags you may use:/);
    expect(line("components/header/props/class")).toMatch(/^Tags you may use:/);
  });

  it("is written for a project with no main.ts and no components of its own, using the built-in layout", async () => {
    const { state, commands, components, uses } = await wiringOf({ "content/index.md": PAGE("Home") });

    expect(state).toEqual([]);
    expect(commands).toEqual([]);
    expect(components.every((each) => each.file.includes("views/"))).toBe(true);
    expect(uses.every((use) => use.at.file.includes("views/"))).toBe(true);
  });
});
