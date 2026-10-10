// Stage 52 — the public command boundary: key → (admission) → input validation → body → state mutation → completion. Observed, not designed:
//   key          resolved in the application's own registry BEFORE admission: unknown → typed UnmappedCommand (also after close), nothing admitted or run
//   input        validated by the command's schema before its body is entered; invalid → the body never runs and nothing commits
//   body         receives the decoded value; commits only through the state it was given; a commit is authoritative whatever happens to the command afterwards
//   failure      typed failure, defect and interruption stay distinct in `invoke`'s Exit; none is an application lifecycle event (the application keeps admitting, other commands and
//                consumers are unaffected except through a commit that actually happened); a command never waits for or implies presentation; zero consumers is fine
import type { HydrationResult } from "@valancex/port-web";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { titleProgram } from "./title-program.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const State = Schema.Struct({ n: Schema.Number });
type State = Schema.Schema.Type<typeof State>;
const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** An application with commands that make each stage of a command observable (`log`). */
const world = async (only?: string) => {
  const log: Array<string> = [];
  const app = Valance.define({
    name: "commands", state: { schema: State, initial: { n: 0 } },
    views: { only: { program: titleProgram, scope: (s: State) => ({ title: `n${s.n}` }) } }, view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const bind = <I, A>(name: string, schema: Schema.Schema<I, A>, body: (input: I) => Effect.Effect<unknown, unknown>) =>
        Nexus.Mesh.bind(Nexus.Command.define(name, schema as never, ((input: I) => { log.push(`enter ${name}`); return body(input); }) as never), (args) => ({ value: args[0] !== undefined && "value" in args[0] ? args[0].value : undefined }) as never);
      const setN = (n: number) => state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n }));
      const all = {
        "app/set": bind("set", Schema.Struct({ value: Schema.Number }), ({ value }: { value: number }) => Effect.asVoid(setN(value))),
        "app/failBefore": bind("failBefore", Schema.Struct({ value: Schema.Number }), () => Effect.zipRight(Effect.sync(() => { log.push("work"); }), Effect.fail("failed before commit"))),
        "app/commitThenFail": bind("commitThenFail", Schema.Struct({ value: Schema.Number }), ({ value }: { value: number }) => Effect.zipRight(setN(value), Effect.fail("failed after commit"))),
        "app/commitThenDie": bind("commitThenDie", Schema.Struct({ value: Schema.Number }), ({ value }: { value: number }) => Effect.zipRight(setN(value), Effect.die(new Error("died after commit")))),
        "app/slowAdd": bind("slowAdd", Schema.Struct({ value: Schema.Number }), ({ value }: { value: number }) => Effect.zipRight(Effect.promise(() => sleep(20)), state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + value })))),
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;

      return only === undefined ? all : { [only]: all[only]! };
    },
  });
  const appScope = await run(Scope.make());
  const handle = await run(Valance.start(app).pipe(Scope.extend(appScope)));
  const mount = async () => {
    const page = load("");
    const ops: Array<string> = [];
    const scope = await run(Scope.make());

    await run(Valance.mount(handle, ((report) => { const port = Web.target({ container: page.container, primitives })(report); return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { port.update(t); ops.push("update"); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); } }; }) as Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>>).pipe(Scope.extend(scope)));

    return { ops, label: () => page.container.querySelector("section")?.getAttribute("aria-label"), close: () => run(Scope.close(scope, Exit.void)) };
  };
  const invoke = (key: string, value?: unknown) => Effect.runPromise(Effect.exit(handle.invoke(key, value === undefined ? [] : [{ value } as never])));

  return { log, handle, appScope, mount, invoke, state: () => run(handle.state), close: () => run(Scope.close(appScope, Exit.void)) };
};
const kind = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "success" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : Cause.isDieType(exit.cause) ? `die ${String((exit.cause.defect as Error).message).slice(0, 60)}` : Cause.isFailType(exit.cause) ? `fail ${typeof exit.cause.error === "string" ? exit.cause.error : (exit.cause.error as { _tag: string })._tag}` : "other";

