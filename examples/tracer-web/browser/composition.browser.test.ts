// Composition, in real Chromium: a keyed list (mesh-each) selecting an item starts APP-OWNED async work; conditional banners (mesh-if) show loading / result / error.
// While work is in flight the list reorders; a newer selection supersedes an older one; the old completion is stale; closing the application interrupts what is left.
// The async work is a gate per call that the test opens, so nothing depends on timing. The stale-result technique is the established one: a ticket the command keeps.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import * as Nexus from "@valancex/nexus";
import type { HydrationResult } from "@valancex/port-web";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { userEvent } from "@vitest/browser/context";
import { Deferred, Effect, Schema, Scope } from "effect";
import { beforeAll, expect, inject, it } from "vitest";

const program = inject("composition");

beforeAll(async () => { await init(wasmUrl); });

const Item = Schema.Struct({ id: Schema.String, label: Schema.String });
const State = Schema.Struct({ items: Schema.Array(Item), selected: Schema.String, status: Schema.Literal("idle", "loading", "done", "failed"), result: Schema.String });
type State = typeof State.Type;
type Outcome = { readonly ok: true; readonly value: string } | { readonly ok: false };

const primitives: Web.WebPrimitives = {
  page: { element: "section", props: { title: Web.attribute("aria-label") } },
  text: { element: "span" },
  row: { element: "div" },
  field: { element: "input" },
  button: { element: "button", events: { click: { type: "click" } } },
};

