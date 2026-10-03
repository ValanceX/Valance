// Who owns which failure, with several mounts at different presentation points (C31, C32).
//   MESH render failure   the invalid APPLICATION state is shared, the failure is each mount's own: every mount that actually RENDERS it fails on its own with the same diagnostic;
//                         a mount that skips it (C32) does not fail because another rendered it
//   target failure        local to one mount; it makes no other mount inert and a mount already inert is never failed a second time by another's failure
//   inert                 a mount keeps its own retained render for events (C31) and never resumes, however the state is repaired; a fresh mount starts from current state
//   application           stays authoritative: commits never wait for a mount, and no mount-level validity gate exists
import { Effect, Exit, Cause } from "effect";
import { describe, expect, it } from "vitest";

import { boot, sleep } from "./two-view-fixture.js";

type Booted = Awaited<ReturnType<typeof boot>>;
type Mounted = Awaited<ReturnType<Booted["mountOn"]>>;

/** The diagnostic a mount's follower ended with: the typed error, as JSON. */
const diagnosticOf = async (m: Mounted): Promise<string> => {
  const exit = await Effect.runPromise(m.mounted.followed);

  return Exit.isFailure(exit) && Cause.isFailType(exit.cause) ? JSON.stringify(exit.cause.error) : "none";
};

