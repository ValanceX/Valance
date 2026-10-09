// Conditional structure through the whole stack, in real Chromium: state → view (a compiled program with `mesh-if`) → MESH render → Valance.mount → PORT Web update → DOM.
// Observed, not assumed: which DOM nodes survive a branch change, what happens to a branch that goes away and returns, and which handler a click reaches.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import type { HydrationResult } from "@valancex/port-web";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { userEvent } from "@vitest/browser/context";
import { Effect, Schema, Scope } from "effect";
import { beforeAll, expect, inject, it } from "vitest";

const program = inject("conditional");

beforeAll(async () => { await init(wasmUrl); });

const State = Schema.Struct({ on: Schema.Boolean, field: Schema.Boolean, n: Schema.Number });
type State = typeof State.Type;

const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  field: { element: "input" },
  button: { element: "button", events: { click: { type: "click" } } },
};

const boot = async () => {
  const log: Array<string> = [];
  const ops: Array<string> = [];
  const app = Valance.define({
    name: "conditional",
    state: { schema: State, initial: { on: true, field: false, n: 0 } },
    views: { branches: { program, scope: (s: State) => ({ title: "t", on: s.on, field: s.field, tail: `n=${s.n}` }) } },
    view: () => "branches",
    commands: (state) => {
      const command = Valance.command(state);
      const logged = (name: string, change: (s: State) => State) => command((s) => { log.push(name); return change(s); });

      return {
        turnOff: logged("turnOff", (s) => ({ ...s, on: false })),
        turnOn: logged("turnOn", (s) => ({ ...s, on: true })),
        showField: logged("showField", (s) => ({ ...s, field: true })),
        hideField: logged("hideField", (s) => ({ ...s, field: false })),
        bump: logged("bump", (s) => ({ ...s, n: s.n + 1 })),
      };
    },
  });
  const main = document.createElement("main");

  document.body.append(main);

  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
  const target: Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> = (report) => {
    const port = Web.target({ container: main, primitives })(report);

    return {
      draw: (tree) => { ops.push("draw"); port.draw(tree); },
      update: (tree) => { ops.push("update"); port.update(tree); },
      hydrate: (tree) => port.hydrate(tree),
      unmount: () => { port.unmount(); },
    };
  };

  await Effect.runPromise(Valance.mount(handle, target).pipe(Scope.extend(scope)));

  const section = () => main.firstElementChild as HTMLElement;
  const kids = () => Array.from(section().children) as Array<HTMLElement>;
  const shape = () => kids().map((el) => (el.tagName === "BUTTON" || el.tagName === "SPAN" ? el.textContent : el.tagName.toLowerCase())).join("|");
  const button = (label: string) => kids().find((el) => el.tagName === "BUTTON" && el.textContent === label)!;
  const until = async (done: () => boolean) => { for (let i = 0; !done(); i += 1) { if (i > 400) { throw new Error(`timed out: ${shape()} / ${ops.join(",")}`); } await new Promise((r) => setTimeout(r, 5)); } };
  const click = async (label: string, expectedOps: number) => { await userEvent.click(button(label)); await until(() => ops.length === expectedOps); };

  const invoke = (key: string) => Effect.runPromise(handle.invoke(key, [] as never));

  return { log, ops, main, invoke, section, shape, button, click, until, close: () => Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)) };
};

it("a branch swap in place: head and tail keep their nodes, the alternatives are different nodes, and the click reaches the ACTIVE alternative's command", async () => {
  const t = await boot();
  const head = t.section().children[0]!;
  const tail = t.section().lastElementChild!;

  expect(t.shape()).toBe("head|A|show field|hide field|bump|n=0");
  const a = t.button("A");

  await t.click("A", 2);                                  // A → turnOff → on=false → alternative B at the same place
  expect(t.log).toEqual(["turnOff"]);
  expect(t.shape()).toBe("head|B|show field|hide field|bump|n=0");
  const b = t.button("B");

  expect(a.isConnected).toBe(false);                      // the removed alternative leaves the document …
  expect(b).not.toBe(a);                                  // … and its twin is a new node, not A relabelled (distinct sites)
  expect(t.section().children[0]).toBe(head);             // static siblings keep their nodes
  expect(t.section().lastElementChild).toBe(tail);

  await t.click("B", 3);                                  // the click on B reaches B's command, not A's stale one
  expect(t.log).toEqual(["turnOff", "turnOn"]);
  expect(t.shape()).toBe("head|A|show field|hide field|bump|n=0");
  expect(t.button("A")).not.toBe(a);                      // a returning alternative is a NEW node (the old A is gone for good)
  expect(t.ops).toEqual(["draw", "update", "update"]);    // every change is one update, never a draw

  // A removed node's handler is gone with it: a click on the detached A reaches nothing.
  a.click();
  await new Promise((r) => setTimeout(r, 50));
  expect(t.log).toEqual(["turnOff", "turnOn"]);
  await t.close();
});

it("a stateful element in a conditional: it survives unrelated updates, and when its branch goes away and returns it is a fresh element without the old DOM state", async () => {
  const t = await boot();
  const head = t.section().children[0]!;

  await t.click("show field", 2);
  const input = t.section().querySelector("input") as HTMLInputElement;

  expect(t.shape()).toBe("head|A|input|show field|hide field|bump|n=0");
  await userEvent.type(input, "abc");
  expect(input.value).toBe("abc");
  expect(document.activeElement).toBe(input);

  await t.invoke("app/bump");                             // unrelated update, no click (a click would move focus): the field is the same site, so the same element
  await t.until(() => t.ops.length === 3);
  expect(t.section().querySelector("input")).toBe(input);
  expect(input.value).toBe("abc");
  expect(document.activeElement).toBe(input);

  await t.click("hide field", 4);                         // the branch goes away
  expect(input.isConnected).toBe(false);
  expect(t.section().querySelector("input")).toBeNull();
  expect(t.shape()).toBe("head|A|show field|hide field|bump|n=1");

  await t.click("show field", 5);                         // … and returns: same identity to MESH, but a new occurrence to the DOM
  const back = t.section().querySelector("input") as HTMLInputElement;

  expect(back).not.toBe(input);
  expect(back.value).toBe("");
  expect(document.activeElement).not.toBe(back);
  expect(t.section().children[0]).toBe(head);
  expect(t.ops).toEqual(["draw", "update", "update", "update", "update"]);
  expect(t.log).toEqual(["showField", "bump", "hideField", "showField"]);
  await t.close();
});
