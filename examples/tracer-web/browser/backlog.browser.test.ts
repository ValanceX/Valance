// Stage 12: can commits outrun presentation, and what does C32 (every committed state is presented, in order) retain while presentation is behind?
// Real Chromium, real PORT target made slow: the target's operations are synchronous (`Target.update(tree): void`), so "slow" is real time spent in each one
// (`spin`), not a delay inside the application. Only semantic and retention facts are asserted; timings are not.
//
// Observed (not asserted): commits do outrun presentation: when the last commit finished, about a third of the presentations had happened (1,000 commits: 330;
// 5,000: 1,663; 20,000: 6,661; with and without a slow target), so the pending presentations are about two thirds of the burst, i.e. proportional to it. Time
// grows linearly (about 0.8 ms per commit and presentation, to 20,000 commits). The main thread gets no timer turn during the commits or the drain.
// Why: `State.values` is Effect's `SubscriptionRef.changes`, backed by `PubSub.unbounded`; each subscriber (each mount) has its own unbounded queue of
// state snapshots, one per commit, which the mount's follower takes one at a time. VALANCE holds no queue of its own.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Valance from "@valancex/valance";
import { Effect, Exit, Scope } from "effect";
import { beforeAll, expect, it } from "vitest";

import { app, label, recording, run } from "./burst-fixture.js";

beforeAll(async () => { await init(wasmUrl); });

const spin = (ms: number): void => { const end = performance.now() + ms; while (performance.now() < end) { /* the target takes real time */ } };

/** A burst of `commits` invokes of `key` in one Effect, against a mount whose every PORT operation takes 1 ms; resolves with what was observed. */
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
  const presentedWhenCommitsDone = log.length;

  while (log.length < commits + 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const settled = { committed: intents.length, log: [...log], presentedWhenCommitsDone, final: label(root), state: await run(handle.state) };

  await new Promise((resolve) => setTimeout(resolve, 50));
  const extra = log.length - settled.log.length;

  await run(Scope.close(scope, Exit.void));
  root.remove();

  return { ...settled, extra };
};

it("commits outrun a slow presentation, and the backlog keeps every snapshot: N commits give N+1 ordered presentations, none dropped, the last at the final state", async () => {
  for (const commits of [10, 100, 1000]) {
    const seen = await burst("app/bump", commits);

    expect(seen.committed).toBe(commits);
    expect(seen.log).toEqual(["draw A0", ...Array.from({ length: commits }, (_, index) => `update A${index + 1}`)]);   // each commit from its own state, in order
    expect(seen.final).toBe(`A${commits}`);
    expect(seen.state).toEqual({ view: "a", n: commits });
    expect(seen.extra).toBe(0);                                                                                     // nothing is presented after the last commit's presentation
    if (commits >= 100) {
      expect(seen.presentedWhenCommitsDone).toBeLessThan(commits + 1);                                              // presentation really was behind when the commits ended
    }
  }
}, 60_000);

it("a view-changing burst retains every intermediate view while behind: A,B,A,B... is drawn in full, each draw from its own commit", async () => {
  const commits = 200;
  const seen = await burst("app/toggle", commits);

  expect(seen.committed).toBe(commits);
  expect(seen.log).toEqual(["draw A0", ...Array.from({ length: commits }, (_, index) => index % 2 === 0 ? "draw B0" : "draw A0")]);   // no view skipped, each a fresh draw
  expect(seen.presentedWhenCommitsDone).toBeLessThan(commits + 1);
  expect(seen.final).toBe("A0");
  expect(seen.state).toEqual({ view: "a", n: 0 });
}, 60_000);
