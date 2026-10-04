// Stage 56 — closure tracer: one realistic application over the public API, composing every boundary the earlier stages probed one at a time.
//   start with an application-owned capability → mount → a command that reads state, uses the capability and commits → presentation → an event from the retained render (a view
//   change, and back) → a capability failure before a commit, and one after it → history and its navigate command → a second mount → one mount closes → history closes → the
//   application closes: its resource released once, nothing committing or reaching the capability afterwards
import type { WebPort } from "@valancex/port-web";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Layer, Schema, Scope } from "effect";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { application, urlOf, stateOf, type AppState } from "../src/catalog/app.js";
import { compilePrograms } from "../src/catalog/compile.js";
import { Catalog, type CatalogService } from "../src/catalog/service.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const kind = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "success" : Cause.isInterruptedOnly(exit.cause) ? "interrupted" : Cause.isDieType(exit.cause) ? `die ${String((exit.cause.defect as Error).message).slice(0, 50)}` : Cause.isFailType(exit.cause) ? `fail ${(exit.cause.error as { _tag: string })._tag}` : "other";

describe("one application, every boundary at once", () => {
  it("start → capability command → presentation → events and view changes → capability failures → history → two mounts → closes → application close", async () => {
    const programs = await compilePrograms();
    const counts = { acquired: 0, released: 0, uses: 0 };
    const platform: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.map(
      Effect.acquireRelease(
        Effect.sync((): CatalogService => { counts.acquired += 1; return { lookup: (id) => { counts.uses += 1; if (id.startsWith("BOOM")) { throw new Error("capability exploded"); } return `item-${id}`; }, close: () => { counts.released += 1; } }; }),
        (service) => Effect.sync(() => { service.close(); })
      ),
      (implementation) => ({ resolutions: new Map([[Catalog.id, { _tag: "Available" as const, implementation }]]) })
    ));
    const base = application(programs);
    const first = (args: ReadonlyArray<Nexus.Mesh.IntentArgument>): unknown => (args[0] !== undefined && "value" in args[0] ? args[0].value : undefined);
    const app = Valance.define({
      ...base,
      commands: (state: Nexus.State.StateHandle<AppState>) => {
        const add = (id: string) => state.update((current): Effect.Effect<AppState> => Effect.succeed({ ...current, items: [...current.items, { id, name: `item-${id}` }] }));
        const lookup = (id: string) => Effect.flatMap(Nexus.Capability.require(Catalog), (catalog) => Effect.sync(() => catalog.lookup(id)));
        const define = (name: string, body: (id: string) => Effect.Effect<unknown, unknown, never>) =>
          Nexus.Mesh.bind(Nexus.Command.define(name, Schema.Struct({ id: Schema.String }) as never, (({ id }: { id: string }) => body(id)) as never), ((args: ReadonlyArray<Nexus.Mesh.IntentArgument>) => ({ id: first(args) })) as never);

        return {
          ...base.commands(state),
          // reads state, uses the capability, commits what it answered
          "app/addFromCatalog": define("addFromCatalog", (id) => Effect.gen(function* () {
            const before = yield* state.get;
            const name = yield* lookup(id);

            yield* state.update((current): Effect.Effect<AppState> => Effect.succeed({ ...current, items: [...before.items, { id, name }] }));
          }) as never),
          "app/failBeforeCommit": define("failBeforeCommit", (id) => Effect.zipRight(lookup(`BOOM-${id}`), add(id)) as never),
          "app/failAfterCommit": define("failAfterCommit", (id) => Effect.zipRight(add(id), lookup(`BOOM-${id}`)) as never),
        } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
      },
    });

    // ── start: one application, its resource acquired by start, nothing presented yet
    const appScope = await run(Scope.make());
    const handle = await run(Valance.start(app, { platform }).pipe(Scope.extend(appScope)));
    const stateNow = () => run(handle.state);
    const invoke = (key: string, value?: unknown) => Effect.runPromise(Effect.exit(handle.invoke(key, value === undefined ? [] : [{ value } as never])));

    expect(counts).toEqual({ acquired: 1, released: 0, uses: 0 });
    expect(Object.keys(handle).sort()).toEqual(["invoke", "state"]);

    // ── mounts: each owns a container, a target and its own retained render
    const mount = async () => {
      const page = load("");
      const ops: Array<string> = [];
      const scope = await run(Scope.make());

      await run(Valance.mount(handle, ((report) => { const port = Web.target({ container: page.container, primitives })(report); return { draw: (t) => { port.draw(t); ops.push("draw"); }, update: (t) => { port.update(t); ops.push("update"); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } }; }) as Valance.TargetFactory<WebPort>).pipe(Scope.extend(scope)));

      return {
        page, ops, scope,
        text: () => page.container.textContent ?? "",
        home: (summary: string) => (page.container.textContent ?? "").includes("Reverse") && (page.container.textContent ?? "").includes(summary),   // the home view (its button), not the details view that shows the same summary
        press: (label: string) => { page.click([...page.container.querySelectorAll("button")].find((b) => b.textContent === label)!); },
        close: () => run(Scope.close(scope, Exit.void)),
      };
    };
    const one = await mount();

    expect(one.ops).toEqual(["draw"]);
    expect(one.text()).toContain("1 items: Alpha");

    // ── a command that reads state, uses the capability and commits; presented as an update
    expect(kind(await invoke("app/addFromCatalog", "Z9"))).toBe("success");
    await until(() => one.text().includes("2 items: Alpha, item-Z9"));
    expect(counts).toEqual({ acquired: 1, released: 0, uses: 1 });
    expect(one.ops).toEqual(["draw", "update"]);

    // ── an event from the retained render: a view change (draw), and back (draw); state and resource lifetime carry through
    one.press("Open first");
    await until(() => one.text().includes("Item A: Alpha"));
    expect(one.ops).toEqual(["draw", "update", "draw"]);
    one.press("Back");
    await until(() => one.home("2 items: Alpha, item-Z9"));
    expect(one.ops).toEqual(["draw", "update", "draw", "draw"]);
    expect((await stateNow()).items.length).toBe(2);
    expect(counts.acquired).toBe(1);

    // ── capability failures: before a commit nothing commits, after one the commit stays; neither ends anything
    expect(kind(await invoke("app/failBeforeCommit", "X1"))).toBe("die capability exploded");
    expect((await stateNow()).items.map((i) => i.id)).toEqual(["A", "Z9"]);
    expect(kind(await invoke("app/failAfterCommit", "X2"))).toBe("die capability exploded");
    expect((await stateNow()).items.map((i) => i.id)).toEqual(["A", "Z9", "X2"]);       // the commit is not rolled back
    await until(() => one.text().includes("3 items: Alpha, item-Z9, item-X2"));
    expect(kind(await invoke("app/addFromCatalog", "Y3"))).toBe("success");              // the application is as usable as before
    await until(() => one.home("4 items"));
    expect(counts).toEqual({ acquired: 1, released: 0, uses: 4 });

    // ── history and the application's own navigate command
    const dom = new JSDOM(`<!doctype html><main></main>`, { url: "http://localhost/" });
    const pushed: Array<string> = [];
    const push = dom.window.history.pushState.bind(dom.window.history);

    dom.window.history.pushState = (data, unused, target) => { pushed.push(String(target)); push(data, unused, target); };
    const historyScope = await run(Scope.make());

    await run(Web.history(handle, { window: dom.window as unknown as Window, urlOf, stateOf, navigate: "app/navigate" }).pipe(Scope.extend(historyScope)));
    await sleep(30);
    expect(pushed).toEqual([]);                                                          // baseline = current state
    expect(kind(await invoke("app/navigate", { view: "details", id: "Z9" }))).toBe("success");
    await until(() => pushed.length === 1);
    expect(pushed).toEqual(["/items/Z9"]);
    await until(() => one.text().includes("Item Z9: item-Z9"));
    dom.window.history.back();                                                           // popstate → stateOf → the same navigate command
    await until(() => one.home("4 items"));
    expect((await stateNow()).view).toBe("home");

    // ── a second mount: the same application, its own presentation state
    const two = await mount();

    expect(two.ops).toEqual(["draw"]);
    expect(two.text()).toContain("4 items");
    two.press("Open first");                                                             // two's own retained render dispatches the same application's command
    await until(() => two.text().includes("Item A: Alpha") && one.text().includes("Item A: Alpha"));
    expect((await stateNow()).view).toBe("details");                                     // one view, one state, two presentations of it
    two.press("Back");
    await until(() => two.home("4 items") && one.home("4 items"));

    // ── closes, each at its own boundary; the resource outlives both consumers
    await one.close();
    expect(one.ops.at(-1)).toBe("unmount");
    expect(counts).toEqual({ acquired: 1, released: 0, uses: 4 });
    expect(kind(await invoke("app/addFromCatalog", "W4"))).toBe("success");              // the application and the other mount carry on
    await until(() => two.home("5 items"));
    await run(Scope.close(historyScope, Exit.void));
    expect(counts).toEqual({ acquired: 1, released: 0, uses: 5 });
    dom.window.history.pushState(null, "", "/elsewhere");
    dom.window.history.back();
    await sleep(40);
    expect((await stateNow()).items.length).toBe(5);                                     // history is gone: its popstate handles nothing

    // ── the application closes: state readable, nothing commits, the capability is never reached again, the resource releases once
    const final = await stateNow();

    await run(Scope.close(appScope, Exit.void));
    expect(counts).toEqual({ acquired: 1, released: 1, uses: 5 });
    expect(kind(await invoke("app/addFromCatalog", "V5"))).toMatch(/^die /);
    expect(kind(await invoke("app/failAfterCommit", "V6"))).toMatch(/^die /);
    expect(kind(await invoke("app/nothing"))).toBe("fail UnmappedCommand");
    expect(await stateNow()).toEqual(final);
    expect(counts.uses).toBe(5);
    await sleep(60);
    expect(two.ops.every((op) => ["draw", "update"].includes(op))).toBe(true);           // the second mount is inert, not unmounted
    await two.close();
    expect(two.ops.at(-1)).toBe("unmount");
    await run(Scope.close(appScope, Exit.void));
    expect(counts).toEqual({ acquired: 1, released: 1, uses: 5 });                       // exactly once
  });
});
