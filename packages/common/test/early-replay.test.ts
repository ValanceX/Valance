// What the page does with the early-input shell's record (decisions H3, H4, H10): once, in order, only at nodes hydration kept, nothing old, no more than twenty. The shell itself is tested in a real
// browser (cli/test/early.test.ts); this is the client's half, against stand-ins for the page's nodes.
import { afterEach, describe, expect, it } from "vitest";

class KeyboardEventStandIn extends Event {
  key: string;

  constructor(type: string, init: { key: string }) {
    super(type);
    this.key = init.key;
  }
}

(globalThis as unknown as { KeyboardEvent: unknown }).KeyboardEvent = KeyboardEventStandIn;

import { earlyModule, EARLY_LIMIT, EARLY_MAX_AGE_MS, replayEarly } from "../src/early-replay.js";

type Fake = {
  isConnected: boolean;
  value?: string;
  click: () => void;
  dispatchEvent: (event: { type: string }) => boolean;
  focus?: () => void;
  setSelectionRange?: (a: number, b: number) => void;
  removeAttribute: (name: string) => void;
};

const log: string[] = [];
const node = (name: string, connected = true): Fake => ({
  isConnected: connected,
  value: "",
  click: () => void log.push(`click ${name}`),
  dispatchEvent: (event) => void log.push(`${event.type} ${name}${event.type === "input" ? ` ${(node_ as Record<string, Fake>)[name]?.value}` : ""}`) ?? true,
  focus: () => void log.push(`focus ${name}`),
  setSelectionRange: (a, b) => void log.push(`caret ${name} ${a}-${b}`),
  removeAttribute: () => void log.push(`unbusy ${name}`),
});
const node_: Record<string, Fake> = {};
const make = (name: string, connected = true): Fake => (node_[name] = node(name, connected));
const container = { contains: (n: Fake) => n.isConnected };
const setShell = (shell: Record<string, unknown>): void => void ((globalThis as unknown as { window: unknown }).window = { __vlx: { q: [], busy: [], on: 1, wasm: 0, ...shell } });
const settle = async (): Promise<void> => void log.push("settled");

afterEach(() => {
  log.length = 0;
  delete (globalThis as { window?: unknown }).window;
});

describe("replayEarly", () => {
  it("restores the text of the fields first, then does the taps in order, waiting for each to settle, and puts the caret back", async () => {
    const field = make("name");
    const add = make("add");
    const pay = make("pay");

    setShell({
      fields: [{ n: field, x: "Ada" }],
      focus: { n: field, s: 1, e: 3 },
      q: [
        { k: "click", n: add, t: 1000 },
        { k: "click", n: pay, t: 1001 },
        { k: "key", n: field, x: "Enter", t: 1002 },
      ],
    });

    const done = await replayEarly(container as never, true, settle, () => 1500);

    expect(log).toEqual(["input name Ada", "settled", "click add", "settled", "click pay", "settled", "keydown name", "settled", "focus name", "caret name 1-3"]);
    expect(done).toEqual({ replayed: 4, dropped: 0 });
  });

  it("does it once: a second call finds nothing", async () => {
    setShell({ q: [{ k: "click", n: make("add"), t: 1000 }] });
    expect((await replayEarly(container as never, true, settle, () => 1001)).replayed).toBe(1);
    expect((await replayEarly(container as never, true, settle, () => 1002)).replayed).toBe(0);
    expect(log.filter((line) => line === "click add")).toHaveLength(1);
  });

  it("drops everything when hydration drew afresh (the nodes the person touched are gone), and a node that is gone", async () => {
    setShell({ q: [{ k: "click", n: make("a"), t: 1000 }], fields: [{ n: make("f"), x: "x" }] });
    expect(await replayEarly(container as never, false, settle, () => 1001)).toEqual({ replayed: 0, dropped: 2 });
    setShell({
      q: [
        { k: "click", n: make("gone", false), t: 1000 },
        { k: "click", n: make("kept"), t: 1000 },
      ],
    });
    expect(await replayEarly(container as never, true, settle, () => 1001)).toEqual({ replayed: 1, dropped: 1 });
    expect(log).not.toContain("click gone");
  });

  it("drops what is older than ten seconds, and replays no more than twenty", async () => {
    setShell({
      q: [
        { k: "click", n: make("old"), t: 0 },
        { k: "click", n: make("new"), t: EARLY_MAX_AGE_MS + 1 },
      ],
    });
    expect(await replayEarly(container as never, true, settle, () => EARLY_MAX_AGE_MS + 5)).toEqual({ replayed: 1, dropped: 1 });
    setShell({ q: Array.from({ length: 25 }, (_, index) => ({ k: "click", n: make(`n${index}`), t: 1000 })) });
    expect(await replayEarly(container as never, true, settle, () => 1001)).toEqual({ replayed: EARLY_LIMIT, dropped: 5 });
  });

  it("does nothing on a page that has no shell, and the module is the shell's only when it compiled", async () => {
    (globalThis as unknown as { window: unknown }).window = {};
    expect(await replayEarly(container as never, true, settle)).toEqual({ replayed: 0, dropped: 0 });
    expect(await earlyModule()).toBeUndefined();
    setShell({ wasm: Promise.resolve(undefined) });
    expect(await earlyModule()).toBeUndefined();
  });
});
