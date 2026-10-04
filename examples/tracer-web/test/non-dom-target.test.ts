// Tracer: can the unchanged inbox application drive a target with no DOM, through the existing Target/TargetFactory contract and render-v1?
// Nothing under src/ or packages/ changed for this. See ./non-dom-target.ts for the target. Deliberately imports no jsdom and no helpers.ts (which does).
import * as Valance from "@valancex/valance";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { application } from "../src/inbox/app.js";
import { compilePrograms } from "../src/inbox/compile.js";
import { textTarget, type TextTarget } from "./non-dom-target.js";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");
const codeOf = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
const importsOf = (source: string): ReadonlyArray<string> => [...source.matchAll(/^\s*(?:import|export)\b[^;]*?from\s+"([^"]+)"/gms)].map((match) => match[1]!);

const wait = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("tripwire 1: the target is free of DOM and Web", () => {
  const target = read("./non-dom-target.ts");

  it("imports only types, from the two packages the Target contract names", () => {
    expect([...importsOf(target)].sort()).toEqual(["@valancex/mesh-runtime", "@valancex/valance"]);
    expect(codeOf(target).match(/^\s*import\s+(?!type\b).*$/gm)).toBeNull();
  });

  it("mentions no DOM, browser or PORT Web identifier", () => {
    expect(codeOf(target).match(/\b(document|window|jsdom|port-web|HTMLElement|Element|addEventListener|navigator|location|localStorage)\b/g)).toBeNull();
  });

  it("the test runs where no DOM global exists", () => {
    expect(typeof document).toBe("undefined");
    expect(typeof window).toBe("undefined");
  });

  it("the core entry it is driven through (src/index.ts, src/internal.ts) imports no PORT Web", () => {
    const core = [read("../../../packages/valance/src/index.ts"), read("../../../packages/valance/src/internal.ts")].flatMap((source) => importsOf(codeOf(source)));

    expect(core.filter((specifier) => /port-web|jsdom/.test(specifier))).toEqual([]);
  });
});

describe("tripwire 2: the inbox application is the unchanged one", () => {
  it("its source knows no target, and the very same definition also runs on the Web target (test/inbox.test.ts)", () => {
    const source = read("../src/inbox/app.ts");

    expect(source).not.toMatch(/non-dom|text-?target|port-web/i);
  });
});

describe("the unchanged inbox on a target with no DOM", () => {
  it("draw for a view change, update for a same-view change, report → command → state, unmount", async () => {
    const app = application(await compilePrograms());
    const transitions: Array<{ step: string; call: string; open: string; starred: ReadonlyArray<string>; read: ReadonlyArray<string> }> = [];
    let target!: TextTarget;

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app);
      const factory = textTarget();

      yield* Valance.mount(handle, (report) => (target = factory(report)));

      const snapshot = (step: string) => Effect.gen(function* () {
        const state = yield* handle.state;

        transitions.push({
          step,
          call: target.calls.at(-1)!.op,
          open: state.open,
          starred: state.messages.filter((message) => message.starred).map((message) => message.id),
          read: state.messages.filter((message) => message.read).map((message) => message.id),
        });
      });
      const presented = (count: number) => Effect.promise(() => wait(() => target.calls.length >= count));

      yield* snapshot("mounted");

      target.activate("Open", 1);                    // open m2: a different view
      yield* presented(2);
      yield* snapshot("Open m2");

      target.activate("Star");                       // same view, new data
      yield* presented(3);
      yield* snapshot("Star");

      target.activate("Close");                      // back to the list: a different view
      yield* presented(4);
      yield* snapshot("Close");
    })));

    // The application's scope has closed: the mount's unmount ran with it (shared Scope: mounts end first).
    const calls = target.calls;

    console.info(JSON.stringify({
      calls: calls.map(({ op, text }) => ({ op, text })),
      rootKeys: calls.map(({ tree }) => tree?.root.key),
      reports: target.reports,
      transitions,
    }, null, 1));

    expect(calls.map(({ op }) => op)).toEqual(["draw", "draw", "update", "draw", "unmount"]);
    expect(target.reports.map(({ label, event }) => [label, event])).toEqual([["Open", "click"], ["Star off", "click"], ["Close", "click"]]);
    expect(transitions.map(({ step, call, open, starred, read: seen }) => [step, call, open, starred, seen])).toEqual([
      ["mounted", "draw", "", [], []],
      ["Open m2", "draw", "m2", [], ["m2"]],
      ["Star", "update", "m2", ["m2"], ["m2"]],
      ["Close", "draw", "", ["m2"], ["m2"]],
    ]);

    // What each presentation carried, as the target saw it: the screen text is the realization of the render-v1 tree alone.
    expect(calls[0]!.text).toContain("2 unread");
    expect(calls[1]!.text).toContain("Due Friday.");
    expect(calls[2]!.text).toContain("Star on");
    expect(calls[3]!.text).toContain("1 unread");

    // Every tree the target received is a render-v1 tree, unwidened.
    for (const { tree } of calls.filter(({ op }) => op !== "unmount")) {
      expect(Object.keys(tree!).sort()).toEqual(["format", "root", "version"]);
      expect([tree!.format, tree!.version]).toEqual(["mesh-render", 1]);
    }

    // Same program ⇒ same keys: the update's tree shares its root key with the draw before it; the view changes do not.
    expect(calls[2]!.tree!.root.key).toBe(calls[1]!.tree!.root.key);
    expect(calls[1]!.tree!.root.key).not.toBe(calls[0]!.tree!.root.key);
    expect(calls[3]!.tree!.root.key).toBe(calls[0]!.tree!.root.key);
  });
});
