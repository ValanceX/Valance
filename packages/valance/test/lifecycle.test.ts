// The application's lifecycle as VALANCE has it: one lifetime, the caller's Scope. What an ended application looks like
// WITHOUT a NEXUS handle (the platform's resources, `states` completing, `invoke` refused), and that those signals agree
// with NEXUS's own status. The one early-end route, `Application.shutdown(running.nexus)`, is NEXUS's and is outside the
// VALANCE model (Stage 14: the owner scope is the only lifetime VALANCE has). It is pinned as a substrate fact VALANCE
// tolerates, not as a VALANCE promise.
import * as Nexus from "@valancex/nexus";
import { Cause, Chunk, Effect, Exit, Layer, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";

const State = Schema.Struct({ n: Schema.Number });

const application = Valance.define({
  name: "lifecycle",
  state: { schema: State, initial: { n: 0 } },
  views: { main: { program: { root: "main", templates: [], model: "{}" }, scope: () => ({}) } },
  view: () => "main" as const,
  commands: (state) => ({
    "app/bump": Nexus.Mesh.bind(Nexus.Command.define("t.bump", Schema.Struct({}), () => state.update((current) => Effect.succeed({ n: current.n + 1 })).pipe(Effect.asVoid)), () => ({})),
  }),
});

/** A platform whose one scoped resource counts its acquisition and release: the application's resources, observed. */
const counting = () => {
  const counts = { acquired: 0, released: 0 };
  const platform: Nexus.Application.Platform = Layer.merge(
    Nexus.Capability.EnvironmentLive(new Map()),
    Layer.scopedDiscard(Effect.acquireRelease(Effect.sync(() => { counts.acquired += 1; }), () => Effect.sync(() => { counts.released += 1; })))
  );

  return { counts, platform };
};

/** The application started in a scope the test closes itself. */
const open = async () => {
  const { counts, platform } = counting();
  const scope = await Effect.runPromise(Scope.make());
  const running = await Effect.runPromise(Valance.start(application, { platform }).pipe(Scope.extend(scope)));
  const close = () => Effect.runPromise(Scope.close(scope, Exit.void));
  // `states` is the current state, then every commit, until the application ends: the follower's own signal of an ending.
  const states = Effect.runPromise(Stream.runCollect(running.states).pipe(Effect.map(Chunk.toReadonlyArray)));

  return { running, counts, close, states };
};

const refused = async (running: Valance.Running<{ n: number }, unknown, never>): Promise<boolean> => {
  const exit = await Effect.runPromise(Effect.exit(running.invoke("app/bump", [])));

  return Exit.isFailure(exit) && Cause.isDie(exit.cause);
};

describe("lifecycle: one lifetime, the caller's Scope", () => {
  it("while open, with no NEXUS handle: events are accepted, `states` is live, nothing is released", async () => {
    const { running, counts, close } = await open();
    let ended = false;
    const watcher = Effect.runPromise(Stream.runDrain(running.states)).then(() => { ended = true; });

    await Effect.runPromise(running.invoke("app/bump", []));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await Effect.runPromise(running.state)).toEqual({ n: 1 });
    expect(ended).toBe(false);
    expect(counts).toEqual({ acquired: 1, released: 0 });
    expect(await refused(running)).toBe(false);

    await close();
    await watcher;
  });

  it("closing the scope ends the application, and the ending is observable without a NEXUS handle", async () => {
    const { running, counts, close, states } = await open();

    await Effect.runPromise(running.invoke("app/bump", []));
    await close();

    expect(counts).toEqual({ acquired: 1, released: 1 });                    // the platform's resources, released
    expect((await states).at(-1)).toEqual({ n: 1 });                         // `states` completed normally, ending with the last commit
    expect(await refused(running)).toBe(true);                               // new work is refused as a defect
    expect(await Effect.runPromise(running.state)).toEqual({ n: 1 });       // what the application held stays readable
  });

  it("those signals agree with NEXUS's own status (a NEXUS observation: Running, then Stopped)", async () => {
    const { running, close } = await open();

    expect(await Effect.runPromise(Nexus.Application.status(running.nexus))).toEqual({ _tag: "Running" });
    await close();
    expect(await Effect.runPromise(Nexus.Application.status(running.nexus))).toEqual({ _tag: "Stopped" });
  });

  it("substrate, not a VALANCE promise: NEXUS's shutdown is idempotent and concurrent-safe, releases once, and leaves the scope's own close harmless", async () => {
    const { running, counts, close, states } = await open();

    await Effect.runPromise(Nexus.Application.shutdown(running.nexus));
    await Effect.runPromise(Nexus.Application.shutdown(running.nexus));
    await Effect.runPromise(Effect.all([Nexus.Application.shutdown(running.nexus), Nexus.Application.shutdown(running.nexus)], { concurrency: "unbounded" }));

    // Ended with the scope still open: the same observable ending as a scope close.
    expect(counts).toEqual({ acquired: 1, released: 1 });
    expect((await states).at(-1)).toEqual({ n: 0 });
    expect(await refused(running)).toBe(true);
    expect(await Effect.runPromise(Nexus.Application.status(running.nexus))).toEqual({ _tag: "Stopped" });

    await close();                                                           // the scope closing afterwards: no error, no second release
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });
});
