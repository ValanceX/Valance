// Stage 37 — the hydration commit boundary. Hydration shares the draw/update rule: VALANCE retains the render (`drawn.current`) when the target's `hydrate` RETURNS.
//   adoption or mismatch that PORT handles → a successful presentation (`hydration` says which); the client render is retained
//   a throwing hydrate (before or after PORT touched the container) → no Mounted, no retained render, nothing dispatches from the physical DOM; PORT's partial effects are PORT's
//   a successful hydrate is the continuity baseline (same view → update); a fresh attempt starts from current state
// Server markup is for A0 = ids [A,B] (or another state); B's button is the intent to observe.
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Cause, Effect, Exit, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { primitives } from "../src/catalog/web.js";
import { until, load } from "./helpers.js";
import { boot, run } from "./structure-fixture.js";

type Booted = Awaited<ReturnType<typeof boot>>;
type State = Parameters<typeof boot>[0] & object;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const A0: State = { view: "a", show: false, ids: ["A", "B"], n: 0 };

const served = (b: Booted, state: State) => run(renderToHtml(b.app, { primitives, state })).then((r) => r.html);

/** Hydrate `b` into a container holding `html`. `throws` makes the target's hydrate throw before or after PORT hydrated; `reports` are the interactions PORT handed to VALANCE. */
const hydrateOn = async (b: Booted, html: string, options: { readonly throws?: "before" | "after"; readonly page?: ReturnType<typeof load>; readonly updateThrows?: () => boolean } = {}) => {
  const page = options.page ?? load(html);
  const errors: Array<string> = [];
  const ops: Array<string> = [];
  const reports: Array<{ readonly handler: string; readonly send: () => void }> = [];
  const scope = await run(Scope.make());

  page.window.addEventListener("error", (event) => { errors.push(event.message); });
  if (options.page !== undefined) { page.container.innerHTML = html; }
  const factory: Valance.TargetFactory<ReturnType<ReturnType<typeof Web.target>>> = (report) => {
    const port = Web.target({ container: page.container, primitives })((handler, payload) => { reports.push({ handler, send: () => { report(handler, payload); } }); report(handler, payload); });

    return {
      draw: (t) => { port.draw(t); ops.push("draw"); },
      update: (t) => { if (options.updateThrows?.() === true) { port.update(t); throw new Error("update failed after mutation"); } port.update(t); ops.push("update"); },
      hydrate: (t) => {
        if (options.throws === "before") { throw new Error("hydrate failed"); }
        const result = port.hydrate(t);

        if (options.throws === "after") { throw new Error("hydrate failed after mutation"); }
        ops.push("hydrate");

        return result;
      },
      unmount: () => { port.unmount(); ops.push("unmount"); },
    };
  };
  const exit = await Effect.runPromise(Valance.hydrate(b.handle, factory).pipe(Scope.extend(scope), Effect.exit, Effect.timeoutTo({ duration: "800 millis", onSuccess: (e) => e as Exit.Exit<Valance.Mounted<never> & { readonly hydration: { readonly adopted: boolean } }, unknown> | "hung", onTimeout: () => "hung" as const })));
  const ok = exit !== "hung" && Exit.isSuccess(exit) ? exit.value : undefined;

  return {
    exit, ok, page, ops, errors, reports, scope,
    rows: () => Array.from(page.container.querySelectorAll("div")).map((d) => d.querySelector("span")!.textContent),
    click: (index: number) => { page.click(page.container.querySelectorAll("div")[index]!.querySelector("button")!); },
    close: () => run(Scope.close(scope, Exit.void)),
  };
};
const defectOf = (exit: unknown): string => Exit.isFailure(exit as Exit.Exit<unknown, unknown>) && Cause.isDieType((exit as { cause: Cause.Cause<unknown> }).cause) ? ((exit as { cause: { defect: Error } }).cause.defect).message : "not a defect";

describe("successful hydration", () => {
  it("adoption: the render is retained when hydrate returns; events resolve against it", async () => {
    const b = await boot();
    const h = await hydrateOn(b, await served(b, A0));

    expect(h.ok?.hydration.adopted).toBe(true);
    expect(h.ops).toEqual(["hydrate"]);
    h.click(1);
    await until(() => h.ok!.dispatched.length === 1);
    expect(b.taps).toEqual(["B"]);
    expect(Exit.isSuccess(h.ok!.dispatched[0]!)).toBe(true);
    await h.close();
  });

  it("a mismatch is not a failure: the client render wins, is retained, and its events resolve", async () => {
    const b = await boot();
    const h = await hydrateOn(b, await served(b, { ...A0, ids: ["A", "B", "C"] }));

    expect(h.ok?.hydration.adopted).toBe(false);
    expect(h.rows()).toEqual(["A", "B"]);
    h.click(1);
    await until(() => h.ok!.dispatched.length === 1);
    expect(b.taps).toEqual(["B"]);
    await h.close();
  });

  it("the hydrated render is the continuity baseline: same view → update (events against the new render), another view → draw", async () => {
    const b = await boot();
    const h = await hydrateOn(b, await served(b, A0));

    await b.invoke("app/ids", ["A", "C"]);
    await until(() => h.ops.length === 2);
    expect(h.ops).toEqual(["hydrate", "update"]);
    h.click(1);                                                          // C: H1 only
    await until(() => h.ok!.dispatched.length === 1);
    expect(b.taps).toEqual(["C"]);
    expect(Exit.isSuccess(h.ok!.dispatched[0]!)).toBe(true);
    await b.invoke("app/toggleView");
    await until(() => h.ops.length === 3);
    expect(h.ops).toEqual(["hydrate", "update", "draw"]);
    await h.close();
  });
});

