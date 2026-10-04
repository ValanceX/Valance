// The presentation boundary VALANCE draws, and what lies beyond it. VALANCE's retained render is what VALANCE/PORT successfully PRESENTED, not a snapshot of the physical
// DOM that it keeps observing. Physical integrity of the realized target after a successful draw/update belongs to PORT (which realizes it from its own record of the
// drawn tree) and to whoever else touches that DOM; VALANCE neither watches, reconciles, repairs nor reports it.
//   drift alone          nothing happens: no rerender, no failure
//   update               VALANCE asks PORT for the normal `update` from the application's state transition; PORT applies it relative to ITS record, not to the physical DOM
//   view change          a normal `draw`: the whole container is realized afresh, whatever the DOM was
//   events               resolve through the retained render (handler identity), never through DOM labels or metadata; an element PORT did not create is simply not reachable
//   removal              a later commit still updates (PORT's record), nothing fails, nothing redraws: no recovery in VALANCE
//   close                unmount clears the container wholesale; one unmount; no VALANCE bookkeeping depends on the DOM
//   two mounts           independent
import { describe, expect, it } from "vitest";

import { boot, sleep } from "./two-view-fixture.js";

type Booted = Awaited<ReturnType<typeof boot>>;
type Mounted = Awaited<ReturnType<Booted["mountOn"]>>;

const section = (m: Mounted): Element | null => m.page.container.querySelector("section");
const clickOn = (m: Mounted, element: Element): void => { m.page.click(element); };