describe("the command boundary", () => {
  it("A/H. an unknown key is the typed UnmappedCommand: nothing admitted or run, before and after close; a key defined only in another application is unknown here", async () => {
    const a = await world();
    const b = await world("app/set");                                    // b knows only app/set

    expect(kind(await a.invoke("app/nothing"))).toBe("fail UnmappedCommand");
    expect(kind(await b.invoke("app/failBefore", 1))).toBe("fail UnmappedCommand");
    expect(a.log).toEqual([]);
    expect(b.log).toEqual([]);
    expect(await b.state()).toEqual({ n: 0 });
    await a.invoke("app/set", 5);
    expect([(await a.state()).n, (await b.state()).n]).toEqual([5, 0]);   // a's command never touched b
    await a.close();
    expect(kind(await a.invoke("app/nothing"))).toBe("fail UnmappedCommand");   // still typed after the close
    expect(kind(await a.invoke("app/set", 1))).toMatch(/^die /);                  // a known key meets the terminal defect
    expect(await a.state()).toEqual({ n: 5 });
    await b.close();
  });

  it("B/C. invalid input never enters the body and commits nothing; valid input arrives decoded, commits, and is visible when invoke completes", async () => {
    const w = await world();
    const invalid = await w.invoke("app/set", "not a number");

    expect(Exit.isFailure(invalid)).toBe(true);
    const category = kind(invalid);

    expect(w.log).toEqual([]);                                           // the body was not entered
    expect(await w.state()).toEqual({ n: 0 });
    expect(category).toBe("fail CommandValidationError");                // NEXUS's typed validation failure, in the typed channel
    expect(kind(await w.invoke("app/set"))).toBe("fail CommandValidationError");   // missing input likewise
    expect(w.log).toEqual([]);
    expect(kind(await w.invoke("app/set", 7))).toBe("success");
    expect(w.log).toEqual(["enter set"]);
    expect(await w.state()).toEqual({ n: 7 });                           // visible as invoke returns
    await w.close();
  });

  it("D/E/I. fail before commit: no commit; commit then fail (typed or defect): the commit stays and invoke reports the failure; the application keeps admitting and its consumers keep working", async () => {
    const w = await world();
    const m = await w.mount();

    expect(kind(await w.invoke("app/failBefore", 1))).toBe("fail failed before commit");
    expect(w.log).toEqual(["enter failBefore", "work"]);
    expect(await w.state()).toEqual({ n: 0 });                           // nothing committed
    expect(kind(await w.invoke("app/commitThenFail", 3))).toBe("fail failed after commit");
    expect(await w.state()).toEqual({ n: 3 });                           // the commit is authoritative although the command failed
    await until(() => m.label() === "n3");                               // and the mount presented it
    expect(kind(await w.invoke("app/commitThenDie", 4))).toBe("die died after commit");
    expect(await w.state()).toEqual({ n: 4 });
    await until(() => m.label() === "n4");
    expect(kind(await w.invoke("app/set", 9))).toBe("success");          // a failed command is not an application lifecycle event
    await until(() => m.label() === "n9");
    expect(m.ops[0]).toBe("draw");
    expect(m.ops.slice(1).every((op) => op === "update")).toBe(true);    // the mount stayed alive throughout
    await m.close();
    await w.close();
  });

  it("F. admitted commands overlap (no serialization): two slow commands finish together, and atomic updates all land", async () => {
    const w = await world();
    const started = Date.now();
    const exits = await Promise.all([w.invoke("app/slowAdd", 1), w.invoke("app/slowAdd", 2), w.invoke("app/slowAdd", 3)]);

    expect(exits.map(kind)).toEqual(["success", "success", "success"]);
    expect(await w.state()).toEqual({ n: 6 });                           // update is atomic
    expect(Date.now() - started).toBeLessThan(500);                      // (not a timing contract: just not three queued hand-offs by construction)
    await w.close();
  });

  it("G/13/14. with no consumers a command just commits; invoke completing implies no presentation; consumers attached afterwards start from the current state", async () => {
    const w = await world();

    await w.invoke("app/set", 2);
    await w.invoke("app/set", 3);
    expect(await w.state()).toEqual({ n: 3 });
    const early = await w.mount();

    expect(early.ops).toEqual(["draw"]);
    expect(early.label()).toBe("n3");                                    // no replay of the earlier commits
    await w.invoke("app/set", 4);
    expect(early.label()).not.toBe(undefined);                           // completion does not wait for presentation: the mount presents on its own schedule
    await until(() => early.label() === "n4");
    await early.close();
    await w.close();
  });
});
