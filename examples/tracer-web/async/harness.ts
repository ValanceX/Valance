// Test harness for the async ownership tracer. Nothing here is an API.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Layer } from "effect";

import { Source, primitives } from "./app.js";
import type { WorkFailed } from "./app.js";

export type Operation = "draw" | "hydrate" | "update";

/** The Web target, recording every PORT operation Valance asks for. PORT's own behavior is untouched. */
export const recording = (container: Element, operations: Array<Operation>): Valance.TargetFactory<WebPort> => (report) => {
  const port = Web.target({ container, primitives })(report);

  return {
    draw: (tree) => { operations.push("draw"); port.draw(tree); },
    update: (tree) => { operations.push("update"); port.update(tree); },
    hydrate: (tree) => { operations.push("hydrate"); return port.hydrate(tree); },
    unmount: () => { port.unmount(); },
  };
};

export interface Counts {
  /** The platform's scoped resource: the application's lifetime, observed. */
  acquired: number;
  released: number;
  /** The capability's work: started, cancelled (its canceller ran), and completed from outside. */
  started: number;
  cancelled: number;
  completions: number;
}

/**
 * A platform whose one capability does work that completes only when the TEST says so, from outside the
 * application's runtime: `Effect.async` waiting on a callback the test holds. The scheduler is the real one.
 */
export const controlledPlatform = () => {
  const counts: Counts = { acquired: 0, released: 0, started: 0, cancelled: 0, completions: 0 };
  const waiting: Array<(effect: Effect.Effect<string, WorkFailed>) => void> = [];
  const source = {
    fetch: Effect.async<string, WorkFailed>((resume) => {
      counts.started += 1;
      waiting.push(resume);

      return Effect.sync(() => { counts.cancelled += 1; });
    }),
  };
  const resolutions = new Map<string, Nexus.Capability.CapabilityResolution<unknown>>([[Source.id, { _tag: "Available", implementation: source }]]);
  const platform: Nexus.Application.Platform = Layer.merge(
    Nexus.Capability.EnvironmentLive(resolutions),
    Layer.scopedDiscard(Effect.acquireRelease(Effect.sync(() => { counts.acquired += 1; }), () => Effect.sync(() => { counts.released += 1; })))
  );

  return {
    platform,
    counts,
    /** Work still waiting for the test. */
    pending: (): number => waiting.length,
    resolve: (data: string): void => { counts.completions += 1; waiting.shift()?.(Effect.succeed(data)); },
    reject: (): void => { counts.completions += 1; waiting.shift()?.(Effect.fail({ _tag: "WorkFailed" } as const)); },
  };
};

/** What escaped to the console or the page's unhandled-rejection reporting while a scenario ran. */
export const watch = () => {
  const logged: Array<string> = [];
  const unhandled: Array<string> = [];
  const methods = ["log", "info", "warn", "error", "debug"] as const;
  const originals = methods.map((method) => console[method]);
  const onRejection = (reason: unknown): void => { unhandled.push(String(reason)); };
  const onWindowRejection = (event: PromiseRejectionEvent): void => { onRejection(event.reason); };

  methods.forEach((method) => { console[method] = (...args: Array<unknown>): void => { logged.push(`${method}: ${args.map(String).join(" ")}`); }; });

  if (typeof process !== "undefined" && typeof process.on === "function") {
    process.on("unhandledRejection", onRejection);
  } else {
    window.addEventListener("unhandledrejection", onWindowRejection);
  }

  return {
    logged,
    unhandled,
    stop: (): void => {
      methods.forEach((method, index) => { console[method] = originals[index]!; });

      if (typeof process !== "undefined" && typeof process.off === "function") {
        process.off("unhandledRejection", onRejection);
      } else {
        window.removeEventListener("unhandledrejection", onWindowRejection);
      }
    },
  };
};
