// Tracer: application-declared start-time work (`ApplicationDefinition.start`, a command-table key). The host only calls `start`: it never names the
// command, forks nothing, and owns nothing. No DOM, no Web: the non-DOM text target draws the view; the resource is a gate the test opens.
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Deferred, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { textTarget, type TextTarget } from "./non-dom-target.js";
import { titleProgram } from "./title-program.js";

const State = Schema.Struct({ phase: Schema.Literal("loading", "ready", "failed"), detail: Schema.String });
type State = typeof State.Type;
type Outcome = { readonly _tag: "Ok"; readonly value: string } | { readonly _tag: "Err"; readonly reason: string };

const fakeResource = () => {
  const gate = Effect.runSync(Deferred.make<Outcome>());
  const log: Array<string> = [];

  return {
    log,
    fetch: Effect.suspend(() => {
      log.push("started");

      return Deferred.await(gate).pipe(
        Effect.onInterrupt(() => Effect.sync(() => { log.push("interrupted"); })),
        Effect.tap(() => Effect.sync(() => { log.push("settled"); }))
      );
    }),
    open: (outcome: Outcome) => Effect.runPromise(Deferred.succeed(gate, outcome)),
  };
};

/** `raise`: a rejected operation FAILS the command (uncaught). Otherwise the command catches it into state. */
const app = (resource: ReturnType<typeof fakeResource>, options: { readonly raise?: boolean; readonly start?: string | undefined } = {}) => Valance.define({
  name: "start-work",
  state: { schema: State, initial: { phase: "loading", detail: "" } satisfies State },
  views: { only: { program: titleProgram, scope: (state: State) => ({ title: `${state.phase}${state.detail === "" ? "" : `: ${state.detail}`}` }) } },
  view: () => "only" as const,
  commands: (state: Nexus.State.StateHandle<State>) => ({
    "app/load": Valance.entry(Nexus.Command.define("load", Schema.Struct({}), () => Effect.flatMap(state.get, (current) => current.phase !== "loading" ? Effect.void : resource.fetch.pipe(
      Effect.flatMap((outcome) => outcome._tag === "Err" && options.raise === true
        ? Effect.fail({ _tag: "LoadError" as const, reason: outcome.reason })
        : state.update(() => Effect.succeed<State>(outcome._tag === "Ok" ? { phase: "ready", detail: outcome.value } : { phase: "failed", detail: outcome.reason })))
    )))),
  }),
  ...("start" in options ? (options.start === undefined ? {} : { start: options.start }) : { start: "app/load" }),
});

const wait = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const boot = async (options: Parameters<typeof app>[1] & { readonly state?: State; readonly mount?: boolean } = {}) => {
  const resource = fakeResource();
  const scope = await Effect.runPromise(Scope.make());
  const released: Array<string> = [];

  await Effect.runPromise(Scope.addFinalizer(scope, Effect.sync(() => { released.push("platform resource released"); })));   // before start: runs after NEXUS terminates

  const handle = await Effect.runPromise(Valance.start(app(resource, options), options.state === undefined ? {} : { state: options.state }).pipe(Scope.extend(scope)));   // the host's ONLY act
  let target: TextTarget | undefined;

  if (options.mount !== false) {
    const factory = textTarget();

    await Effect.runPromise(Valance.mount(handle, (report) => (target = factory(report))).pipe(Scope.extend(scope)));
  }

  return { resource, scope, released, handle, close: () => Effect.runPromise(Scope.close(scope, Exit.void)), screen: () => target?.screen() ?? "", state: () => Effect.runPromise(handle.state) };
};