describe("shared MESH render failure versus mount-local target failure", () => {
  it("1 two live mounts reach a shared invalid state: each fails on its own with the same diagnostic, keeps its own last good render, and the application keeps committing", async () => {
    const b = await boot();
    const [one, two] = [await b.mountOn(), await b.mountOn()];

    await b.invoke("app/break");
    await sleep(60);
    expect([await one.standing(), await two.standing()]).toEqual(["failed MeshDiagnostics", "failed MeshDiagnostics"]);
    const [first, second] = [await diagnosticOf(one), await diagnosticOf(two)];

    expect(first).toContain("runtime-value-mismatch");
    expect(first).toBe(second);                                                              // the same relevant MESH diagnostic, once per mount
    expect([one.label(), two.label()]).toEqual(["A0", "A0"]);                                 // each retains its last good render
    expect([one.ops, two.ops]).toEqual([["draw A0"], ["draw A0"]]);
    await b.invoke("app/bump");                                                              // commits do not wait for the mounts
    expect(await b.state()).toEqual({ view: "a", n: 1, bad: true });
    await one.close();
    await two.close();
  });

  it("2 one mount presents the invalid state and fails; the other skips it and stays live and reaches the final valid state (arranged deterministically: each mount's own first update commits the next state)", async () => {
    for (let round = 0; round < 5; round += 1) {                                             // microtask ordering only: the same outcome every time
      const b = await boot();
      let breaks = false;
      let fixes = false;
      const failing = await b.mountOn({ onUpdate: () => { if (breaks) { breaks = false; Effect.runFork(b.rawInvoke("app/break")); } } });
      const skipping = await b.mountOn({ onUpdate: () => { if (fixes) { fixes = false; Effect.runFork(b.rawInvoke("app/fix")); } } });

      breaks = true;
      fixes = true;
      await b.invoke("app/bump");                                                            // valid; each mount's update of it then commits invalid, then valid
      await sleep(80);
      expect(b.log).toEqual(["commit bump", "commit break", "commit fix"]);                  // valid → invalid → valid
      expect(await failing.standing()).toBe("failed MeshDiagnostics");                       // it rendered the invalid state
      expect(await skipping.standing()).toBe("following");                                   // it never did: it went from the first update to the final valid state
      expect(failing.ops).toEqual(["draw A0", "update A1"]);
      expect(skipping.ops).toEqual(["draw A0", "update A1", "update A1"]);
      await b.invoke("app/bump");
      await sleep(40);
      expect(skipping.label()).toBe("A2");                                                   // and it keeps presenting
      expect(failing.label()).toBe("A1");                                                    // the failed one holds its last good render
      await failing.close();
      await skipping.close();
    }
  });

  it("3 a mount already inert from a target failure is not failed again when another mount hits the shared invalid state; its retained dispatch is unchanged", async () => {
    const b = await boot();
    let throws = false;
    const local = await b.mountOn({ updateThrows: () => throws });
    const other = await b.mountOn();

    throws = true;
    await b.invoke("app/bump");
    await sleep(60);
    expect(await local.standing()).toBe("defect update failed");
    expect(await other.standing()).toBe("following");
    await b.invoke("app/break");
    await sleep(60);
    expect(await other.standing()).toBe("failed MeshDiagnostics");                           // B fails on the invalid render
    expect(await local.standing()).toBe("defect update failed");                             // A keeps its own cause: no second failure
    expect(local.ops).toEqual(["draw A0"]);
    local.click();                                                                           // A's retained render still dispatches (C31)
    await sleep(60);
    expect(b.log.at(-1)).toBe("commit back-on-a");
    expect(local.ledger()).toEqual(["succeeded"]);
    expect(other.ledger()).toEqual([]);                                                      // and nothing leaked into the other mount's bookkeeping
    await local.close();
    await other.close();
  });

  it("4 mounts that retained DIFFERENT renders each dispatch their own, both commands run against current state, and neither presents", async () => {
    const b = await boot();
    let localThrows = false;
    let secondThrows = false;
    const local = await b.mountOn({ updateThrows: () => localThrows });                      // will retain view A's render
    const second = await b.mountOn({ updateThrows: () => secondThrows });                    // will retain view B's render

    localThrows = true;
    await b.invoke("app/bump");
    await sleep(40);
    await b.invoke("app/toggle");                                                            // the live mount draws view B
    await sleep(40);
    secondThrows = true;
    await b.invoke("app/bump");                                                              // its next update fails: it retains the view-B render
    await sleep(40);
    await b.invoke("app/toggle");                                                            // the application is back on view A
    await sleep(40);
    expect([local.label(), second.label()]).toEqual(["A0", "B1"]);
    expect(await b.state()).toEqual({ view: "a", n: 2, bad: false });

    local.click();                                                                           // retained A render: A's intent
    second.click();                                                                          // retained B render: B's intent
    await sleep(60);
    expect(b.log.filter((entry) => entry.startsWith("commit back"))).toEqual(["commit back-on-a", "commit back-on-b"]);
    expect(await b.state()).toEqual({ view: "a", n: 112, bad: false });                      // +10 and +100 on current state
    expect([local.ops, second.ops]).toEqual([["draw A0"], ["draw A0", "update A1", "draw B1"]]);   // neither presented
    expect([local.ledger(), second.ledger()]).toEqual([["succeeded"], ["succeeded"]]);
    await local.close();
    await second.close();
  });

  it("5 a local target failure and a shared render failure each stay their own: the first mount inert from its target, the second from the invalid state, neither contaminates the other's bookkeeping", async () => {
    const b = await boot();
    let throws = false;
    const local = await b.mountOn({ updateThrows: () => throws });
    const shared = await b.mountOn();

    throws = true;
    await b.invoke("app/bump");                                                              // local fails its update; shared updates
    await sleep(60);
    expect([await local.standing(), await shared.standing()]).toEqual(["defect update failed", "following"]);
    expect(shared.label()).toBe("A1");
    await b.invoke("app/break");                                                             // now the shared render fails
    await sleep(60);
    expect([await local.standing(), await shared.standing()]).toEqual(["defect update failed", "failed MeshDiagnostics"]);
    expect([local.label(), shared.label()]).toEqual(["A0", "A1"]);                           // each retains its own last good render
    local.click();
    shared.click();
    await sleep(60);
    expect([local.ledger(), shared.ledger()]).toEqual([["succeeded"], ["succeeded"]]);       // independent ledgers
    expect([local.ops, shared.ops]).toEqual([["draw A0"], ["draw A0", "update A1"]]);
    await local.close();
    await shared.close();
  });

  it("6 repairing the state revives no inert mount (retained events stay C31's); a fresh mount draws the repaired current state and follows", async () => {
    const b = await boot();
    const [one, two] = [await b.mountOn(), await b.mountOn()];

    await b.invoke("app/break");
    await sleep(60);
    await b.invoke("app/fix");                                                               // the repair
    await b.invoke("app/bump");
    await sleep(60);
    expect([await one.standing(), await two.standing()]).toEqual(["failed MeshDiagnostics", "failed MeshDiagnostics"]);
    expect([one.ops, two.ops]).toEqual([["draw A0"], ["draw A0"]]);                          // still inert: nothing was presented
    expect([one.label(), two.label()]).toEqual(["A0", "A0"]);

    const fresh = await b.mountOn();

    expect(fresh.ops).toEqual(["draw A1"]);                                                  // the repaired current state
    one.click();                                                                             // a retained event still dispatches and commits (C31)
    await sleep(60);
    expect(b.log.at(-1)).toBe("commit back-on-a");
    expect(fresh.ops).toEqual(["draw A1", "update A11"]);                                    // the fresh mount follows what it committed
    expect(one.ops).toEqual(["draw A0"]);
    await fresh.close();
    await one.close();
    await two.close();
  });

  it("7 the application stays authoritative: commits made while mounts are inert complete at once, in order, and no mount-level validity gate exists", async () => {
    const b = await boot();
    const [one, two] = [await b.mountOn(), await b.mountOn()];

    await b.invoke("app/break");
    await sleep(60);
    for (let i = 0; i < 5; i += 1) {
      await b.invoke("app/bump");                                                            // each completes without any mount recovering
    }
    await b.invoke("app/toggle");
    expect(await b.state()).toEqual({ view: "b", n: 5, bad: true });
    expect(b.log).toEqual(["commit break", "commit bump", "commit bump", "commit bump", "commit bump", "commit bump", "commit toggle"]);
    expect([one.ops, two.ops]).toEqual([["draw A0"], ["draw A0"]]);
    await one.close();
    await two.close();
  });
});
