// Stage 12/16: commits outrun a slow presentation, and a mount presents the LATEST state instead of working through a backlog. Real Chromium, real PORT target made
// slow: the target's operations are synchronous (`Target.update(tree): void`), so "slow" is real time spent in each one (`spin`), not a delay inside the application.
//
// Observed before the mount-side change (Stage 12): about two thirds of a burst was pending when the commits ended, one retained snapshot per commit in the
// subscription's unbounded queue, and every one was presented in order (20,000 commits: 16 s, the main thread held throughout). Now a mount reads the latest state when
// it wakes and drops a state it has already presented, so the work done is bounded by what the mount can present, not by the number of commits.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Valance from "@valancex/valance";
import { Effect, Exit, Scope } from "effect";
import { beforeAll, expect, it } from "vitest";

import { app, label, recording, run } from "./burst-fixture.js";

beforeAll(async () => { await init(wasmUrl); });

const spin = (ms: number): void => { const end = performance.now() + ms; while (performance.now() < end) { /* the target takes real time */ } };

/** A burst of `commits` invokes of `key` in one Effect, against a mount whose every PORT operation takes 1 ms. */
const burst = async (key: "app/bump" | "app/toggle", commits: number) => {
  const root = document.createElement("main");

  document.body.append(root);
  const timeline: Array<string> = [];
  const { definition, intents } = app(timeline);
  const scope = await run(Scope.make());
  const handle = await run(Valance.start(definition).pipe(Scope.extend(scope)));
  const log: Array<string> = [];

  await run(Valance.mount(handle, recording(root, log, timeline, 0, () => { spin(1); })).pipe(Scope.extend(scope)));
  await run(Effect.forEach(Array.from({ length: commits }), () => handle.invoke(key, []), { discard: true }));
  const deadline = performance.now() + 20_000;
  const expectedLabel = key === "app/bump" ? `A${commits}` : commits % 2 === 0 ? "A0" : "B0";

  while (label(root) !== expectedLabel && performance.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  const result = { committed: intents.length, log: [...log], final: label(root), state: await run(handle.state) };

  await run(Scope.close(scope, Exit.void));
  root.remove();

  return result;
};

it("commits outrun a slow presentation, and the mount presents the latest state: far fewer presentations than commits, in order, the last at the final state", async () => {
  for (const commits of [100, 1000]) {
    const seen = await burst("app/bump", commits);

    expect(seen.committed).toBe(commits);                                                          // the application committed every one
    expect(seen.state).toEqual({ view: "a", n: commits });
    expect(seen.final).toBe(`A${commits}`);
    expect(seen.log[0]).toBe("draw A0");
    expect(seen.log.at(-1)).toBe(`update A${commits}`);                                            // the last presentation is the last committed state
    expect(seen.log.length).toBeLessThan(commits + 1);                                             // the backlog is not worked through
    const numbers = seen.log.slice(1).map((entry) => Number(entry.replace("update A", "")));

    expect(numbers.every((value, index) => index === 0 || value > numbers[index - 1]!)).toBe(true);   // never reordered, never repeated
  }
}, 60_000);

it("a view-changing burst converges too: the final view is presented, and continuity follows the PRESENTED sequence (same view as the one drawn: update; another: draw)", async () => {
  const commits = 200;
  const seen = await burst("app/toggle", commits);

  expect(seen.committed).toBe(commits);
  expect(seen.final).toBe("A0");                                                                   // 200 toggles end on A
  expect(seen.state).toEqual({ view: "a", n: 0 });
  expect(seen.log.at(-1)).toMatch(/A0$/);
  expect(seen.log.length).toBeLessThan(commits + 1);
  expect(seen.log[0]).toBe("draw A0");

  for (let index = 1; index < seen.log.length; index += 1) {
    const [operation, shown] = seen.log[index]!.split(" ");
    const [, before] = seen.log[index - 1]!.split(" ");

    expect(operation).toBe(shown![0] === before![0] ? "update" : "draw");                          // a skipped intermediate view makes the neighbours the same view: an update
  }
}, 60_000);
