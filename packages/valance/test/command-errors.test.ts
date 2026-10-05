// A command table may hold commands that fail DIFFERENTLY. `define` reads the table's own type, so `E` is the exact union of every failure in it (plus
// `CommandValidationError`, which every validated input can raise), and `R` the union of the services it needs. Before this, `define` fixed `E` to the first
// command's failure and rejected the rest. Type-level: `tsc` (`pnpm typecheck` compiles this file) is the check; the runtime test pins that nothing changed.
import * as Nexus from "@valancex/nexus";
import { Cause, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as Valance from "../src/index.js";
import { eventFreeProgram } from "./event-free-program.js";

const State = Schema.Struct({ n: Schema.Number });
type Offline = { readonly _tag: "Offline" };
type SaveError = { readonly _tag: "SaveError" };
type AuthError = { readonly _tag: "AuthError" };
type CVE = Nexus.Command.CommandValidationError;
const base = { state: { schema: State, initial: { n: 0 } }, views: { main: { program: eventFreeProgram, scope: () => ({}) } }, view: () => "main" as const };
const fails = <E>(name: string, error: E) => Nexus.Command.define(name, Schema.Struct({}), () => Effect.fail(error));
const offline = (name = "fetch") => fails<Offline>(name, { _tag: "Offline" });
const saveError = (name = "save") => fails<SaveError>(name, { _tag: "SaveError" });
const authError = (name = "login") => fails<AuthError>(name, { _tag: "AuthError" });

type ErrorsOf<D> = D extends Valance.ApplicationDefinition<any, infer E, any, any> ? E : never;
type RequirementsOf<D> = D extends Valance.ApplicationDefinition<any, any, infer R, any> ? R : never;

describe("heterogeneous failures in one command table", () => {
  it("two, three: each command keeps its own failure type; E is the exact union", () => {
    const two = Valance.define({ name: "two", ...base, commands: () => ({ fetch: offline(), save: saveError() }) });
    const three = Valance.define({ name: "three", ...base, commands: () => ({ fetch: offline(), save: saveError(), login: authError() }) });

    expectTypeOf<ErrorsOf<typeof two>>().toEqualTypeOf<Offline | SaveError | CVE>();
    expectTypeOf<ErrorsOf<typeof three>>().toEqualTypeOf<Offline | SaveError | AuthError | CVE>();
    expectTypeOf<AuthError>().not.toMatchTypeOf<ErrorsOf<typeof two>>();                 // nothing is widened to admit an error that is not in the table
    expectTypeOf<ErrorsOf<typeof two>>().not.toBeAny();
    expectTypeOf<ErrorsOf<typeof two>>().not.toBeUnknown();
  });

  it("a command that cannot fail, mixed with one that can, in either order; commands that share a type; a table of pure commands", () => {
    const first = Valance.define({ name: "a", ...base, commands: (state) => ({ ok: Valance.command(state)((s) => s), fetch: offline() }) });
    const second = Valance.define({ name: "b", ...base, commands: (state) => ({ fetch: offline(), ok: Valance.command(state)((s) => s) }) });
    const same = Valance.define({ name: "c", ...base, commands: () => ({ a: offline("a"), b: offline("b"), c: offline("c") }) });
    const pure = Valance.define({ name: "d", ...base, commands: (state) => ({ inc: Valance.command(state)((s) => s) }) });

    expectTypeOf<ErrorsOf<typeof first>>().toEqualTypeOf<Offline | CVE>();
    expectTypeOf<ErrorsOf<typeof second>>().toEqualTypeOf<Offline | CVE>();
    expectTypeOf<ErrorsOf<typeof same>>().toEqualTypeOf<Offline | CVE>();
    expectTypeOf<ErrorsOf<typeof pure>>().toEqualTypeOf<CVE>();
  });

  it("an annotated table (the old workaround) and exact bindings (`entry`) give the same exact unions; mixed forms combine", () => {
    const annotated = Valance.define({ name: "e", ...base, commands: (): Valance.CommandTable<Offline | SaveError, never> => ({ fetch: offline(), save: saveError() }) });
    const bindings = Valance.define({ name: "f", ...base, commands: () => ({ "app/fetch": Valance.entry(offline()), "app/save": Valance.entry(saveError()) }) });
    const mixed = Valance.define({ name: "g", ...base, commands: (state) => ({ inc: Valance.command(state)((s) => s), fetch: offline(), "app/save": Valance.entry(saveError()) }) });

    expectTypeOf<ErrorsOf<typeof annotated>>().toEqualTypeOf<Offline | SaveError | CVE>();
    expectTypeOf<ErrorsOf<typeof bindings>>().toEqualTypeOf<Offline | SaveError | CVE>();
    expectTypeOf<ErrorsOf<typeof mixed>>().toEqualTypeOf<Offline | SaveError | CVE>();
  });

  it("the definition is an ordinary ApplicationDefinition: `start` accepts it and the handle carries exactly the union", () => {
    const three = Valance.define({ name: "three", ...base, commands: () => ({ fetch: offline(), save: saveError(), login: authError() }) });
    const started = (d: typeof three) => Valance.start(d);
    type HandleErrors = Effect.Effect.Success<ReturnType<typeof started>> extends Valance.ApplicationHandle<any, infer E> ? E : never;

    expectTypeOf<HandleErrors>().toEqualTypeOf<Offline | SaveError | AuthError | CVE>();
  });

  it("requirements are read the same way, and a service outside the ambient set is still rejected", () => {
    const needsEnvironment = Nexus.Command.define("env", Schema.Struct({}), () => Effect.asVoid(Nexus.Capability.require(Nexus.Capability.define<string>("x"))));
    const Other = Nexus.Service.define<{ readonly x: number }>("Other");
    const needsOther = Nexus.Command.define("other", Schema.Struct({}), () => Effect.asVoid(Other));
    const ok = Valance.define({ name: "r", ...base, commands: () => ({ env: needsEnvironment }) });

    expectTypeOf<RequirementsOf<typeof ok>>().toEqualTypeOf<Nexus.Capability.EnvironmentShape>();
    expectTypeOf(needsOther).toEqualTypeOf<Nexus.Command.Command<{}, void, never, { readonly x: number }>>();          // the reason for the next error is exactly this requirement
    // @ts-expect-error `Other` is not provided by the application's runtime
    void Valance.define({ name: "bad", ...base, commands: () => ({ other: needsOther }) });
  });

  it("runtime is unchanged: each command reaches its caller with its own failure value", async () => {
    const app = Valance.define({ name: "run", ...base, commands: () => ({ fetch: offline(), save: saveError() }) });
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
    const failure = async (key: string) => { const exit = await Effect.runPromise(Effect.exit(handle.invoke(key, []))); return Exit.isFailure(exit) ? Cause.failureOption(exit.cause) : undefined; };

    expect(await failure("app/fetch")).toMatchObject({ _tag: "Some", value: { _tag: "Offline" } });
    expect(await failure("app/save")).toMatchObject({ _tag: "Some", value: { _tag: "SaveError" } });
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
});
