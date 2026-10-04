// Tracer: can an application own an asynchronous resource lifecycle (loading -> success | failure | cancelled) with the primitives 0.3.0 already has?
// The operation is started by the HOST forking `handle.invoke` into a Scope (the application definition has no start hook, and this tracer adds none).
// No DOM, no Web, no PORT: the view is drawn by the non-DOM text target. The fake resource is a gate the test opens; it records its own interruption.
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Deferred, Effect, Exit, Fiber, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { textTarget, type TextTarget } from "./non-dom-target.js";
import { titleProgram } from "./title-program.js";

const State = Schema.Struct({ phase: Schema.Literal("loading", "ready", "failed"), detail: Schema.String });
type State = typeof State.Type;

type Outcome = { readonly _tag: "Ok"; readonly value: string } | { readonly _tag: "Err"; readonly reason: string };

/** A deterministic fake resource: `fetch` suspends on a gate, and records that it started, was interrupted, or settled. */
const fakeResource = () => {
  const gate = Effect.runSync(Deferred.make<Outcome>());
  const log: Array<string> = [];

  return {
    gate,
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

const app = (resource: ReturnType<typeof fakeResource>) => Valance.define({
  name: "async-owner",
  state: { schema: State, initial: { phase: "loading", detail: "" } satisfies State },
  views: { only: { program: titleProgram, scope: (state: State) => ({ title: `${state.phase}${state.detail === "" ? "" : `: ${state.detail}`}` }) } },
  view: () => "only" as const,
  commands: (state: Nexus.State.StateHandle<State>) => ({
    // A failure of the resource becomes ordinary state inside the command; nothing else is needed for it to be application-visible.
    "app/load": Valance.entry(Nexus.Command.define("load", Schema.Struct({}), () => resource.fetch.pipe(
      Effect.flatMap((outcome) => state.update(() => Effect.succeed<State>(outcome._tag === "Ok" ? { phase: "ready", detail: outcome.value } : { phase: "failed", detail: outcome.reason })))
    ))),
  }),
});

const wait = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const boot = async (options: { readonly mount?: boolean } = {}) => {
  const resource = fakeResource();
  const scope = await Effect.runPromise(Scope.make());
  const released: Array<string> = [];

  await Effect.runPromise(Scope.addFinalizer(scope, Effect.sync(() => { released.push("platform resource released"); })));   // registered before start: runs after NEXUS terminates

  const handle = await Effect.runPromise(Valance.start(app(resource)).pipe(Scope.extend(scope)));
  let target: TextTarget | undefined;

  if (options.mount !== false) {
    const factory = textTarget();

    await Effect.runPromise(Valance.mount(handle, (report) => (target = factory(report))).pipe(Scope.extend(scope)));
  }

  // The host's only act: start the application's own command. The caller's fiber is a child of the SCOPE, not of any mount or page.
  const load = Effect.runPromise(Effect.forkIn(Effect.exit(handle.invoke("app/load", [])), scope));

  return { resource, scope, released, handle, load, screen: () => target?.screen() ?? "", state: () => Effect.runPromise(handle.state) };
};

describe("an application-owned async operation, started by the host into the application's Scope", () => {
  it("1+2: loading is the initial state and is drawn; the operation started; success reaches state and the view", async () => {
    const b = await boot();

    await wait(() => b.resource.log.includes("started"));
    expect(b.screen()).toContain("loading");
    expect(await b.state()).toEqual({ phase: "loading", detail: "" });

    await b.resource.open({ _tag: "Ok", value: "data" });
    await wait(() => b.screen().includes("ready: data"));
    expect(Exit.isSuccess(await Effect.runPromise(Fiber.await(await b.load)))).toBe(true);
    expect(await b.state()).toEqual({ phase: "ready", detail: "data" });

    await Effect.runPromise(Scope.close(b.scope, Exit.void));
  });

  it("3: a rejected operation is application state and a view, deterministically; the command itself still succeeds", async () => {
    const b = await boot();

    await wait(() => b.resource.log.includes("started"));
    await b.resource.open({ _tag: "Err", reason: "boom" });
    await wait(() => b.screen().includes("failed: boom"));
    expect(Exit.isSuccess(await Effect.runPromise(Fiber.await(await b.load)))).toBe(true);

    await Effect.runPromise(Scope.close(b.scope, Exit.void));
  });

  it("4: closing the Scope while pending interrupts the operation BEFORE the platform resource releases; a later completion changes nothing", async () => {
    const b = await boot();

    await wait(() => b.resource.log.includes("started"));
    await Effect.runPromise(Scope.close(b.scope, Exit.void));

    expect(b.resource.log).toEqual(["started", "interrupted"]);
    expect(b.released).toEqual(["platform resource released"]);
    expect(Exit.isInterrupted(await Effect.runPromise(Fiber.await(await b.load)))).toBe(true);

    await b.resource.open({ _tag: "Ok", value: "late" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(b.resource.log).toEqual(["started", "interrupted"]);                                  // nothing settled
    expect(await b.state()).toEqual({ phase: "loading", detail: "" });                           // the last state stays readable and unchanged
    expect(b.screen()).toBe("");                                                                  // the mount closed with the Scope
  });

  it("5: the operation does not depend on a mount: it completes with none, and a mount made afterwards draws the settled state at once", async () => {
    const b = await boot({ mount: false });

    await wait(() => b.resource.log.includes("started"));
    await b.resource.open({ _tag: "Ok", value: "early" });
    await Effect.runPromise(Fiber.await(await b.load));

    const factory = textTarget();
    let target!: TextTarget;

    await Effect.runPromise(Valance.mount(b.handle, (report) => (target = factory(report))).pipe(Scope.extend(b.scope)));
    expect(target.calls.map((call) => call.op)).toEqual(["draw"]);
    expect(target.screen()).toContain("ready: early");

    await Effect.runPromise(Scope.close(b.scope, Exit.void));
  });

  it("6: closing only the MOUNT leaves the operation running: the mount does not own it", async () => {
    const resource = fakeResource();
    const scope = await Effect.runPromise(Scope.make());
    const mountScope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app(resource)).pipe(Scope.extend(scope)));

    await Effect.runPromise(Valance.mount(handle, textTarget()).pipe(Scope.extend(mountScope)));

    const load = Effect.runPromise(Effect.forkIn(Effect.exit(handle.invoke("app/load", [])), scope));

    await wait(() => resource.log.includes("started"));
    await Effect.runPromise(Scope.close(mountScope, Exit.void));
    expect(resource.log).toEqual(["started"]);

    await resource.open({ _tag: "Ok", value: "kept" });
    await Effect.runPromise(Fiber.await(await load));
    expect(await Effect.runPromise(handle.state)).toEqual({ phase: "ready", detail: "kept" });

    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  it("7: ownership is the application's, not the caller's: a caller fiber that NO Scope owns is still interrupted by the application's close, before the resource releases", async () => {
    const resource = fakeResource();
    const scope = await Effect.runPromise(Scope.make());
    const released: Array<string> = [];

    await Effect.runPromise(Scope.addFinalizer(scope, Effect.sync(() => { released.push("platform resource released"); })));

    const handle = await Effect.runPromise(Valance.start(app(resource)).pipe(Scope.extend(scope)));
    const orphan = Effect.runFork(Effect.exit(handle.invoke("app/load", [])));            // owned by nothing: not the Scope, not a mount

    await wait(() => resource.log.includes("started"));
    await Effect.runPromise(Scope.close(scope, Exit.void));

    expect(resource.log).toEqual(["started", "interrupted"]);
    expect(released).toEqual(["platform resource released"]);
    expect(Exit.isInterrupted(await Effect.runPromise(Fiber.join(orphan)))).toBe(true);
  });
});
