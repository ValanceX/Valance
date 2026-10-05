// Slice one of the name-keyed commands refinement: a bare `name` in the command table is a NEXUS command bound to every declared `component/name` whose name it is
// (and to `app/name`); an exact `component/name` key wins over it; arguments map to a struct input's fields in field order. `D ⊆ B` is unchanged.
// Two views declare the SAME command name (`increment`), which is what makes repetition, sharing and override observable.
import { compileProgram } from "@valancex/mesh-compiler";
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Cause, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { textTarget } from "./non-dom-target.js";

const manifest = JSON.stringify({ version: 1, types: {}, components: {
  page: { props: {}, events: {}, commands: {}, scope: {} }, text: { props: {}, events: {}, commands: {}, scope: {} }, button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
  left: { props: {}, events: {}, commands: { increment: { parameters: [] }, add: { parameters: [{ name: "a", type: { kind: "number" } }, { name: "b", type: { kind: "number" } }] } }, scope: { label: { kind: "string" }, a: { kind: "number" }, b: { kind: "number" } } },
  right: { props: {}, events: {}, commands: { increment: { parameters: [] } }, scope: { label: { kind: "string" } } },
} });
const compile = async (root: string, source: string) => (await compileProgram({ model: { manifest, path: "components.json" }, root, components: [{ component: root, path: `${root}.mprx`, source }] })).program!;
const programs = {
  left: await compile("left", `<page><text>{label}</text><button on.click={increment()}>Left+1</button><button on.click={add(a, b)}>Add</button></page>`),
  right: await compile("right", `<page><text>{label}</text><button on.click={increment()}>Right+1</button></page>`),
};

const State = Schema.Struct({ view: Schema.Literal("left", "right"), count: Schema.Number, last: Schema.String });
type State = typeof State.Type;
const label = (s: State) => `${s.view}: ${s.count} (${s.last})`;
const views = {
  left: { program: programs.left, scope: (s: State) => ({ label: label(s), a: 3, b: 4 }) },
  right: { program: programs.right, scope: (s: State) => ({ label: label(s) }) },
};

/** The commands, once. Each takes its input as a struct; `add`'s fields are named differently from the view's parameters (`a`, `b`) on purpose. */
const make = (state: Nexus.State.StateHandle<State>) => {
  const command = Valance.command(state);

  return {
    increment: command(Schema.Struct({}), (_i, s) => ({ ...s, count: s.count + 1 })),
    incrementByHundred: command(Schema.Struct({}), (_i, s) => ({ ...s, count: s.count + 100 })),
    add: command(Schema.Struct({ first: Schema.Number, second: Schema.Number }), ({ first, second }, s) => ({ ...s, last: `${first}|${second}` })),
    show: command(Schema.Struct({ view: Schema.Literal("left", "right") }), ({ view }, s) => ({ ...s, view })),
  };
};

const app = (table: (c: ReturnType<typeof make>, state: Nexus.State.StateHandle<State>) => Record<string, any>, start?: string) => Valance.define({
  name: "name-keyed", state: { schema: State, initial: { view: "left", count: 0, last: "" } }, views, view: (s: State) => s.view,
  commands: (state) => table(make(state), state),
  ...(start === undefined ? {} : { start }),
});

const until = async (done: () => boolean | Promise<boolean>) => { for (let i = 0; !(await done()); i += 1) { if (i > 400) { throw new Error("timed out"); } await new Promise((r) => setTimeout(r, 5)); } };
const boot = async (definition: ReturnType<typeof app>) => {
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(definition).pipe(Scope.extend(scope)));
  const factory = textTarget();
  let screen!: ReturnType<typeof factory>;

  await Effect.runPromise(Valance.mount(handle, (report) => (screen = factory(report))).pipe(Scope.extend(scope)));

  return {
    handle, screen: () => screen, click: (l: string) => screen.activate(l), state: () => Effect.runPromise(handle.state),
    invoke: (key: string, ...values: ReadonlyArray<unknown>) => Effect.runPromise(Effect.exit(handle.invoke(key, values.map((value) => ({ value })) as never))),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};
const failureOf = (exit: Exit.Exit<unknown, unknown>) => Exit.isFailure(exit) ? JSON.stringify(Cause.squash(exit.cause) instanceof Error ? { defect: String(Cause.squash(exit.cause)) } : exit.cause) : "";