const boot = async () => {
  const ops: Array<string> = [];
  const calls: Array<{ readonly id: string; readonly gate: Deferred.Deferred<Outcome>; interrupted: boolean }> = [];
  const app = Valance.define({
    name: "composition",
    state: { schema: State, initial: { items: ["a", "b", "c"].map((id) => ({ id, label: id.toUpperCase() })), selected: "", status: "idle", result: "" } },
    views: { board: { program, scope: (s: State) => ({ title: "t", loading: s.status === "loading", failed: s.status === "failed", selected: s.selected, result: s.result, items: s.items.map((item) => ({ ...item })) }) } },
    view: () => "board",
    commands: (state) => {
      const command = Valance.command(state);
      let latest = 0;
      const set = (change: (s: State) => State) => state.update((s) => Effect.succeed(change(s)));

      return {
        order: command(Schema.Struct({ ids: Schema.Array(Schema.String) }), ({ ids }, s) => ({ ...s, items: ids.map((id) => s.items.find((item) => item.id === id) ?? { id, label: id.toUpperCase() }) })),
        // The established ticket: each selection takes the next number; a completion that is no longer the latest is dropped.
        select: Nexus.Command.define("board.select", Schema.Struct({ id: Schema.String }), ({ id }) => Effect.gen(function* () {
          const mine = ++latest;
          const call = { id, gate: yield* Deferred.make<Outcome>(), interrupted: false };

          calls.push(call);
          yield* set((s) => ({ ...s, selected: id, status: "loading" }));

          const outcome = yield* Deferred.await(call.gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { call.interrupted = true; })));

          if (mine !== latest) { return; }
          yield* set((s) => outcome.ok ? { ...s, status: "done", result: outcome.value } : { ...s, status: "failed" });
        })),
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

  const rows = () => Array.from(main.querySelectorAll("section > div")) as Array<HTMLElement>;
  const input = (row: HTMLElement) => row.querySelector("input") as HTMLInputElement;
  const labels = () => rows().map((row) => row.querySelector("button")!.textContent);
  const banners = () => Array.from(main.querySelectorAll("section > span")).map((el) => el.textContent);
  const until = async (done: () => boolean | Promise<boolean>) => { for (let i = 0; !(await done()); i += 1) { if (i > 400) { throw new Error(`timed out: ${labels().join(",")} / ${banners().join(",")} / ${ops.join(",")}`); } await new Promise((r) => setTimeout(r, 5)); } };
  const click = (label: string) => userEvent.click(rows().find((row) => row.querySelector("button")!.textContent === label)!.querySelector("button")!);
  const reorder = async (ids: ReadonlyArray<string>) => { const before = ops.length; await Effect.runPromise(handle.invoke("app/order", [{ value: ids }] as never)); await until(() => ops.length > before); };
  const open = (n: number, outcome: Outcome) => Effect.runPromise(Deferred.succeed(calls[n]!.gate, outcome));

  return { ops, calls, main, rows, input, labels, banners, until, click, reorder, open, state: () => Effect.runPromise(handle.state), close: () => Effect.runPromise(Scope.close(scope, { _tag: "Success", value: undefined } as never)) };
};

it("selection, reorder, supersession, stale completion, failure and close compose: owned work, keyed identity, conditional banners", async () => {
  const t = await boot();
  const [rowA, rowB, rowC] = t.rows() as [HTMLElement, HTMLElement, HTMLElement];

  await userEvent.type(t.input(rowB), "vb");
  expect(t.banners()).toEqual(["result: "]);                             // idle: the "not loading" alternative; no error

  // 1. A click on item A's own row starts app-owned work; the loading branch appears.
  await t.click("A");
  await t.until(() => t.calls.length === 1 && t.banners()[0] === "loading a");
  expect(t.calls[0]!.id).toBe("a");
  expect(t.banners()).toEqual(["loading a"]);                            // loading replaces the result alternative

  // 2. The list reorders while that work is in flight: A moves, nothing else is recreated, B keeps what was typed, the work is untouched.
  await t.reorder(["c", "b", "a"]);
  expect(t.labels()).toEqual(["C", "B", "A"]);
  expect(t.rows()).toEqual([rowC, rowB, rowA]);
  expect(t.input(rowB).value).toBe("vb");
  expect(t.calls[0]!.interrupted).toBe(false);
  expect(t.banners()).toEqual(["loading a"]);

  // 3. A newer selection (B, now in the middle) supersedes A's request.
  await t.click("B");
  await t.until(() => t.calls.length === 2 && t.banners()[0] === "loading b");

  // 4. A's completion arrives late: it is stale and changes nothing.
  await t.open(0, { ok: true, value: "A-result" });
  await new Promise((r) => setTimeout(r, 50));
  expect((await t.state()).status).toBe("loading");
  expect((await t.state()).result).toBe("");
  expect(t.banners()).toEqual(["loading b"]);

  // 5. B's completion is the latest: loading goes away.
  await t.open(1, { ok: true, value: "B-result" });
  await t.until(() => t.banners().join() === "result: B-result");   // loading replaced by the result alternative
  expect(await t.state()).toMatchObject({ status: "done", result: "B-result", selected: "b" });

  // 6. A failure: the error branch appears (the other conditional stays absent); the list reorders again meanwhile.
  await t.click("C");
  await t.until(() => t.calls.length === 3 && t.banners()[0] === "loading c");
  await t.reorder(["b", "a", "c"]);
  expect(t.rows()).toEqual([rowB, rowA, rowC]);
  await t.open(2, { ok: false });
  await t.until(() => t.banners().join() === "result: B-result,error c");
  expect(t.input(rowB).value).toBe("vb");

  // 7. Work in flight when the application closes is interrupted, and nothing realized stays live.
  await t.click("A");
  await t.until(() => t.calls.length === 4);
  const buttonA = rowA.querySelector("button")!;

  await t.close();
  await t.until(() => t.calls[3]!.interrupted);
  expect(t.calls.map((call) => call.interrupted)).toEqual([false, false, false, true]);   // settled calls were not interrupted; only the one in flight was
  buttonA.click();
  await new Promise((r) => setTimeout(r, 50));
  expect(t.calls).toHaveLength(4);                                       // no handler remains: the click starts nothing
  expect(t.ops.every((op, i) => op === (i === 0 ? "draw" : "update"))).toBe(true);
});
