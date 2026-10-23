// Units (direction Bet 8): the state of one occurrence of a component, held by the host beside the application's. The acceptance: a disclosure's open state survives a re-sort of its list row, and is
// absent from the application's state. It is shown to fail where the state would not follow the row (a repeat keyed by position), and the controlled case keeps one copy of the value.
import { compileProgram } from "@valancex/mesh-compiler";
import * as MeshRuntime from "@valancex/mesh-runtime";
import { Chunk, Effect, Exit, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { runningOf } from "../src/internal.js";

// The tests need a runtime that has units (`@valancex/mesh-runtime` 0.15): one that has not has no `raise`, and says so here instead of failing inside.
const supported = typeof (MeshRuntime as { readonly raise?: unknown }).raise === "function";

const model = JSON.stringify({
  version: 1,
  types: {},
  components: {
    box: { props: {}, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    "mesh-if": { props: { when: { type: { kind: "boolean" }, required: true } }, events: {}, commands: {}, scope: {} },
    "mesh-each": {
      props: {
        items: { type: { kind: "list", element: { kind: "any" } }, required: true },
        as: { type: { kind: "string" }, required: true },
        key: { type: { kind: "any" }, required: true },
      },
      events: {},
      commands: {},
      scope: {},
    },
    disclosure: {
      props: { label: { type: { kind: "string" }, required: true } },
      events: {},
      commands: {},
      scope: { label: { kind: "string" } },
      unit: { state: { open: { type: { kind: "boolean" }, default: false } }, commands: { toggle: { parameters: [] } } },
    },
    tabs: {
      props: { at: { type: { kind: "number" }, required: false } },
      events: { change: { payload: { kind: "number" } } },
      commands: {},
      scope: {},
      unit: { state: { at: { type: { kind: "number" }, default: 0, controllable: true } }, commands: { select: { parameters: [{ name: "n", type: { kind: "number" } }] } } },
    },
    page: {
      props: {},
      events: {},
      commands: { chose: { parameters: [{ name: "n", type: { kind: "number" } }] } },
      scope: {
        shown: { kind: "boolean" },
        tab: { kind: "number" },
        items: { kind: "list", element: { kind: "record", fields: { id: { type: { kind: "string" }, required: true }, label: { type: { kind: "string" }, required: true } } } },
      },
    },
  },
});

const DISCLOSURE = "<box><button on.click={toggle()}>{label}</button>{#if open}<text>open {label}</text>{/if}</box>";
const TABS = "<box><button on.click={select(at + 1)}>at {at}</button></box>";
const PAGE = (body: string) => ({ component: "page", source: body, path: "page.mprx" });
const compile = async (page: string) => {
  const result = await compileProgram({
    model: { manifest: model, path: "components.json" },
    root: "page",
    components: [PAGE(page), { component: "disclosure", source: DISCLOSURE, path: "disclosure.mprx" }, { component: "tabs", source: TABS, path: "tabs.mprx" }],
  });

  if (result.program === undefined) {
    throw new Error(JSON.stringify(result.components));
  }

  return result.program;
};

const Item = Schema.Struct({ id: Schema.String, label: Schema.String });
const State = Schema.Struct({ items: Schema.Array(Item), shown: Schema.Boolean, tab: Schema.Number });
type State = Schema.Schema.Type<typeof State>;

const toggleUnit = {
  [Valance.UNIT]: true,
  schema: Schema.Struct({ open: Schema.Boolean }),
  fields: { open: { schema: Schema.Boolean, initial: false } },
  controllable: [],
  commands: { toggle: { run: (state: { readonly open: boolean }) => ({ open: !state.open }) } },
} as unknown as Valance.Unit;
const tabsUnit = {
  [Valance.UNIT]: true,
  schema: Schema.Struct({ at: Schema.Number }),
  fields: { at: { schema: Schema.Number, initial: 0 } },
  controllable: ["at"],
  commands: {
    select: {
      input: Schema.Struct({ n: Schema.Number }),
      run: (_: { readonly at: number }, args: { readonly n: number }) => ({ at: args.n }),
      raises: { change: (next: { readonly at: number }) => next.at },
    },
  },
} as unknown as Valance.Unit;

const ITEMS = [
  { id: "a", label: "a" },
  { id: "b", label: "b" },
  { id: "c", label: "c" },
];

const application = (program: Awaited<ReturnType<typeof compile>>) =>
  Valance.define({
    name: "units",
    state: { schema: State, initial: { items: ITEMS, shown: true, tab: 2 } },
    views: { main: { program, scope: (s: State) => ({ items: s.items, shown: s.shown, tab: s.tab }) } },
    view: () => "main" as const,
    units: { disclosure: toggleUnit, tabs: tabsUnit },
    commands: (state) => {
      const command = Valance.command(state);

      return {
        reverse: command((s) => ({ ...s, items: [...s.items].reverse() })),
        drop: command(Schema.Struct({ id: Schema.String }), ({ id }, s) => ({ ...s, items: s.items.filter((each) => each.id !== id) })),
        restore: command((s) => ({ ...s, items: ITEMS })),
        hide: command((s) => ({ ...s, shown: false })),
        show: command((s) => ({ ...s, shown: true })),
        chose: command(Schema.Struct({ n: Schema.Number }), ({ n }, s) => ({ ...s, tab: n })),
      };
    },
  });

const KEYED = `<box>{#each items as item (item.id)}<disclosure label={item.label} />{/each}</box>`;
const HIDDEN = `<box>{#if shown}<disclosure label="only" />{/if}</box>`;
const CONTROLLED = `<box><tabs at={tab} on.change={chose($event)} /></box>`;
const FREE = `<box><tabs on.change={chose($event)} /></box>`;

interface Node {
  readonly type: string;
  readonly text?: string;
  readonly component?: string;
  readonly events?: Record<string, string>;
  readonly children?: ReadonlyArray<Node>;
}

const walk = (node: Node, visit: (each: Node) => void): void => {
  visit(node);
  node.children?.forEach((child) => walk(child, visit));
};
const textsOf = (render: { readonly tree: unknown }): ReadonlyArray<string> => {
  const found: Array<string> = [];

  walk((render.tree as { readonly root: Node }).root, (each) => {
    if (each.type === "text") {
      found.push(each.text!);
    }
  });

  return found;
};
const clicks = (render: { readonly tree: unknown }): ReadonlyArray<string> => {
  const found: Array<string> = [];

  walk((render.tree as { readonly root: Node }).root, (each) => {
    if (each.events?.["click"] !== undefined) {
      found.push(each.events["click"]);
    }
  });

  return found;
};

/** Starts the application and returns a way to look at what it shows now, press the nth button, and run a command of the application. */
const open = async (page: string, units = true) => {
  const scope = await Effect.runPromise(Scope.make());
  const base = application(await compile(page));
  const handle = await Effect.runPromise(Valance.start(units ? base : { ...base, units: undefined }).pipe(Scope.extend(scope)));
  const running = runningOf(handle);
  const seen: Array<{ readonly render: { readonly tree: unknown; readonly instances: ReadonlyArray<{ readonly instance: string; readonly state: Record<string, unknown> }> } }> =
    [];

  Effect.runFork(Stream.runForEach(running.values, (viewed) => Effect.sync(() => void seen.push(viewed as never))).pipe(Scope.extend(scope)));

  const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

  await settle();

  return {
    seen,
    now: () => seen[seen.length - 1]!.render,
    press: async (nth: number) => {
      const current = await Effect.runPromise(running.render);

      await Effect.runPromise(running.dispatch(current as never, clicks(current.render)[nth]!).pipe(Effect.orDie));
      await settle();
    },
    run: async (key: string, ...args: ReadonlyArray<unknown>) => {
      await Effect.runPromise(
        handle
          .invoke(
            key,
            args.map((value) => ({ value })),
          )
          .pipe(Effect.orDie),
      );
      await settle();
    },
    state: () => Effect.runPromise(handle.state),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};

describe.skipIf(!supported)("the state of one occurrence", () => {
  it("is opened by the occurrence's own command, shown in the render, and not in the application's state", async () => {
    const app = await open(KEYED);

    expect(textsOf(app.now())).toEqual(["a", "b", "c"]);
    await app.press(1);
    expect(textsOf(app.now())).toEqual(["a", "b", "open b", "c"]);
    expect(Object.keys(await app.state()).sort()).toEqual(["items", "shown", "tab"]);
    expect(JSON.stringify(await app.state())).not.toContain("open");
    await app.close();
  });

  it("follows its row when the list is re-sorted", async () => {
    const app = await open(KEYED);

    await app.press(1);
    await app.run("app/reverse");
    expect(textsOf(app.now())).toEqual(["c", "b", "open b", "a"]);
    await app.close();
  });

  it("is shown to fail without the feature: an application that does not register the units does not start, for the commands nothing binds", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const base = application(await compile(KEYED));
    const started = await Effect.runPromise(Effect.exit(Valance.start({ ...base, units: undefined }).pipe(Scope.extend(scope))));

    expect(Exit.isFailure(started)).toBe(true);
    expect(JSON.stringify(started)).toContain("ConformanceViolation");
    expect(JSON.stringify(started)).toContain("disclosure");
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  it("starts again from the defaults when the occurrence leaves the page and comes back", async () => {
    const app = await open(HIDDEN);

    await app.press(0);
    expect(textsOf(app.now())).toEqual(["only", "open only"]);
    await app.run("app/hide");
    expect(textsOf(app.now())).toEqual([]);
    await app.run("app/show");
    expect(textsOf(app.now())).toEqual(["only"]);
    await app.close();
  });

  it("is let go with its row: a row dropped and restored is closed", async () => {
    const app = await open(KEYED);

    await app.press(1);
    await app.run("app/drop", "b");
    expect(textsOf(app.now())).toEqual(["a", "c"]);
    await app.run("app/restore");
    expect(textsOf(app.now())).toEqual(["a", "b", "c"]);
    await app.close();
  });

  it("is the caller's when the caller writes the prop: one copy of the value, and the unit tells the caller what the person chose", async () => {
    const owned = await open(CONTROLLED);

    expect(textsOf(owned.now())).toEqual(["at 2"]);
    await owned.press(0);
    // The caller's command ran (raised by the unit), the application's state is the one copy, and the render follows it.
    expect((await owned.state()).tab).toBe(3);
    expect(textsOf(owned.now())).toEqual(["at 3"]);
    await owned.close();

    const free = await open(FREE);

    expect(textsOf(free.now())).toEqual(["at 0"]);
    await free.press(0);
    // Uncontrolled: the unit's own state moved, and the caller was told (and keeps its own copy, which nothing shows).
    expect(textsOf(free.now())).toEqual(["at 1"]);
    expect((await free.state()).tab).toBe(1);
    await free.close();
  });

  it("a stream of renders is one per change, and the last is what a fresh render of the same state and units shows", async () => {
    const app = await open(KEYED);

    await app.press(0);
    await app.press(2);
    const last = app.now();

    expect(textsOf(last)).toEqual(["a", "open a", "b", "c", "open c"]);
    expect(Chunk.size(Chunk.fromIterable(app.seen))).toBeGreaterThanOrEqual(3);
    await app.close();
  });
});
