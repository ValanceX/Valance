// The native host protocol, over a pair of in-memory streams: the application runs behind them, and a stand-in renderer on the other side draws what it is sent and reports what a person does. The
// renderer here is the text target fed from the wire; a native one speaks the same lines.
import { Effect } from "effect";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";

import { application, initial, sample, starting } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import { MAX_HREF, MAX_LINE, parseInbound, PROTOCOL, serve } from "@valancex/valance/native";
import type { Outbound } from "@valancex/valance/native";
import { router } from "../src/routes.js";
import { textTarget } from "../src/text-target.js";
import type { TextTarget } from "../src/text-target.js";

const programs = await compilePrograms();

const until = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

/** A renderer on the far end of the wire. */
const renderer = async (start = initial()) => {
  const toEngine = new PassThrough();
  const fromEngine = new PassThrough();
  const seen: Array<Outbound> = [];
  let screen!: TextTarget;
  const factory = textTarget();
  const send = (message: unknown): void => void toEngine.write(`${JSON.stringify(message)}\n`);

  screen = factory((handler, payload) => send({ op: "event", handler, ...(payload === undefined ? {} : { payload }) }));
  createInterface({ input: fromEngine }).on("line", (line) => {
    const message = JSON.parse(line) as Outbound;

    seen.push(message);
    if (message.op === "draw") {
      screen.draw(message.tree);
    } else if (message.op === "update") {
      screen.update(message.tree);
    } else if (message.op === "unmount") {
      screen.unmount();
    }
  });

  const served = Effect.runPromise(serve(application(programs, start), { input: toEngine, output: fromEngine }, { mayClose: (state) => router.mayLeave(state) }));

  await until(() => seen.some((message) => message.op === "draw"));

  return { seen, screen, send, served, toEngine, close: () => send({ op: "close" }) };
};

