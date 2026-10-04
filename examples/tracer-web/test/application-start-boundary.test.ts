// Stage 50 — `start`: one application lifetime for the caller's Scope, ready for state/invoke/mount/hydrate/history once it returns, and nothing else.
//   success    the handle is returned only when the state exists and commands are admitted; start does no presentation, URL or consumer work
//   failure    a typed `StartError` (invalid initial state: InitialValueInvalid; platform: ServiceGraphFailed) and NO handle, so nothing can be admitted or committed; what had already been
//              acquired (the platform's resources) belongs to the caller's Scope and is released when it closes (no rollback machinery, no restart)
//   closed Scope, or the Scope closing during startup   `start` dies with the runtime's terminal defect ("NEXUS: the runtime has begun terminating"): no live application; whatever the
//              platform acquired is released (not left to a later close); the caller's close settles cleanly
//   two applications   are two `start`s over two Scopes and share nothing
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Cause, Effect, Exit, Layer, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { titleProgram } from "./title-program.js";
import { boot, sleep } from "./structure-fixture.js";

const State = Schema.Struct({ n: Schema.Number });
type State = Schema.Schema.Type<typeof State>;
const renders: Array<number> = [];
const app = Valance.define({
  name: "start", state: { schema: State, initial: { n: 0 } },
  views: { only: { program: titleProgram, scope: (s: State) => { renders.push(s.n); return { title: `n${s.n}` }; } } }, view: () => "only" as const,
  commands: (state: Nexus.State.StateHandle<State>) => ({
    "app/bump": Nexus.Mesh.bind(Nexus.Command.define("s.bump", Schema.Struct({}), () => Effect.asVoid(state.update((c): Effect.Effect<State> => Effect.succeed({ n: c.n + 1 })))), () => ({})),
  }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
});
const shape = (e: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(e) ? "success" : Cause.isInterruptedOnly(e.cause) ? "interrupted" : Cause.isDieType(e.cause) ? `died ${(e.cause.defect as Error).message}` : Cause.isFailType(e.cause) ? `failed ${(e.cause.error as { _tag: string })._tag}` : "other";
const closeScope = (scope: Scope.CloseableScope) => Effect.runPromise(Scope.close(scope, Exit.void));
/** A platform that counts what it acquired and released; `gate` holds its acquisition open. */
const platform = (gate?: Promise<void>) => {
  const counts = { acquired: 0, released: 0 };
  const layer: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.map(
    Effect.acquireRelease(Effect.promise(async () => { counts.acquired += 1; await gate; return 1; }), () => Effect.sync(() => { counts.released += 1; })),
    () => ({ resolutions: new Map() })
  ));

  return { counts, layer };
};
const starting = (scope: Scope.CloseableScope, options: Parameters<typeof Valance.start<State, never, never, "only">>[1] = {}) => Effect.runPromise(Effect.exit(Valance.start(app, options).pipe(Scope.extend(scope))));

describe("start", () => {
  it("A/G. a successful start returns a ready application and does nothing else: state readable, commands commit, no render, no consumer; it closes cleanly with its state still readable", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const before = renders.length;
    const exit = await starting(scope);

    expect(Exit.isSuccess(exit)).toBe(true);
    const handle = (exit as Exit.Success<Valance.ApplicationHandle<State, never>, unknown>).value;

    expect(await Effect.runPromise(handle.state)).toEqual({ n: 0 });
    await Effect.runPromise(handle.invoke("app/bump", []));
    expect(await Effect.runPromise(handle.state)).toEqual({ n: 1 });
    await sleep(30);
    expect(renders.length).toBe(before);                                 // no presentation work: MESH was never asked to render
    await closeScope(scope);
    expect(await Effect.runPromise(handle.state)).toEqual({ n: 1 });
  });

  it("B. an invalid initial state fails with the typed InitialValueInvalid and no handle; the platform resource it had acquired is released with the caller's Scope, not before", async () => {
    const { counts, layer } = platform();
    const scope = await Effect.runPromise(Scope.make());
    const before = renders.length;
    const exit = await starting(scope, { platform: layer, state: { n: "x" } as never });

    expect(shape(exit)).toBe("failed InitialValueInvalid");
    expect(counts).toEqual({ acquired: 1, released: 0 });                // held by the caller's Scope: no rollback machinery
    await closeScope(scope);
    expect(counts).toEqual({ acquired: 1, released: 1 });
    expect(renders.length).toBe(before);
  });

  it("C. a caller Scope that is already closed cannot produce a live application: start dies with the terminal defect and nothing the platform acquired survives", async () => {
    const { counts, layer } = platform();
    const scope = await Effect.runPromise(Scope.make());

    await closeScope(scope);
    const exit = await starting(scope, { platform: layer });

    expect(shape(exit)).toBe("died NEXUS: the runtime has begun terminating");
    expect(counts.acquired).toBe(counts.released);                       // released, not left to a close that already happened
  });

  it("D. the caller's Scope closing while the platform is still starting: start ends with the same terminal defect, no application, the resource is released, the close settles cleanly", async () => {
    for (let round = 0; round < 3; round += 1) {
      let open!: () => void;
      const { counts, layer } = platform(new Promise<void>((resolve) => { open = resolve; }));
      const scope = await Effect.runPromise(Scope.make());
      const pending = starting(scope, { platform: layer });

      await sleep(30);
      const closing = closeScope(scope);

      await sleep(30);
      open();
      const exit = await Promise.race([pending, sleep(1000).then(() => "hung" as const)]);

      await closing;
      expect(exit).not.toBe("hung");
      expect(shape(exit as Exit.Exit<unknown, unknown>)).toBe("died NEXUS: the runtime has begun terminating");
      expect(counts).toEqual({ acquired: 1, released: 1 });
    }
  });

  it("E. a platform that fails to initialize fails start with the typed ServiceGraphFailed and no handle", async () => {
    const failing: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.fail("platform boom") as never);
    const scope = await Effect.runPromise(Scope.make());
    const exit = await starting(scope, { platform: failing });

    expect(shape(exit)).toBe("failed ServiceGraphFailed");
    await closeScope(scope);                                             // and the Scope closes cleanly
  });

  it("F. two applications are two starts over two Scopes: independent state, commands and lifetime", async () => {
    const one = await boot();
    const two = await boot();

    await one.invoke("app/bump");
    await one.invoke("app/bump");
    await two.invoke("app/bump");
    expect([(await one.state()).n, (await two.state()).n]).toEqual([2, 1]);
    await Effect.runPromise(Scope.close(one.appScope, Exit.void));
    await two.invoke("app/bump");                                        // the other lives on
    expect((await two.state()).n).toBe(2);
    expect((await one.state()).n).toBe(2);                               // and the closed one stays readable
    const refused = await Effect.runPromise(Effect.exit(one.rawInvoke("app/bump")));

    expect(Exit.isFailure(refused)).toBe(true);
    await Effect.runPromise(Scope.close(two.appScope, Exit.void));
  });
});
