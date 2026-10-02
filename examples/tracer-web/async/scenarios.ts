// The async ownership tracer's scenarios, written once and run by both drivers (jsdom, Chromium).
// A scenario starts the application and drives it through the real Valance path; it returns what was observed.
// It asserts nothing: the tests do.
import type { Mesh } from "@valancex/nexus";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Effect, Exit, Stream } from "effect";

import { application } from "./app.js";
import { controlledPlatform, recording, watch } from "./harness.js";
import type { Counts, Operation } from "./harness.js";

/** What differs between jsdom and Chromium: where the page lives, and how a button is really pressed. */
export interface Driver {
  readonly program: Mesh.Program;
  readonly container: Element;
  readonly press: (index: number) => Promise<void>;
}

export const LOAD = 0;
export const TICK = 1;

const spans = (container: Element): ReadonlyArray<string> => Array.from(container.querySelectorAll("span")).map((span) => span.textContent ?? "");
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits, boundedly and in real time, for a condition a background render produces. */
const until = async (what: string, done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error(`timed out waiting for: ${what}`);
    }

    await sleep(5);
  }
};

const summarize = (exit: Valance.DispatchExit<unknown>): string => Exit.isSuccess(exit) ? "success" : Exit.isInterrupted(exit) ? "interrupted" : `failure ${JSON.stringify(exit.cause)}`;

export interface Step {
  readonly step: string;
  readonly dom: ReadonlyArray<string>;
  readonly operations: ReadonlyArray<Operation>;
  readonly states: ReadonlyArray<string>;
  readonly seen: ReadonlyArray<string>;
  readonly pending: number;
  readonly counts: Counts;
  readonly status: string;
  readonly root: Element | null;
}

/** Everything observable, at one moment. */
const instrument = (driver: Driver) => {
  const seen: Array<string> = [];
  const operations: Array<Operation> = [];
  const states: Array<string> = [];
  const platform = controlledPlatform();
  const app = application(driver.program, seen);

  return { seen, operations, states, platform, app };
};

const loaded = (driver: Driver) => (): boolean => spans(driver.container)[0] === "status: loaded";
const loading = (driver: Driver) => (): boolean => spans(driver.container)[0] === "status: loading";

/**
 * T1 and T2: idle → a real click starts work → `loading` is drawn while the capability is still pending →
 * the capability completes from outside → `loaded` is drawn → the application is still Running → a second,
 * synchronous event works.
 */
export const deferredCompletion = async (driver: Driver) => {
  const { seen, operations, states, platform, app } = instrument(driver);
  const steps: Array<Step> = [];

  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const running = yield* Valance.start(app, { platform: platform.platform });

    yield* Stream.runForEach(running.states, (state) => Effect.sync(() => { states.push(`${state.status}/${state.ticks}`); })).pipe(Effect.forkScoped);

    const mounted = yield* Valance.mount(running, recording(driver.container, operations));
    const observe = (step: string) => Effect.gen(function* () {
      const status = yield* Nexus.Application.status(running.nexus);
      steps.push({ step, dom: spans(driver.container), operations: [...operations], states: [...states], seen: [...seen], pending: platform.pending(), counts: { ...platform.counts }, status: status._tag, root: driver.container.firstElementChild });
    });

    yield* observe("started");
    yield* Effect.promise(() => driver.press(LOAD));
    yield* Effect.promise(() => until("loading", loading(driver)));
    yield* observe("loading");

    // The completion comes from outside the application's runtime, after the click returned.
    platform.resolve("payload");
    yield* Effect.promise(() => until("loaded", loaded(driver)));
    yield* observe("loaded");

    yield* Effect.promise(() => driver.press(TICK));
    yield* Effect.promise(() => until("ticks: 1", () => spans(driver.container)[2] === "ticks: 1"));
    yield* mounted.settled;
    yield* observe("tick");

    return { steps, dispatched: mounted.dispatched.map(summarize) };
  })));
};

/**
 * T3: the same flow with the capability failing. The handler does not catch. This only records what the
 * existing machinery does: it designs and assumes nothing.
 */
export const failure = async (driver: Driver) => {
  const { seen, operations, states, platform, app } = instrument(driver);
  const watching = watch();
  const steps: Array<Step> = [];

  try {
    return await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app, { platform: platform.platform });

      yield* Stream.runForEach(running.states, (state) => Effect.sync(() => { states.push(`${state.status}/${state.ticks}`); })).pipe(Effect.forkScoped);

      const mounted = yield* Valance.mount(running, recording(driver.container, operations));
      const observe = (step: string) => Effect.gen(function* () {
        const status = yield* Nexus.Application.status(running.nexus);
        steps.push({ step, dom: spans(driver.container), operations: [...operations], states: [...states], seen: [...seen], pending: platform.pending(), counts: { ...platform.counts }, status: status._tag, root: driver.container.firstElementChild });
      });

      yield* Effect.promise(() => driver.press(LOAD));
      yield* Effect.promise(() => until("loading", loading(driver)));
      yield* observe("loading");

      platform.reject();
      yield* mounted.settled;
      yield* Effect.promise(() => sleep(50));
      yield* observe("rejected");

      // Does one failed event end the application, or the ability to handle the next one?
      yield* Effect.promise(() => driver.press(TICK));
      yield* Effect.promise(() => until("ticks: 1", () => spans(driver.container)[2] === "ticks: 1"));
      yield* mounted.settled;
      yield* observe("tick after failure");

      return { steps, dispatched: mounted.dispatched.map(summarize), followed: "pending until the scope closes" };
    })).pipe(Effect.tap(() => Effect.promise(() => sleep(20)))).pipe(Effect.map((result) => ({ ...result, logged: [...watching.logged], unhandled: [...watching.unhandled] }))));
  } finally {
    watching.stop();
  }
};

