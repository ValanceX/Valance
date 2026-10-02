// The failure tracer's scenarios, written once and run by both drivers (jsdom, Chromium). They record every surface an
// application author could look at after a command fails; they assert nothing. The spec labels each surface.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Cause, Effect, Exit, Fiber, Option, Stream } from "effect";

import { CommandFailed, failureApplication } from "./failure-app.js";
import type { Mode, Options } from "./failure-app.js";
import { controlledPlatform, recording, watch } from "./harness.js";
import type { Operation } from "./harness.js";
import { LOAD, TICK } from "./scenarios.js";
import type { Driver } from "./scenarios.js";

const spans = (container: Element): ReadonlyArray<string> => Array.from(container.querySelectorAll("span")).map((span) => span.textContent ?? "");
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const until = async (what: string, done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error(`timed out waiting for: ${what}`);
    }

    await sleep(5);
  }
};

/** A dispatch outcome, as plain data: what the Exit says, and nothing else about how it was obtained. */
export const outcome = (exit: Valance.DispatchExit<unknown>): string => {
  if (Exit.isSuccess(exit)) {
    return "success";
  }

  if (Exit.isInterrupted(exit)) {
    return "interrupted";
  }

  return Option.match(Cause.failureOption(exit.cause), {
    onNone: () => "defect",
    onSome: (failure) => `failure ${typeof failure === "object" && failure !== null && "_tag" in failure ? String((failure as { readonly _tag: unknown })._tag) : String(failure)}`,
  });
};

export interface Observation {
  readonly step: string;
  readonly dom: ReadonlyArray<string>;
  readonly operations: ReadonlyArray<Operation>;
  readonly states: ReadonlyArray<string>;
  readonly status: string;
}

export interface Surfaces {
  /** `mounted.dispatched`: the Exit of every dispatch Valance made. */
  readonly dispatched: ReadonlyArray<string>;
  /** `mounted.settled`: whether it completed, once every dispatch had settled. */
  readonly settled: "completed";
  /** `mounted.followed`: whether Valance's render follower had ended. */
  readonly followed: "pending" | "ended";
  /** Application events of the application's own `CommandFailed` event, subscribed on the application's bus. */
  readonly events: ReadonlyArray<{ readonly command: string; readonly failure: string }>;
  /** What reached the console, and what reached the page's unhandled-rejection reporting. */
  readonly logged: ReadonlyArray<string>;
  readonly unhandled: ReadonlyArray<string>;
}

/** What the capability does: complete the pending work with a failure (`reject`), or press a button that has no entry. */
export type Act = "load-then-reject" | "tick";

/**
 * Starts the application in `mode`, performs `act` through real clicks, lets the dispatch settle in real time,
 * then presses `Tick`, a synchronous event, and returns everything observable at each step.
 */
export const run = async (driver: Driver, mode: Mode, act: Act, options: Options = {}) => {
  const seen: Array<string> = [];
  const operations: Array<Operation> = [];
  const states: Array<string> = [];
  const events: Array<{ readonly command: string; readonly failure: string }> = [];
  const platform = controlledPlatform();
  const app = failureApplication(driver.program, seen, mode, options);
  const watching = watch();
  const steps: Array<Observation> = [];

  try {
    const surfaces = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const running = yield* Valance.start(app, { platform: platform.platform });

      yield* Stream.runForEach(running.states, (state) => Effect.sync(() => { states.push(`${state.status}/${state.ticks}`); })).pipe(Effect.forkScoped);

      // An application author's own subscription to the application's own event, on the application's bus.
      const subscriber = Nexus.Runtime.runFork(running.nexus.runtime, Stream.runForEach(Nexus.Event.subscribe(CommandFailed), (payload) => Effect.sync(() => { events.push(payload); })));

      yield* Effect.addFinalizer(() => Fiber.interrupt(subscriber));

      const mounted = yield* Valance.mount(running, recording(driver.container, operations));
      const observe = (step: string) => Effect.gen(function* () {
        const status = yield* Nexus.Application.status(running.nexus);

        steps.push({ step, dom: spans(driver.container), operations: [...operations], states: [...states], status: status._tag });
      });

      yield* Effect.promise(() => sleep(20));
      yield* observe("started");

      if (act === "load-then-reject") {
        yield* Effect.promise(() => driver.press(LOAD));
        yield* Effect.promise(() => until("loading", () => spans(driver.container)[0] === "status: loading"));
        yield* observe("loading");
        platform.reject();
        yield* mounted.settled;
        yield* Effect.promise(() => sleep(50));
        yield* observe("after the failure");
      } else {
        yield* Effect.promise(() => driver.press(TICK));
        yield* mounted.settled;
        yield* Effect.promise(() => sleep(50));
        yield* observe("after the event");
      }

      // A subsequent synchronous event.
      const before = states.length;

      yield* Effect.promise(() => driver.press(TICK));
      yield* Effect.promise(() => until("a state change from the second event", () => act === "tick" ? true : states.length > before));
      yield* mounted.settled;
      yield* Effect.promise(() => sleep(20));
      yield* observe("second event");

      const followed = yield* Effect.timeoutOption(mounted.followed, "20 millis");

      return {
        dispatched: mounted.dispatched.map(outcome),
        settled: "completed" as const,
        followed: Option.isNone(followed) ? "pending" as const : "ended" as const,
      };
    })));

    return { steps, surfaces: { ...surfaces, events: [...events], logged: [...watching.logged], unhandled: [...watching.unhandled] } satisfies Surfaces, seen: [...seen], pending: platform.pending() };
  } finally {
    watching.stop();
  }
};
