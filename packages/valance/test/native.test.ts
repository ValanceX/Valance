// The native host: `serve` and `run` over in-memory streams, with a stand-in PORT on the far end. The protocol is the Desktop PORT's (github.com/ValanceX/Port, docs/architecture/2026-10-14-port-desktop.md).
import { compileProgram } from "@valancex/mesh-compiler";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import * as Valance from "../src/index.js";
import { MAX_HREF, MAX_LINE, PROTOCOL, parseInbound, run, serve } from "../src/native.js";
import type { Outbound } from "../src/native.js";

const prop = { required: true, type: { kind: "string" } };
const MANIFEST = {
  version: 1,
  types: {},
  components: {
    column: { props: {}, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    screen: { props: {}, events: {}, commands: { bump: { parameters: [] } }, scope: { n: { kind: "number" }, label: prop.type } },
  },
};

const app = async () => {
  const compiled = await compileProgram({
    model: { manifest: JSON.stringify(MANIFEST), path: "components.json" },
    root: "screen",
    components: [{ component: "screen", source: "<column><text>{label}</text><button on.click={bump()}>more</button></column>", path: "screen.mprx" }],
  });

  if (compiled.program === undefined) {
    throw new Error("does not compile");
  }

  return Valance.define({
    name: "counter",
    state: { schema: Schema.Struct({ n: Schema.Number }), initial: { n: 0 } },
    views: { screen: { program: compiled.program as never, scope: (state: { readonly n: number }) => ({ n: state.n, label: `n is ${state.n}` }) } },
    view: () => "screen" as const,
    commands: (state) => ({
      bump: Nexus.Command.define("bump", Schema.Struct({}), () => state.update((current) => Effect.succeed({ n: current.n + 1 })).pipe(Effect.asVoid)),
    }),
  });
};

const wire = () => {
  const toEngine = new PassThrough();
  const fromEngine = new PassThrough();
  const seen: Array<Outbound> = [];

  createInterface({ input: fromEngine }).on("line", (line) => void seen.push(JSON.parse(line) as Outbound));

  return { toEngine, fromEngine, seen, send: (message: unknown) => void toEngine.write(`${JSON.stringify(message)}\n`) };
};

const until = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("Native.serve", () => {
  it("says hello first, then the title and the screen, and updates when a click reaches the application", async () => {
    const w = wire();
    const served = Effect.runPromise(serve(await app(), { input: w.toEngine, output: w.fromEngine }, { titleOf: (state) => `count ${state.n}` }));

    await until(() => w.seen.some((message) => message.op === "draw"));
    expect(w.seen.map((message) => message.op)).toEqual(["hello", "title", "draw"]);
    expect(w.seen[0]).toEqual({ op: "hello", protocol: PROTOCOL, app: "counter" });
    expect(w.seen[1]).toEqual({ op: "title", title: "count 0" });

    const draw = w.seen.find((message) => message.op === "draw") as unknown as { readonly tree: unknown };
    const button = JSON.stringify(draw.tree).match(/"events":\{"click":"([^"]+)"\}/)![1];

    w.send({ op: "event", handler: button });
    await until(() => w.seen.some((message) => message.op === "update"));
    expect(w.seen.filter((message) => message.op === "title")).toEqual([
      { op: "title", title: "count 0" },
      { op: "title", title: "count 1" },
    ]);
    w.send({ op: "close" });
    expect(await served).toEqual({ ignored: 0 });
    expect(w.seen.at(-1)).toEqual({ op: "unmount" });
  });

  it("asks the application before a close, and tells the renderer", async () => {
    const w = wire();
    let allowed = false;
    const served = Effect.runPromise(serve(await app(), { input: w.toEngine, output: w.fromEngine }, { mayClose: () => Effect.sync(() => allowed) }));

    await until(() => w.seen.some((message) => message.op === "draw"));
    w.send({ op: "closeRequested" });
    await until(() => w.seen.some((message) => message.op === "closeAnswer"));
    expect(w.seen.filter((message) => message.op === "closeAnswer")).toEqual([{ op: "closeAnswer", allowed: false }]);
    allowed = true;
    w.send({ op: "closeRequested" });
    expect(await served).toEqual({ ignored: 0 });
    expect(w.seen.filter((message) => message.op === "closeAnswer")).toHaveLength(2);
  });

  it("hands a link's address to the application and nothing else, and ignores what is not a message", async () => {
    const w = wire();
    const asked: Array<string> = [];
    const served = Effect.runPromise(serve(await app(), { input: w.toEngine, output: w.fromEngine }, { onLink: (href) => Effect.sync(() => void asked.push(href)) }));

    await until(() => w.seen.some((message) => message.op === "draw"));
    w.send({ op: "link", href: "/guide" });
    w.toEngine.write("not json\n");
    w.send({ op: "link", href: 7 });
    w.send({ op: "close" });
    expect((await served).ignored).toBe(2);
    expect(asked).toEqual(["/guide"]);
  });
});

describe("Native.run", () => {
  it("runs on the streams it is given, and sends the application's console output to stderr, never to the protocol", async () => {
    const w = wire();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const log = console.log;
    const finished = run(await app(), { streams: { input: w.toEngine, output: w.fromEngine } });

    await until(() => w.seen.some((message) => message.op === "draw"));
    console.log("something the application printed");
    expect(error).toHaveBeenCalledWith("something the application printed");
    expect(w.seen.every((message) => ["hello", "draw", "update", "title", "unmount", "closeAnswer"].includes(message.op))).toBe(true);
    w.send({ op: "close" });
    expect(await finished).toEqual({ ignored: 0 });
    console.log = log;
    error.mockRestore();
  });
});

describe("the window's colors", () => {
  it("asks the window for the appearance the application wants, before the screen and when it changes, and learns the system's colors as the application's own business", async () => {
    const w = wire();
    const told: Array<string> = [];
    const served = Effect.runPromise(
      serve(
        await app(),
        { input: w.toEngine, output: w.fromEngine },
        {
          appearanceOf: (state) => (state.n > 0 ? "dark" : "system"),
          onScheme: (scheme) => Effect.sync(() => void told.push(scheme)),
        },
      ),
    );

    await until(() => w.seen.some((message) => message.op === "draw"));
    expect(w.seen.map((message) => message.op)).toEqual(["hello", "appearance", "draw"]);
    expect(w.seen[1]).toEqual({ op: "appearance", appearance: "system" });

    w.send({ op: "scheme", scheme: "dark" });
    w.send({ op: "scheme", scheme: "purple" });
    w.send({ op: "close" });
    expect((await served).ignored).toBe(1);
    expect(told).toEqual(["dark"]);
  });
});

describe("what the engine accepts from a renderer", () => {
  it("takes the messages of the protocol, with plain data", () => {
    expect(parseInbound('{"op":"ready"}')).toEqual({ op: "ready" });
    expect(parseInbound('{"op":"close"}')).toEqual({ op: "close" });
    expect(parseInbound('{"op":"closeRequested"}')).toEqual({ op: "closeRequested" });
    expect(parseInbound('{"op":"scheme","scheme":"dark"}')).toEqual({ op: "scheme", scheme: "dark" });
    expect(parseInbound('{"op":"link","href":"/guide/start"}')).toEqual({ op: "link", href: "/guide/start" });
    expect(parseInbound('{"op":"event","handler":"h1","payload":{"x":1,"y":[true,null]}}')).toEqual({ op: "event", handler: "h1", payload: { x: 1, y: [true, null] } });
  });

  it("refuses the rest: not JSON, no handler, an address with a control character or too long, a deep or oversized message, a __proto__ key", () => {
    for (const line of [
      "",
      "x",
      "[]",
      "null",
      '{"op":"event"}',
      '{"op":"event","handler":3}',
      '{"op":"other"}',
      '{"op":"link","href":7}',
      '{"op":"link","href":"x\\ny"}',
      `{"op":"link","href":"/${"a".repeat(MAX_HREF)}"}`,
      `{"op":"ready","pad":"${"x".repeat(MAX_LINE)}"}`,
    ]) {
      expect(parseInbound(line), line.slice(0, 40)).toBeUndefined();
    }

    expect(parseInbound(`{"op":"event","handler":"h","payload":${"[".repeat(20)}${"]".repeat(20)}}`)).toBeUndefined();
    expect(parseInbound('{"op":"event","handler":"h","payload":{"__proto__":1}}')).toBeUndefined();
  });
});