export type Completion = "resolve" | "reject";

/**
 * T4: start → work started → `loading` verified → the caller's scope closes before completion → the capability
 * then completes (or fails) from outside → real scheduler turns pass → nothing may have happened since the close.
 */
export const closure = async (driver: Driver, completion: Completion) => {
  const { seen, operations, states, platform, app } = instrument(driver);
  const watching = watch();
  const emissions = { count: 0 };

  try {
    const held = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app, { platform: platform.platform });

      yield* Stream.runForEach(running.states, (state) => Effect.sync(() => { emissions.count += 1; states.push(`${state.status}/${state.ticks}`); })).pipe(Effect.forkScoped);

      const mounted = yield* Valance.mount(running, recording(driver.container, operations));

      yield* Effect.promise(() => driver.press(LOAD));
      yield* Effect.promise(() => until("loading", loading(driver)));

      return { running, mounted, loadingStates: [...states], loadingSeen: [...seen], loadingOperations: [...operations], pendingWhileLoading: platform.pending() };
    })));

    const snapshot = async (step: string) => ({
      step,
      status: (await Effect.runPromise(Nexus.Application.status(held.running.nexus)))._tag,
      state: await Effect.runPromise(held.running.state),
      dom: driver.container.innerHTML,
      operations: [...operations],
      emissions: emissions.count,
      seen: [...seen],
      counts: { ...platform.counts },
      pending: platform.pending(),
      dispatched: held.mounted.dispatched.map(summarize),
    });

    const afterClose = await snapshot("scope closed, work still pending outside");

    if (completion === "resolve") {
      platform.resolve("late");
    } else {
      platform.reject();
    }

    // Real scheduler turns, so a late effect has every chance to happen.
    await sleep(50);
    await sleep(50);

    const afterCompletion = await snapshot(`external work ${completion}d after close, real time passed`);

    return { before: { loadingStates: held.loadingStates, loadingSeen: held.loadingSeen, loadingOperations: held.loadingOperations, pendingWhileLoading: held.pendingWhileLoading }, afterClose, afterCompletion, logged: [...watching.logged], unhandled: [...watching.unhandled] };
  } finally {
    watching.stop();
  }
};

/**
 * Shutdown: start → work started → `loading` verified → `Application.shutdown` while the caller's scope stays
 * open → the capability completes from outside → real scheduler turns pass → the scope closes.
 * What may have happened since the application stopped is what the regression asserts.
 */
export const shutdown = async (driver: Driver) => {
  const { seen, operations, platform, app } = instrument(driver);
  const watching = watch();
  const emissions = { count: 0 };
  const snapshots: Array<unknown> = [];
  const held: { running?: Valance.Running<unknown, unknown, never>; mounted?: Valance.Mounted<unknown> } = {};

  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app, { platform: platform.platform });

      yield* Stream.runForEach(running.states, () => Effect.sync(() => { emissions.count += 1; })).pipe(Effect.forkScoped);

      const mounted = yield* Valance.mount(running, recording(driver.container, operations));
      const snapshot = (step: string) => Effect.gen(function* () {
        snapshots.push({
          step,
          status: (yield* Nexus.Application.status(running.nexus))._tag,
          state: yield* running.state,
          operations: [...operations],
          emissions: emissions.count,
          seen: [...seen],
          counts: { ...platform.counts },
          pending: platform.pending(),
          dispatched: mounted.dispatched.map(summarize),
        });
      });

      yield* Effect.promise(() => driver.press(LOAD));
      yield* Effect.promise(() => until("loading", loading(driver)));
      yield* snapshot("loading");

      yield* Nexus.Application.shutdown(running.nexus);
      yield* snapshot("after Application.shutdown, scope open");

      platform.resolve("late");
      // Real scheduler turns, so a late effect has every chance to happen.
      yield* Effect.promise(() => sleep(50));
      yield* Effect.promise(() => sleep(50));
      yield* snapshot("work completed after shutdown, real time passed, scope open");

      // The scope closing after a shutdown must change nothing either.
      held.running = running as unknown as Valance.Running<unknown, unknown, never>;
      held.mounted = mounted as unknown as Valance.Mounted<unknown>;
    })));

    // The scope has closed: the platform resource, in particular, was not released twice.
    const afterScope = {
      step: "scope closed",
      status: (await Effect.runPromise(Nexus.Application.status(held.running!.nexus)))._tag,
      state: await Effect.runPromise(held.running!.state),
      operations: [...operations],
      emissions: emissions.count,
      seen: [...seen],
      counts: { ...platform.counts },
      pending: platform.pending(),
      dispatched: held.mounted!.dispatched.map(summarize),
    };

    return { snapshots: [...snapshots, afterScope] as ReadonlyArray<Snapshot>, logged: [...watching.logged], unhandled: [...watching.unhandled] };
  } finally {
    watching.stop();
  }
};

export interface Snapshot {
  readonly step: string;
  readonly status: string;
  readonly state: { readonly status: string; readonly data: string; readonly ticks: number };
  readonly operations: ReadonlyArray<Operation>;
  readonly emissions: number;
  readonly seen: ReadonlyArray<string>;
  readonly counts: Counts;
  readonly pending: number;
  readonly dispatched: ReadonlyArray<string>;
}
