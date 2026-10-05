// Keyed repetition through the whole stack, in real Chromium: state → view (a compiled program with `mesh-each`) → MESH render → Valance.mount → PORT Web update → DOM.
// The question is identity: when keyed items move, does the existing DOM node move with its key, or is it recreated by position? An input per item makes it observable (element identity, typed value, focus).
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import type { WebPort } from "@valancex/port-web";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { userEvent } from "@vitest/browser/context";
import { Effect, Schema, Scope } from "effect";
import { beforeAll, expect, inject, it } from "vitest";

const program = inject("keyed");

beforeAll(async () => { await init(wasmUrl); });

const Item = Schema.Struct({ id: Schema.String, value: Schema.String });
const State = Schema.Struct({ items: Schema.Array(Item) });
type State = typeof State.Type;

const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  row: { element: "div" },
  field: { element: "input" },
  button: { element: "button", events: { click: { type: "click" } } },
};

const boot = async () => {
  const picked: Array<string> = [];
  const ops: Array<string> = [];
  const app = Valance.define({
    name: "keyed",
    state: { schema: State, initial: { items: ["a", "b", "c"].map((id) => ({ id, value: id.toUpperCase() })) } },
    views: { keyed: { program, scope: (s: State) => ({ title: "t", items: s.items.map((item) => ({ ...item })) }) } },
    view: () => "keyed",
    commands: (state) => {
      const command = Valance.command(state);

      return {
        pick: command(Schema.Struct({ id: Schema.String }), ({ id }, s) => { picked.push(id); return s; }),
        // The order the application wants; an id it already has keeps its item (and value), a new one is made.
        order: command(Schema.Struct({ ids: Schema.Array(Schema.String) }), ({ ids }, s) => ({ items: ids.map((id) => s.items.find((item) => item.id === id) ?? { id, value: id.toUpperCase() }) })),
        rename: command(Schema.Struct({ id: Schema.String, value: Schema.String }), ({ id, value }, s) => ({ items: s.items.map((item) => item.id === id ? { id, value } : item) })),
      };
    },
  });
  const main = document.createElement("main");

  document.body.append(main);

  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
  const target: Valance.TargetFactory<WebPort> = (report) => {
    const port = Web.target({ container: main, primitives })(report);

    return {
      draw: (tree) => { ops.push("draw"); port.draw(tree); },
      update: (tree) => { ops.push("update"); port.update(tree); },
      hydrate: (tree) => port.hydrate(tree),
      unmount: () => { port.unmount(); },
    };
  };

  await Effect.runPromise(Valance.mount(handle, target).pipe(Scope.extend(scope)));

  const rows = () => Array.from(main.querySelectorAll("section > div")) as Array<HTMLElement>;
  const input = (row: HTMLElement) => row.querySelector("input") as HTMLInputElement;
  const label = (row: HTMLElement) => row.querySelector("button")!.textContent;
  const labels = () => rows().map(label);
  const until = async (done: () => boolean) => { for (let i = 0; !done(); i += 1) { if (i > 400) { throw new Error(`timed out: ${labels().join(",")} / ${ops.join(",")}`); } await new Promise((r) => setTimeout(r, 5)); } };
  const invoke = async (key: string, ...values: ReadonlyArray<unknown>) => {
    const before = ops.length;

    await Effect.runPromise(handle.invoke(key, values.map((value) => ({ value })) as never));
    await until(() => ops.length > before);
  };
  const byLabel = (text: string) => rows().find((row) => label(row) === text)!;

  return { picked, ops, rows, input, labels, byLabel, invoke, until, close: () => Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)) };
};