for (const throws of ["before", "after"] as const) {
  describe(`hydrate throws ${throws} PORT hydrated`, () => {
    it("no Mounted: the effect fails with that defect; nothing is retained, so the physical DOM dispatches nothing", async () => {
      const b = await boot();
      // server markup for a DIFFERENT state, so a PORT draw-afresh is observable
      const html = await served(b, { ...A0, show: true, ids: ["A", "B", "C"] });
      const h = await hydrateOn(b, html, { throws });

      expect(defectOf(h.exit)).toBe(throws === "before" ? "hydrate failed" : "hydrate failed after mutation");
      expect(h.ok).toBeUndefined();
      expect(h.ops).toEqual([]);                                         // a throwing hydrate is no presentation
      expect(h.page.container.innerHTML === html).toBe(throws === "before");   // physical state is PORT's: untouched, or already the client's render
      expect(h.rows()).toEqual(throws === "before" ? ["A", "B", "C"] : ["A", "B"]);
      h.click(1);
      await sleep(40);
      expect(b.taps).toEqual([]);                                        // nothing logically retained: nothing dispatches
      // before: PORT never took the container, so no listener exists; after: PORT's listener exists and VALANCE refuses an interaction with nothing retained
      expect(h.reports.length).toBe(throws === "before" ? 0 : 1);
      expect(h.errors.some((m) => m.includes("before anything was drawn"))).toBe(throws === "after");
      await h.close();
      expect(h.ops).toEqual([]);                                         // no finalizer was registered: the failed attempt is never unmounted
    });

    it("application commits continue and the failed attempt presents nothing; a fresh mount in the same container draws the current state and does not inherit it", async () => {
      const b = await boot();
      const html = await served(b, { ...A0, ids: ["A", "B", "C"] });
      const h = await hydrateOn(b, html, { throws });

      await b.invoke("app/ids", ["A", "C", "D"]);
      await sleep(40);
      expect(h.ops).toEqual([]);
      expect((await b.state()).ids).toEqual(["A", "C", "D"]);
      await h.close();

      const fresh = await b.mountOn({ page: h.page });

      expect(fresh.ops).toEqual(["draw"]);
      expect(fresh.rows()).toEqual(["A", "C", "D"]);
      h.errors.length = 0;
      h.click(2);                                                        // D
      await until(() => b.taps.length >= 1);
      await sleep(40);
      expect(b.taps).toEqual(["D"]);                                     // dispatched once, by the fresh mount's retained render
      expect(fresh.mounted.dispatched.length).toBe(1);
      await fresh.close();
    });
  });
}

describe("hydrate beside other mounts", () => {
  it("a hydrated mount and a normal mount have independent retained renders; a later update failure in one leaves the other's untouched", async () => {
    const b = await boot();
    let fails = false;
    const h = await hydrateOn(b, await served(b, A0));
    const plain = await b.mountOn({ updateThrows: () => fails ? "after" : undefined });

    h.click(1);
    plain.page.click(plain.rowEls()[1]!.querySelector("button")!);
    await until(() => b.taps.length === 2);
    fails = true;
    await b.invoke("app/ids", ["A", "C"]);
    await until(() => h.ops.length === 2);
    await sleep(40);
    expect(h.ops).toEqual(["hydrate", "update"]);
    expect(plain.ops).toEqual(["draw"]);
    h.click(1);                                                          // C: hydrated mount's H1
    plain.reports.find((r) => r.handler !== undefined)!.send();          // B: the failed mount's retained A0
    await until(() => h.ok!.dispatched.length === 2 && plain.mounted.dispatched.length === 2);
    expect(h.ok!.dispatched.map(Exit.isSuccess)).toEqual([true, true]);
    expect(plain.mounted.dispatched.map(Exit.isSuccess)).toEqual([true, true]);
    expect(b.taps).toEqual(["B", "B", "C", "B"]);
    await h.close();
    await plain.close();
  });
});
