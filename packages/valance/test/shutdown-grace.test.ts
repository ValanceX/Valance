// `shutdown.grace` (StartOptions): closing the application's Scope waits up to the grace for the admitted commands to finish, then interrupts what is left and awaits each. The default,
// 0, interrupts at once, which is what the other shutdown tests pin.
import * as Nexus from "@valancex/nexus";
import { Cause, Duration, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ commits: Schema.Array(Schema.String) });
type State = Schema.Schema.Type<typeof State>;

const rig = async (shutdown: Nexus.Runtime.ShutdownOptions | undefined, takes: number) => {
  const timeline: Array<string> = [];
  const app = Valance.define({
    name: "grace", state: { schema: State, initial: { commits: [] } },
    views: { main: { program: eventFreeProgram, scope: () => ({}) } }, view: () => "main" as const,
    commands: (state: Nexus.State.StateHandle<State>) => ({
      "app/slow": Nexus.Mesh.bind(Nexus.Command.define("t.slow", Schema.Struct({}), () => Effect.gen(function* () {
        timeline.push("started");
        yield* Effect.sleep(Duration.millis(takes)).pipe(Effect.onInterrupt(() => Effect.sync(() => { timeline.push("interrupted"); })));
        yield* state.update((c): Effect.Effect<State> => Effect.succeed({ commits: [...c.commits, "slow"] }));
        timeline.push("committed");
      })), () => ({})),
    }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
  });
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app, shutdown === undefined ? {} : { shutdown }).pipe(Scope.extend(scope)));
  const caller = Effect.runPromise(Effect.exit(handle.invoke("app/slow", [])));

  while (!timeline.includes("started")) { await new Promise((resolve) => setTimeout(resolve, 1)); }

  const closed = async () => { const before = Date.now(); await Effect.runPromise(Scope.close(scope, Exit.void)); timeline.push("closed"); return Date.now() - before; };

  return { timeline, closed, caller, handle };
};

describe("shutdown.grace", () => {
  it("the default interrupts an admitted command at once", async () => {
    const r = await rig(undefined, 5000);

    await r.closed();

    expect(r.timeline).toEqual(["started", "interrupted", "closed"]);
    expect(Exit.isFailure(await r.caller)).toBe(true);
  });

  it("a command that finishes within the grace commits, and the close resolves after it", async () => {
    const r = await rig({ grace: "1 second" }, 40);

    await r.closed();

    expect(r.timeline).toEqual(["started", "committed", "closed"]);
    expect(Exit.isSuccess(await r.caller)).toBe(true);
  });

  it("a command that outlasts the grace is interrupted when it runs out, and the close takes about the grace", async () => {
    const r = await rig({ grace: "60 millis" }, 5000);
    const took = await r.closed();

    expect(r.timeline).toEqual(["started", "interrupted", "closed"]);
    expect(took).toBeGreaterThanOrEqual(55);
    expect(took).toBeLessThan(1000);
  });

  it("no new command is admitted during the grace: it is refused as a defect with the code `admission-closed`", async () => {
    const r = await rig({ grace: "1 second" }, 100);
    const closing = r.closed();

    await new Promise((resolve) => setTimeout(resolve, 20));

    const late = await Effect.runPromise(Effect.exit(r.handle.invoke("app/slow", [])));

    await closing;

    expect(Exit.isFailure(late) && Cause.isDie(late.cause) && Valance.isValanceError(Cause.squash(late.cause)) && (Cause.squash(late.cause) as { code: string }).code).toBe("admission-closed");
    expect(r.timeline).toEqual(["started", "committed", "closed"]);
  });
});