describe("bare names", () => {
  it("1+4+8. a bare name binds the declared command in every view that declares it (one implementation, repeated name); D ⊆ B holds", async () => {
    const x = await boot(app((c) => ({ increment: c.increment, add: c.add, show: c.show })));

    x.click("Left+1");
    await until(async () => (await x.state()).count === 1);
    await x.invoke("app/show", "right");
    await until(() => x.screen().screen().includes("Right+1"));
    x.click("Right+1");
    await until(async () => (await x.state()).count === 2);                  // the SAME command, reached through right/increment
    await x.close();
  });

  it("2. explicit component/name bindings work exactly as before", async () => {
    const x = await boot(app((c) => ({
      "left/increment": Valance.entry(c.increment), "right/increment": Valance.entry(c.increment),
      "left/add": Valance.entry(c.add, (a, b) => ({ first: a, second: b })), "app/show": Valance.entry(c.show, (view) => ({ view })),
    })));

    x.click("Left+1");
    await until(async () => (await x.state()).count === 1);
    x.click("Add");
    await until(async () => (await x.state()).last === "3|4");
    await x.close();
  });

  it("3+9. both forms coexist; for a declared command the exact key wins over the bare name; `app/name` stays the bare one", async () => {
    const x = await boot(app((c) => ({ increment: c.increment, add: c.add, show: c.show, "left/increment": Valance.entry(c.incrementByHundred) })));

    x.click("Left+1");                                                        // left/increment: the explicit one
    await until(async () => (await x.state()).count === 100);
    await x.invoke("app/increment");                                          // the bare name: +1
    await until(async () => (await x.state()).count === 101);
    await x.invoke("app/show", "right");
    await until(() => x.screen().screen().includes("Right+1"));
    x.click("Right+1");                                                       // right/increment has no exact key: the bare name
    await until(async () => (await x.state()).count === 102);
    await x.close();
  });

  it("11. an explicit `app/name` key wins over the derived one", async () => {
    const x = await boot(app((c) => ({ increment: c.increment, add: c.add, show: c.show, "app/increment": Valance.entry(c.incrementByHundred) })));

    await x.invoke("app/increment");
    await until(async () => (await x.state()).count === 100);                 // explicit app/increment
    x.click("Left+1");
    await until(async () => (await x.state()).count === 101);                 // left/increment: still the bare name
    await x.close();
  });
});

describe("conformance and mistakes", () => {
  it("5. a declared command with neither an exact key nor a bare name is the existing ConformanceViolation, naming the key", async () => {
    const exit = await Effect.runPromise(Effect.scoped(Effect.exit(Valance.start(app((c) => ({ increment: c.increment }))))));

    expect(Exit.isFailure(exit) && Cause.failureOption(exit.cause)).toMatchObject({ _tag: "Some", value: { _tag: "ConformanceViolation", missing: [{ view: "left", key: "left/add" }] } });
  });

  it("7. a binding under a bare name is a mistake `start` names as a defect (it would otherwise be silently misread); a non-command is a compile error", async () => {
    const exit = await Effect.runPromise(Effect.scoped(Effect.exit(Valance.start(app((c) => ({ increment: Valance.entry(c.increment), add: c.add }))))));

    expect(failureOf(exit)).toContain("is a bare command name");
    void Valance.define({
      name: "x", state: { schema: State, initial: { view: "left", count: 0, last: "" } }, views, view: (s: State) => s.view,
      // @ts-expect-error a table entry is a command or a binding, not a number
      commands: () => ({ increment: 42 }),
    });
  });
});

describe("arguments of a bare command", () => {
  it("6. a struct input takes the arguments in field order; the view's parameter names are not used; missing is undefined (validation fails); extras are ignored", async () => {
    const x = await boot(app((c) => ({ increment: c.increment, add: c.add, show: c.show })));

    x.click("Add");                                                           // add(a, b) with a = 3, b = 4  ->  { first: 3, second: 4 }
    await until(async () => (await x.state()).last === "3|4");
    await x.invoke("app/add", 7, 2);                                          // invoke uses the same rule
    expect((await x.state()).last).toBe("7|2");
    await x.invoke("app/add", 8, 9, 10, 11);                                  // beyond the fields: ignored
    expect((await x.state()).last).toBe("8|9");
    expect(failureOf(await x.invoke("app/add", 1))).toContain("CommandValidationError");   // `second` is undefined
    expect((await x.state()).last).toBe("8|9");
    await x.close();
  });

  it("7. an argument of the wrong type is the existing typed CommandValidationError, and nothing commits", async () => {
    const x = await boot(app((c) => ({ increment: c.increment, add: c.add, show: c.show })));

    expect(failureOf(await x.invoke("app/add", "x", 1))).toContain("CommandValidationError");
    expect((await x.state()).last).toBe("");
    await x.close();
  });

  it("11. `app/name` for a one-field struct takes a single positional value (what history's navigate passes); a single object is not unpacked", async () => {
    const x = await boot(app((c) => ({ increment: c.increment, add: c.add, show: c.show })));

    await x.invoke("app/show", "right");
    expect((await x.state()).view).toBe("right");
    expect(failureOf(await x.invoke("app/show", { view: "left" }))).toContain("CommandValidationError");
    expect((await x.state()).view).toBe("right");
    await x.close();
  });

  it("a command whose input is not a struct takes the first argument as the whole input", async () => {
    const x = await boot(app((c, state) => ({
      increment: c.increment, add: c.add, show: c.show,
      note: Nexus.Command.define("note", Schema.String, (text) => Effect.asVoid(state.update((s): Effect.Effect<State> => Effect.succeed({ ...s, last: text })))),
    })));

    await x.invoke("app/note", "hello", "ignored");
    expect((await x.state()).last).toBe("hello");
    await x.close();
  });
});

describe("startup", () => {
  it("10. `start` names a bare command (meaning app/name), an exact app/ key, or a derived component key; an unknown bare name is UnmappedCommand{app, name}", async () => {
    for (const key of ["increment", "app/increment", "left/increment"]) {
      const x = await boot(app((c) => ({ increment: c.increment, add: c.add, show: c.show }), key));

      await until(async () => (await x.state()).count === 1);
      await x.close();
    }

    const unknown = await Effect.runPromise(Effect.scoped(Effect.exit(Valance.start(app((c) => ({ increment: c.increment, add: c.add, show: c.show }), "nope")))));

    expect(Exit.isFailure(unknown) && Cause.failureOption(unknown.cause)).toMatchObject({ _tag: "Some", value: { _tag: "UnmappedCommand", component: "app", name: "nope" } });
  });
});