it("keyed items keep their DOM node, value and handler through insert, remove, reorder and update; the node moves with its key, never recreated by position", async () => {
  const t = await boot();

  expect(t.labels()).toEqual(["A", "B", "C"]);
  const [rowA, rowB, rowC] = t.rows() as [HTMLElement, HTMLElement, HTMLElement];
  const [inA, inB, inC] = [t.input(rowA), t.input(rowB), t.input(rowC)];

  for (const [el, text] of [[inA, "va"], [inB, "vb"], [inC, "vc"]] as const) { await userEvent.type(el, text); }
  expect([inA.value, inB.value, inC.value]).toEqual(["va", "vb", "vc"]);
  await userEvent.click(inB);                                   // focus B's input
  expect(document.activeElement).toBe(inB);

  // 2. Insert in the middle: [a, x, b, c]. Existing nodes are the same elements, in new positions; only x is new.
  await t.invoke("app/order", ["a", "x", "b", "c"]);
  expect(t.labels()).toEqual(["A", "X", "B", "C"]);
  expect(t.rows()[0]).toBe(rowA);
  expect(t.rows()[2]).toBe(rowB);
  expect(t.rows()[3]).toBe(rowC);
  expect([inA.value, inB.value, inC.value]).toEqual(["va", "vb", "vc"]);
  expect(t.input(t.rows()[1]!).value).toBe("");
  const rowX = t.rows()[1]!;

  expect(rowX).not.toBe(rowA);
  expect(document.activeElement).toBe(inB);                     // nothing moved B itself: focus stays

  // 3. Remove from the middle: [a, b, c]. Only X is detached.
  await t.invoke("app/order", ["a", "b", "c"]);
  expect(t.labels()).toEqual(["A", "B", "C"]);
  expect(rowX.isConnected).toBe(false);
  expect(t.rows()).toEqual([rowA, rowB, rowC]);
  expect([inA.value, inB.value, inC.value]).toEqual(["va", "vb", "vc"]);

  // 4. Reorder: [c, a, b]. The same elements, moved; values kept.
  await t.invoke("app/order", ["c", "a", "b"]);
  expect(t.labels()).toEqual(["C", "A", "B"]);
  expect(t.rows()).toEqual([rowC, rowA, rowB]);
  expect([inA.value, inB.value, inC.value]).toEqual(["va", "vb", "vc"]);
  expect(document.activeElement).toBe(inB);                     // [c,a,b]: only C moved, B was not touched

  // 4b. Move the focused item itself: [b, c, a]. Same elements and values; focus itself is not asserted: observed lost in Chromium when the focused node is the one moved (a DOM insertBefore blurs it), which is the platform's, not identity.
  await t.invoke("app/order", ["b", "c", "a"]);
  expect(t.rows()).toEqual([rowB, rowC, rowA]);
  expect([inA.value, inB.value, inC.value]).toEqual(["va", "vb", "vc"]);
  await t.invoke("app/order", ["c", "a", "b"]);
  expect(t.rows()).toEqual([rowC, rowA, rowB]);

  // 5. Update an item's data without changing its key: the same row and input, new text.
  await t.invoke("app/rename", "b", "Bee");
  expect(t.labels()).toEqual(["C", "A", "Bee"]);
  expect(t.rows()).toEqual([rowC, rowA, rowB]);
  expect(inB.value).toBe("vb");

  // 6. Events after reorder reach the item whose node was clicked, not the one now at that position.
  await userEvent.click(t.rows()[0]!.querySelector("button")!);   // row 0 is C now
  await userEvent.click(t.rows()[2]!.querySelector("button")!);   // row 2 is B now
  await userEvent.click(t.rows()[1]!.querySelector("button")!);   // row 1 is A now
  await t.until(() => t.picked.length === 3);
  expect(t.picked).toEqual(["c", "b", "a"]);

  // 7. Remove B: its node and its handler go; a later return is a new, empty occurrence.
  const buttonB = rowB.querySelector("button")!;

  await t.invoke("app/order", ["c", "a"]);
  expect(rowB.isConnected).toBe(false);
  buttonB.click();
  await new Promise((r) => setTimeout(r, 50));
  expect(t.picked).toEqual(["c", "b", "a"]);                    // the detached B reaches nothing
  await t.invoke("app/order", ["c", "a", "b"]);
  const rowB2 = t.byLabel("B");

  expect(rowB2).not.toBe(rowB);
  expect(t.input(rowB2).value).toBe("");
  await userEvent.click(rowB2.querySelector("button")!);
  await t.until(() => t.picked.length === 4);
  expect(t.picked.at(-1)).toBe("b");

  expect(t.ops.every((op, i) => op === (i === 0 ? "draw" : "update"))).toBe(true);   // every change is an update
  await t.close();
});
