// `focusFirstInvalid` on the native host: the rise of the count is a `focus` message to the window, after the screen that shows the error, naming the key of the first invalid node.
import { compileProgram } from "@valancex/mesh-compiler";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { serve } from "../src/native.js";
import type { Outbound } from "../src/native.js";

const MANIFEST = {
  version: 1,
  types: {},
  components: {
    column: { props: {}, events: {}, commands: {}, scope: {} },
    textfield: { props: { invalid: { required: true, type: { kind: "boolean" } } }, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    screen: { props: {}, events: {}, commands: { submit: { parameters: [] } }, scope: { first: { kind: "boolean" }, second: { kind: "boolean" } } },
  },
};

const app = async () => {
  const compiled = await compileProgram({
    model: { manifest: JSON.stringify(MANIFEST), path: "components.json" },
    root: "screen",
    components: [
      { component: "screen", source: "<column><textfield invalid={first}/><textfield invalid={second}/><button on.click={submit()}>go</button></column>", path: "screen.mprx" },
    ],
  });

  if (compiled.program === undefined) {
    throw new Error("does not compile");
  }

  return Valance.define({
    name: "form",
    state: { schema: Schema.Struct({ tries: Schema.Number, first: Schema.Boolean, second: Schema.Boolean }), initial: { tries: 0, first: false, second: false } },
    views: {
      screen: { program: compiled.program as never, scope: (state: { readonly first: boolean; readonly second: boolean }) => ({ first: state.first, second: state.second }) },
    },
    view: () => "screen" as const,
    focusFirstInvalid: (state: { readonly tries: number }) => state.tries,
    commands: (state) => ({
      submit: Nexus.Command.define("submit", Schema.Struct({}), () =>
        state.update((current) => Effect.succeed({ ...current, tries: current.tries + 1, second: true })).pipe(Effect.asVoid),
      ),
    }),
  });
};

describe("focusFirstInvalid on the native host", () => {
  it("sends focus naming the first invalid node, after the update that shows it, each time the count rises", async () => {
    const toEngine = new PassThrough();
    const fromEngine = new PassThrough();
    const seen: Array<Outbound> = [];

    createInterface({ input: fromEngine }).on("line", (line) => void seen.push(JSON.parse(line) as Outbound));

    const served = Effect.runPromise(serve(await app(), { input: toEngine, output: fromEngine }));
    const until = async (done: () => boolean) => {
      for (let tries = 0; !done(); tries += 1) {
        if (tries > 400) {
          throw new Error("timed out");
        }

        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    };

    await until(() => seen.some((message) => message.op === "draw"));

    const draw = seen.find((message) => message.op === "draw") as unknown as {
      readonly tree: { readonly root: { readonly children: ReadonlyArray<{ readonly key: string; readonly events: Record<string, string> }> } };
    };
    const [, second, button] = draw.tree.root.children;
    const click = { op: "event", handler: button!.events["click"] };

    toEngine.write(`${JSON.stringify(click)}\n`);
    await until(() => seen.some((message) => message.op === "focus"));
    expect(seen.map((message) => message.op).slice(-2)).toEqual(["update", "focus"]);
    expect(seen.at(-1)).toEqual({ op: "focus", key: second!.key });

    // a second attempt that changes nothing the person sees is asked for again
    toEngine.write(`${JSON.stringify(click)}\n`);
    await until(() => seen.filter((message) => message.op === "focus").length === 2);
    expect(seen.filter((message) => message.op === "focus")).toEqual([
      { op: "focus", key: second!.key },
      { op: "focus", key: second!.key },
    ]);

    toEngine.write(`${JSON.stringify({ op: "close" })}\n`);
    await served;
  });
});
