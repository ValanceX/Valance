// B1 (Tier 1, audit T1.2): `view` may be left out when `views` has exactly one key; it is that key. With more than one key it stays required (a type error).
import { Schema } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ n: Schema.Number });
const view = { program: eventFreeProgram, scope: () => ({}) };
const base = { name: "default-view", state: { schema: State, initial: { n: 0 } }, commands: () => ({}) };

describe("define without `view`", () => {
  it("defaults to the only view", () => {
    const app = Valance.define({ ...base, views: { main: view } });

    expect(app.view({ n: 0 })).toBe("main");
    expectTypeOf(app.view).returns.toEqualTypeOf<"main">();
  });

  it("keeps a `view` that is given", () => {
    const app = Valance.define({ ...base, views: { a: view, b: view }, view: (): "a" | "b" => "b" });

    expect(app.view({ n: 0 })).toBe("b");
  });

  it("requires `view` with more than one view", () => {
    // @ts-expect-error `view` is required when `views` has two keys
    Valance.define({ ...base, views: { a: view, b: view } });
  });
});