describe("external mutation of a successfully realized target", () => {
  it("1 drift alone: no rerender, no failure, nothing reported; the DOM simply differs from the render", async () => {
    const b = await boot();
    const m = await b.mountOn();

    m.page.container.querySelector("span")!.textContent = "EDITED";
    section(m)!.setAttribute("aria-label", "EXT");
    await sleep(80);
    expect(m.ops).toEqual(["draw A0"]);                                                      // no spontaneous update or redraw
    expect(await m.standing()).toBe("following");                                            // not a failure of any kind
    expect(section(m)!.getAttribute("aria-label")).toBe("EXT");                              // VALANCE did not undo it
    expect(m.ledger()).toEqual([]);
    await m.close();
  });

  it("2 a same-view update after drift is the normal `update` from the state transition, applied by PORT to its own record: it succeeds, keeps the realized elements, and the render's own value is presented", async () => {
    const b = await boot();
    const m = await b.mountOn();
    const root = section(m);

    m.page.container.querySelector("span")!.textContent = "EDITED";
    section(m)!.setAttribute("aria-label", "EXT");
    await b.invoke("app/bump");
    await sleep(60);
    expect(m.ops).toEqual(["draw A0", "update A1"]);                                         // update, the C32 continuity: same view as the drawn one
    expect(section(m)).toBe(root);                                                           // PORT updated in place
    expect(section(m)!.getAttribute("aria-label")).toBe("A1");                               // what the render carries is what the target shows
    expect(await m.standing()).toBe("following");
    await m.close();
  });

  it("3 a view change after drift is a normal draw (the container is realized afresh, nothing of the drift survives), and so is coming back", async () => {
    const b = await boot();
    const m = await b.mountOn();
    const first = section(m);

    section(m)!.setAttribute("data-drift", "1");
    await b.invoke("app/toggle");
    await sleep(60);
    expect(m.ops).toEqual(["draw A0", "draw B0"]);
    expect(section(m)).not.toBe(first);
    expect(section(m)!.hasAttribute("data-drift")).toBe(false);
    await b.invoke("app/toggle");
    await sleep(60);
    expect(m.ops).toEqual(["draw A0", "draw B0", "draw A0"]);                                // a fresh A, not the old DOM
    expect(section(m)).not.toBe(first);
    await m.close();
  });

  it("4+8 events resolve through the retained render, not the DOM: a renamed button, forged metadata and a child added inside it all still dispatch the retained intent; an element PORT did not create is not reachable (a target/DOM fact, not a VALANCE rule)", async () => {
    const b = await boot();
    const m = await b.mountOn();
    const button = m.page.container.querySelector("button")!;

    button.textContent = "SOMETHING ELSE";
    button.setAttribute("data-handler", "forged");
    button.setAttribute("data-intent", "details/back");
    clickOn(m, button);
    await sleep(40);
    expect(b.log).toEqual(["commit back-on-a"]);                                             // the retained render's intent, whatever the label or metadata say
    const inner = m.page.container.ownerDocument.createElement("b");

    button.append(inner);
    clickOn(m, inner);                                                                       // inside a PORT-created element: still reaches it
    await sleep(40);
    expect(b.log).toEqual(["commit back-on-a", "commit back-on-a"]);
    const clone = button.cloneNode(true) as Element;

    button.replaceWith(clone);                                                               // an element PORT never created
    clickOn(m, clone);
    await sleep(40);
    expect(b.log).toHaveLength(2);                                                           // nothing to resolve: no dispatch, no failure
    expect(m.ledger()).toEqual(["succeeded", "succeeded"]);
    expect(await m.standing()).toBe("following");
    await m.close();
  });

  it("8b an INERT mount's retained event is likewise the retained render's, however its button now looks", async () => {
    const b = await boot();
    const m = await b.mountOn();

    await b.invoke("app/break");
    await sleep(60);
    expect(await m.standing()).toBe("failed MeshDiagnostics");
    m.page.container.querySelector("button")!.textContent = "RENAMED";
    clickOn(m, m.page.container.querySelector("button")!);
    await sleep(40);
    expect(b.log.at(-1)).toBe("commit back-on-a");
    expect(m.ledger()).toEqual(["succeeded"]);
    await m.close();
  });

  it("5 the realized DOM is removed externally: the next commit still gets its normal update (against PORT's record), nothing fails, nothing is redrawn or recovered by VALANCE", async () => {
    const b = await boot();
    const m = await b.mountOn();

    m.page.container.innerHTML = "";
    await b.invoke("app/bump");
    await sleep(60);
    expect(m.ops.filter((op) => op.startsWith("draw"))).toEqual(["draw A0"]);                // no new draw: no recovery
    expect(m.ops.filter((op) => op.startsWith("update"))).toHaveLength(1);                   // the update was asked for and did not fail
    expect(await m.standing()).toBe("following");
    expect(m.page.container.innerHTML).toBe("");                                             // the container stays as the outsider left it
    expect(await b.state()).toEqual({ view: "a", n: 1, bad: false });                        // application state is untouched by any of it
    await m.close();
  });

  it("6 closing after drift: one unmount, the container is cleared wholesale (foreign nodes included), the close succeeds, and no bookkeeping remains because the target was altered", async () => {
    const b = await boot();
    const m = await b.mountOn();

    section(m)!.append(m.page.container.ownerDocument.createElement("i"));
    m.page.container.append(m.page.container.ownerDocument.createElement("p"));
    await expect(m.close()).resolves.toBeUndefined();
    expect(m.ops).toEqual(["draw A0", "unmount"]);
    expect(m.page.container.innerHTML).toBe("");
    await expect(Promise.race([Promise.resolve(m.mounted.settled).then(() => "ok"), sleep(300).then(() => "x")])).resolves.toBeDefined();
    await b.invoke("app/bump");                                                              // the application and a fresh mount are unaffected
    const fresh = await b.mountOn({ page: m.page });

    expect(fresh.ops).toEqual(["draw A1"]);
    await fresh.close();
  });

  it("7 drift on one of two mounts changes nothing for the other: each follows the shared state through its own normal path", async () => {
    const b = await boot();
    const [drifted, other] = [await b.mountOn(), await b.mountOn()];

    drifted.page.container.querySelector("span")!.textContent = "ONLY-A";
    section(drifted)!.setAttribute("aria-label", "EXT-A");
    await b.invoke("app/bump");
    await sleep(60);
    expect(drifted.ops).toEqual(["draw A0", "update A1"]);
    expect(other.ops).toEqual(["draw A0", "update A1"]);                                     // the same operations, drift or not
    expect(other.page.container.innerHTML).toBe(`<section aria-label="A1"><span>Not found</span><button>Back</button></section>`);   // exactly the normal result
    expect([await drifted.standing(), await other.standing()]).toEqual(["following", "following"]);
    await b.invoke("app/toggle");
    await sleep(60);
    expect(drifted.ops.at(-1)).toBe("draw B1");                                              // the drifted mount draws afresh like the other
    expect(other.ops.at(-1)).toBe("draw B1");
    await drifted.close();
    await other.close();
  });
});
