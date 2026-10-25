// `focusFirstInvalid`: each time the application's count rises, the target is asked to focus the first node in the tree that says it is invalid, after the render that shows the rise is applied.
// The target is a recorder, so what is looked at is the request itself: its key, its number, and its place among the draws and patches.
import type * as Mesh from "@valancex/nexus";

import { compileProgram } from "@valancex/mesh-compiler";
import { Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";

const model = JSON.stringify({
  version: 1,
  types: {},
  components: {
    main: { props: {}, events: {}, commands: {}, scope: { first: { kind: "boolean" }, second: { kind: "boolean" }, label: { kind: "string" } } },
    list: { props: {}, events: {}, commands: {}, scope: {} },
    field: { props: { invalid: { type: { kind: "boolean" }, required: true } }, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
  },
});
const compiled = await compileProgram({
  model: { manifest: model, path: "components.json" },
  root: "main",
  components: [{ component: "main", source: `<list><field invalid={first}/><text>{label}</text><field invalid={second}/></list>`, path: "main.mprx" }],
});

if (compiled.program === undefined) {
  throw new Error(JSON.stringify(compiled.components));
}

const State = Schema.Struct({ attempts: Schema.Number, first: Schema.Boolean, second: Schema.Boolean, label: Schema.String });
const initial = { attempts: 0, first: false, second: false, label: "" };

const definition = (options: Pick<Valance.ApplicationDefinition<any, any, any, any>, "focusFirstInvalid">, start: Partial<typeof initial> = {}) =>
  Valance.define({
    name: "focus-first-invalid",
    state: { schema: State, initial: { ...initial, ...start } },
    views: { main: { program: compiled.program!, scope: (s: Schema.Schema.Type<typeof State>) => ({ first: s.first, second: s.second, label: s.label }) } },
    view: () => "main" as const,
    ...options,
    commands: (state) => {
      const command = Valance.command(state);
      const attempt = command(Schema.Struct({}), (_input, current) => ({ ...current, attempts: current.attempts + 1 }));
      const fail = command(Schema.Struct({ second: Schema.Boolean }), ({ second }, current) => ({ ...current, second, attempts: current.attempts + 1 }));
      const label = command(Schema.Struct({ label: Schema.String }), ({ label }, current) => ({ ...current, label }));

      return {
        "app/attempt": Valance.entry(attempt, () => ({})),
        "app/fail": Valance.entry(fail, (second) => ({ second: second === "yes" })),
        "app/label": Valance.entry(label, (value) => ({ label: value })),
      };
    },
  });

/** Runs `application` against a recording target through `steps`, and returns what the target was asked, in order. */
const run = async (application: ReturnType<typeof definition>, steps: ReadonlyArray<readonly [string, string]>, canFocus = true) => {
  const calls: Array<string> = [];
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(application).pipe(Scope.extend(scope)));
  let tree: Mesh.Mesh.Render["tree"] | undefined;
  const factory: Valance.TargetFactory<Valance.Target> = () => ({
    draw: (drawn) => {
      tree = drawn;
      calls.push("draw");
    },
    update: () => calls.push("update"),
    patch: () => calls.push("patch"),
    ...(canFocus ? { focus: (key: string) => calls.push(`focus:${keyOrder(tree!, key)}`) } : {}),
    unmount: () => undefined,
  });

  await Effect.runPromise(Valance.mount(handle, factory).pipe(Scope.extend(scope)));

  for (const [name, argument] of steps) {
    await Effect.runPromise(handle.invoke(`app/${name}`, [{ value: argument }]).pipe(Effect.orDie));
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  await Effect.runPromise(Scope.close(scope, Exit.void));

  return calls;
};

/** Which child of the list the key is (0 first field, 1 text, 2 second field): the drawn tree's keys are opaque. */
const keyOrder = (tree: Mesh.Mesh.Render["tree"], key: string): number => tree.root.children.findIndex((child) => child.key === key);

const asked = { focusFirstInvalid: (s: Schema.Schema.Type<typeof State>) => s.attempts };

describe("focusFirstInvalid", () => {
  it("asks the target to focus the first invalid node after the render that shows the rise, and not before", async () => {
    const calls = await run(definition(asked), [
      ["fail", "yes"], // attempts 1, the second field is invalid
    ]);

    expect(calls).toEqual(["draw", "patch", "focus:2"]);
  });

  it("takes the first of several in document order", async () => {
    const calls = await run(definition(asked, { first: true, second: true }), [["attempt", ""]]);

    expect(calls).toEqual(["draw", "patch", "focus:0"]);
  });

  it("asks again for a second failed attempt that changes nothing else a person would see", async () => {
    const calls = await run(definition(asked, { second: true }), [
      ["attempt", ""],
      ["attempt", ""],
    ]);

    expect(calls).toEqual(["draw", "patch", "focus:2", "patch", "focus:2"]);
  });

  it("does not ask when the count did not rise, when nothing is invalid, or for the page that opens with attempts already made", async () => {
    expect(await run(definition(asked, { second: true }), [["label", "x"]])).toEqual(["draw", "patch"]);
    expect(await run(definition(asked), [["attempt", ""]])).toEqual(["draw", "patch"]);
    expect(await run(definition(asked, { attempts: 3, second: true }), [["label", "y"]])).toEqual(["draw", "patch"]);
  });

  it("does nothing without the option, and with a target that cannot focus", async () => {
    expect(await run(definition({}, { second: true }), [["attempt", ""]])).toEqual(["draw", "patch"]);
    expect(await run(definition(asked, { second: true }), [["attempt", ""]], false)).toEqual(["draw", "patch"]);
  });
});
