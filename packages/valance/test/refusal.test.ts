// A command that races a shutdown can tell a refusal from a bug by a stable code, whichever layer refused it (NEXUS's `Runtime.Refusal`, or VALANCE's own drain).
import * as Nexus from "@valancex/nexus";
import { Cause, Deferred, Effect, Exit, Layer, Option, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ n: Schema.Number });

const defectOf = (exit: Exit.Exit<unknown, unknown>): unknown => Exit.isFailure(exit) ? Option.getOrUndefined(Cause.dieOption(exit.cause)) : undefined;

describe("refusals", () => {
  it("work refused while the application drains, and after it has closed, is a refusal with a stable code; a bug is not", async () => {
    const gate = await Effect.runPromise(Deferred.make<void>());
    const application = Valance.define({
      name: "refusal",
      state: { schema: State, initial: { n: 0 } },
      views: { main: { program: eventFreeProgram, scope: () => ({}) } },
      view: () => "main" as const,
      commands: () => ({
        // Uninterruptible, so closing the scope has to wait for it: the drain stays open until the gate does.
        "app/hold": Nexus.Mesh.bind(Nexus.Command.define("t.hold", Schema.Struct({}), () => Effect.uninterruptible(Deferred.await(gate))), () => ({})),
        "app/noop": Nexus.Mesh.bind(Nexus.Command.define("t.noop", Schema.Struct({}), () => Effect.void), () => ({})),
      }),
    });
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(application, { platform: Layer.merge(Nexus.Capability.EnvironmentLive(new Map()), Layer.empty) }).pipe(Scope.extend(scope)));

    Effect.runFork(handle.invoke("app/hold", []));
    await new Promise((resolve) => setTimeout(resolve, 20));
    const closing = Effect.runPromise(Scope.close(scope, Exit.void));

    await new Promise((resolve) => setTimeout(resolve, 20));
    const during = defectOf(await Effect.runPromise(Effect.exit(handle.invoke("app/noop", []))));

    expect(Valance.isValanceError(during)).toBe(true);
    expect((during as Valance.ValanceError).code).toBe("admission-closed");
    expect((during as Valance.ValanceError).message).toBe("VALANCE: admission is closed (draining)");
    expect(Valance.isRefusal(during)).toBe(true);

    await Effect.runPromise(Deferred.succeed(gate, undefined));
    await closing;
    const after = defectOf(await Effect.runPromise(Effect.exit(handle.invoke("app/noop", []))));

    expect(Nexus.Runtime.isRefusal(after)).toBe(true);
    expect(Valance.isRefusal(after)).toBe(true);

    expect(Valance.isRefusal(new Error("a defect in a command"))).toBe(false);
    expect(Valance.isRefusal(new Valance.ValanceError("unknown-view", "no view named x"))).toBe(false);
    expect(Valance.isValanceError(new Error("VALANCE: admission is closed (draining)"))).toBe(false);
  });
});
