// What the principle probes share: the verifier's own site and application (a realistic one), and a tiny counter application for the probes that need a command that
// waits, fails or takes a secret. Both are built the way a consumer builds them: from the public packages only.
import { compileProgram } from "@valancex/mesh-compiler";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { Effect, Schema } from "effect";
import { fileURLToPath } from "node:url";

import { application } from "../app/application.js";
import { mapOf } from "../model/site.js";
import { readSite } from "../tooling/content.js";
import { compilePage } from "../web/compile.js";

export const site = () => readSite(fileURLToPath(new URL("../content", import.meta.url)));
export const docs = async () => application(await compilePage(), mapOf(site()));

const model = JSON.stringify({
  version: 1,
  types: {},
  components: {
    counter: { props: {}, events: {}, commands: {}, scope: { n: { kind: "number" } } },
    text: { props: {}, events: {}, commands: {}, scope: {} },
  },
});

export const counterProgram = async (): Promise<Valance.Program> => {
  const result = await compileProgram({ model: { manifest: model, path: "model.json" }, root: "counter", components: [{ component: "counter", source: "<text>{n}</text>", path: "counter.mprx" }] });

  if (result.program === undefined) {
    throw new Error(JSON.stringify(result.components));
  }

  return result.program;
};

export const Counter = Schema.Struct({ n: Schema.Number });
export type Counter = typeof Counter.Type;

export interface CounterOptions {
  /** How long `slow` waits. */
  readonly slowMs?: number;
  /** Called with what `slow` saw: that it ran, and whether it was aborted. */
  readonly saw?: (event: "started" | "aborted" | "finished") => void;
  /** The secret a failing command carries in its error. */
  readonly secret?: string;
}

/** A counter with `bump` (pure), `slow` (waits), `leak` (an Effect command that fails with a secret in its error) and `startLeak` (the same, as start-time work). */
export const counter = async (options: CounterOptions = {}, startWork?: string) => {
  const program = await counterProgram();
  const secret = options.secret ?? "s3cr3t-token";

  return Valance.define({
    name: "counter",
    state: { schema: Counter, initial: { n: 0 } },
    views: { main: { program, scope: (s: Counter) => ({ n: s.n }) } },
    view: () => "main" as const,
    ...(startWork === undefined ? {} : { start: startWork }),
    commands: (state: Valance.StateHandle<Counter>) => {
      const command = Valance.command(state);
      const leak = Nexus.Command.define("counter.leak", Schema.Struct({}), () => Effect.fail({ _tag: "UpstreamFailed", authorization: `Bearer ${secret}` } as const));

      return {
        bump: command(Schema.Struct({}), (_input, current) => ({ n: current.n + 1 })),
        slow: command.waiting(Schema.Struct({}), {
          work: (_input, signal) => new Promise<number>((resolve, reject) => {
            options.saw?.("started");
            const timer = setTimeout(() => { options.saw?.("finished"); resolve(1); }, options.slowMs ?? 50);

            signal.addEventListener("abort", () => { clearTimeout(timer); options.saw?.("aborted"); reject(new Error("aborted")); });
          }),
          wanted: () => true,
          settle: (outcome, _input, current) => ({ n: current.n + (outcome.ok ? outcome.value : 0) }),
        }),
        leak,
      };
    },
  });
};