describe("the wire", () => {
  it("says hello first, with the protocol and the application, then draws the screen", async () => {
    const r = await renderer(sample());

    expect(r.seen[0]).toEqual({ op: "hello", protocol: PROTOCOL, app: "todo" });
    expect(r.seen[1]!.op).toBe("draw");
    expect(r.screen.screen()).toContain("Groceries (1 of 2 open)");
    r.close();
    await r.served;
  });

  it("carries a person's click and typing to the application, and the new screen back", async () => {
    const r = await renderer(sample());

    r.screen.type("New list", "Errands");
    await until(() => r.seen.some((message) => message.op === "update"));
    r.screen.click("Add list");
    await until(() => r.screen.screen().includes("Errands (0 of 0 open)"));
    r.screen.click("Errands");
    await until(() => r.screen.screen().includes("# Errands"));
    expect(r.seen.filter((message) => message.op === "draw")).toHaveLength(2); // the lists, then the list
    r.close();
    await r.served;
  });

  it("the guard still holds across the wire", async () => {
    const r = await renderer(await starting(sample(), "/lists/l1/items/i1"));

    r.screen.type("What needs doing?", "Oat milk");
    await until(() => r.screen.screen().includes("Unsaved changes"));
    r.screen.click("Back to list");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(r.screen.screen()).toContain("# Edit item");
    r.close();
    await r.served;
  });

  it("ends, and closes the application, when the renderer's stream ends", async () => {
    const r = await renderer();

    r.toEngine.end();
    expect(await r.served).toEqual({ ignored: 0 });
  });

  it("ignores lines that are not messages, and an event for a handler the program does not have", async () => {
    const r = await renderer();

    r.toEngine.write("not json\n");
    r.toEngine.write(`${JSON.stringify({ op: "event", handler: 7 })}\n`);
    r.toEngine.write(`${JSON.stringify({ op: "nonsense" })}\n`);
    r.toEngine.write(`${JSON.stringify({ op: "event", handler: "no-such-handler" })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(r.screen.screen()).toContain("Your lists"); // still running, unchanged
    r.close();
    expect((await r.served).ignored).toBe(3);
  });
});

describe("closing the window", () => {
  it("is allowed when nothing is unsaved: the engine answers, unmounts and ends", async () => {
    const r = await renderer(sample());

    r.send({ op: "closeRequested" });
    expect(await r.served).toEqual({ ignored: 0 });
    expect(r.seen.filter((message) => message.op === "closeAnswer")).toEqual([{ op: "closeAnswer", allowed: true }]);
    expect(r.seen.at(-1)!.op).toBe("unmount");
  });

  it("is refused while an edit is unsaved, and allowed once it is discarded", async () => {
    const r = await renderer(await starting(sample(), "/lists/l1/items/i1"));

    r.screen.type("What needs doing?", "Oat milk");
    await until(() => r.screen.screen().includes("Unsaved changes"));
    r.send({ op: "closeRequested" });
    await until(() => r.seen.some((message) => message.op === "closeAnswer"));
    expect(r.seen.filter((message) => message.op === "closeAnswer")).toEqual([{ op: "closeAnswer", allowed: false }]);
    expect(r.screen.screen()).toContain("Unsaved changes"); // still running

    r.screen.click("Discard");
    await until(() => !r.screen.screen().includes("Unsaved changes"));
    r.send({ op: "closeRequested" });
    expect(await r.served).toEqual({ ignored: 0 });
  });
});

describe("links", () => {
  it("are an address the engine is told, and what it means is the application's", async () => {
    const asked: Array<string> = [];
    const toEngine = new PassThrough();
    const fromEngine = new PassThrough();
    const served = Effect.runPromise(
      serve(application(programs, initial()), { input: toEngine, output: fromEngine }, { onLink: (href) => Effect.sync(() => void asked.push(href)) }),
    );

    toEngine.write(`${JSON.stringify({ op: "link", href: "/lists/l1" })}\n`);
    toEngine.write(`${JSON.stringify({ op: "link", href: "x\ny" })}\n`); // not an address: ignored
    toEngine.write(`${JSON.stringify({ op: "link" })}\n`);
    toEngine.write(`${JSON.stringify({ op: "close" })}\n`);
    expect((await served).ignored).toBe(2);
    expect(asked).toEqual(["/lists/l1"]);
  });

  it("are ignored when the application says nothing about them", async () => {
    const toEngine = new PassThrough();
    const served = Effect.runPromise(serve(application(programs, initial()), { input: toEngine, output: new PassThrough() }));

    toEngine.write(`${JSON.stringify({ op: "link", href: "/anything" })}\n`);
    toEngine.write(`${JSON.stringify({ op: "close" })}\n`);
    expect((await served).ignored).toBe(0);
  });
});

describe("what the engine accepts from a renderer", () => {
  it("takes the three messages, with a payload that is plain data", () => {
    expect(parseInbound('{"op":"ready"}')).toEqual({ op: "ready" });
    expect(parseInbound('{"op":"close"}')).toEqual({ op: "close" });
    expect(parseInbound('{"op":"closeRequested"}')).toEqual({ op: "closeRequested" });
    expect(parseInbound('{"op":"link","href":"/guide/start"}')).toEqual({ op: "link", href: "/guide/start" });
    expect(parseInbound('{"op":"event","handler":"h1","payload":"text"}')).toEqual({ op: "event", handler: "h1", payload: "text" });
    expect(parseInbound('{"op":"event","handler":"h1","payload":{"x":1,"y":[true,null]}}')).toEqual({ op: "event", handler: "h1", payload: { x: 1, y: [true, null] } });
  });

  it("refuses anything else: not JSON, no handler, a handler that is not text, a deep or oversized message", () => {
    for (const line of [
      "",
      "x",
      "[]",
      "null",
      '{"op":"event"}',
      '{"op":"event","handler":3}',
      '{"op":"other"}',
      `{"op":"event","handler":"${"h".repeat(300)}"}`,
      `{"op":"ready","pad":"${"x".repeat(MAX_LINE)}"}`,
    ]) {
      expect(parseInbound(line), line.slice(0, 40)).toBeUndefined();
    }

    expect(parseInbound(`{"op":"link","href":"/${"a".repeat(MAX_HREF)}"}`)).toBeUndefined();
    expect(parseInbound('{"op":"link","href":7}')).toBeUndefined();
    expect(parseInbound(`{"op":"event","handler":"h","payload":${"[".repeat(20)}${"]".repeat(20)}}`)).toBeUndefined();
    expect(parseInbound('{"op":"event","handler":"h","payload":{"__proto__":1}}')).toBeUndefined();
  });
});