describe("start-time work declared by the application", () => {
  it("1: runs with no invoke by the host; its result reaches state and an already-mounted view", async () => {
    const b = await boot();

    await wait(() => b.resource.log.includes("started"));
    expect(b.screen()).toContain("loading");

    await b.resource.open({ _tag: "Ok", value: "data" });
    await wait(() => b.screen().includes("ready: data"));
    expect(await b.state()).toEqual({ phase: "ready", detail: "data" });
    await b.close();
  });

  it("1b: without any mount it still runs and completes; a mount made afterwards draws the settled state", async () => {
    const b = await boot({ mount: false });

    await wait(() => b.resource.log.includes("started"));
    await b.resource.open({ _tag: "Ok", value: "early" });
    await wait(() => b.resource.log.includes("settled"));
    await expect.poll(async () => (await b.state()).phase).toBe("ready");

    const factory = textTarget();
    let target!: TextTarget;

    await Effect.runPromise(Valance.mount(b.handle, (report) => (target = factory(report))).pipe(Scope.extend(b.scope)));
    expect(target.screen()).toContain("ready: early");
    await b.close();
  });

  it("2: the APPLICATION owns it: no caller, no fork, no external Scope; closing the application interrupts it before the platform resource releases, and a late completion changes nothing", async () => {
    const b = await boot();

    await wait(() => b.resource.log.includes("started"));
    await b.close();

    expect(b.resource.log).toEqual(["started", "interrupted"]);
    expect(b.released).toEqual(["platform resource released"]);

    await b.resource.open({ _tag: "Ok", value: "late" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(b.resource.log).toEqual(["started", "interrupted"]);
    expect(await b.state()).toEqual({ phase: "loading", detail: "" });
  });

  it("2b: closing only a mount leaves the start-time work running", async () => {
    const resource = fakeResource();
    const scope = await Effect.runPromise(Scope.make());
    const mountScope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app(resource)).pipe(Scope.extend(scope)));

    await Effect.runPromise(Valance.mount(handle, textTarget()).pipe(Scope.extend(mountScope)));
    await wait(() => resource.log.includes("started"));
    await Effect.runPromise(Scope.close(mountScope, Exit.void));
    expect(resource.log).toEqual(["started"]);

    await resource.open({ _tag: "Ok", value: "kept" });
    await expect.poll(async () => (await Effect.runPromise(handle.state)).detail).toBe("kept");
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  it("3a: failure caught by the command is ordinary state and view", async () => {
    const b = await boot();

    await wait(() => b.resource.log.includes("started"));
    await b.resource.open({ _tag: "Err", reason: "boom" });
    await wait(() => b.screen().includes("failed: boom"));
    await b.close();
  });

  it("3b: failure NOT caught fails the command and nothing else: its exit is reported nowhere, state is untouched, the application stays healthy", async () => {
    const b = await boot({ raise: true });

    await wait(() => b.resource.log.includes("started"));
    await b.resource.open({ _tag: "Err", reason: "boom" });
    await wait(() => b.resource.log.includes("settled"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(await b.state()).toEqual({ phase: "loading", detail: "" });
    expect(b.screen()).toContain("loading");
    // contrast: the same command through `invoke` reports the same failure to ITS caller (the gate is already open); start-time work has no caller
    const viaInvoke = await Effect.runPromise(Effect.exit(b.handle.invoke("app/load", [])));

    expect(viaInvoke._tag === "Failure" && JSON.stringify(viaInvoke.cause)).toContain("LoadError");
    await b.close();
  });

  it("3c: a start key the table lacks fails `start` with UnmappedCommand and runs nothing", async () => {
    const resource = fakeResource();
    const exit = await Effect.runPromise(Effect.scoped(Effect.exit(Valance.start(app(resource, { start: "app/nope" })))));

    expect(exit._tag === "Failure" && JSON.stringify(exit.cause)).toContain("UnmappedCommand");
    expect(resource.log).toEqual([]);
  });

  it("4: Scope close racing `start` (25 repeats): never runs to completion after close, never touches state, never ends started-but-not-interrupted", async () => {
    for (let run = 0; run < 25; run += 1) {
      const resource = fakeResource();
      const scope = await Effect.runPromise(Scope.make());
      const handle = await Effect.runPromise(Valance.start(app(resource)).pipe(Scope.extend(scope)));

      if (run % 2 === 0) {
        await Promise.resolve();
      }

      await Effect.runPromise(Scope.close(scope, Exit.void));
      await resource.open({ _tag: "Ok", value: "late" });
      await new Promise((resolve) => setTimeout(resolve, 2));

      expect([[], ["started", "interrupted"]]).toContainEqual(resource.log);
      expect(await Effect.runPromise(handle.state)).toEqual({ phase: "loading", detail: "" });
    }
  });

  it("5: the start command sees the state `start` was given (hydration): a settled state starts no work", async () => {
    const b = await boot({ state: { phase: "ready", detail: "from the server" } });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(b.resource.log).toEqual([]);
    expect(b.screen()).toContain("ready: from the server");
    await b.close();
  });

  it("6: without `start` nothing runs: the declaration is optional and the host-invoked form is unchanged", async () => {
    const b = await boot({ start: undefined });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(b.resource.log).toEqual([]);
    await b.close();
  });
});
