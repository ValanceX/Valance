// Stage 14: what an MESH-invalid render IS, in real Chromium, through the public API. The state is valid for the application (its schema); the scope function maps it to
// values the program's manifest rejects (`title` is a number). Three ways of reaching the same invalid state, and one observation that needs no mount.
//
//   A  the application starts at the invalid state, then a mount is made        B  valid, then invalid, presented       C  valid → invalid → valid in one burst (one command, three commits)
//
// Where it is detected: MESH's runtime `render`, called lazily by Valance for each state a mount pulls (NEXUS `State.create`/`set` validate the schema; `update` does not,
// and `Selector.define` is a bare map). PORT never sees it. The fault is the application's mapping; detection is MESH's; the report is the mount's (`followed`).
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Cause, Effect, Exit, Schema, Scope } from "effect";
import { beforeAll, expect, inject, it } from "vitest";

import { following, label, run, State } from "./inert-fixture.js";
import { primitives } from "../src/catalog/web.js";

const { catalog } = inject("page");

beforeAll(async () => { await init(wasmUrl); });

type S = Schema.Schema.Type<typeof State>;

const definition = () => Valance.define({
  name: "invalid-render",
  state: { schema: State, initial: { n: 0, bad: false } },
  views: { only: { program: catalog.notfound, scope: (state: S) => ({ title: state.bad ? (42 as never) : `n${state.n}` }) } },
  view: () => "only" as const,
  commands: (state: Nexus.State.StateHandle<S>) => {
    const up = (change: (current: S) => S) => state.update((current): Effect.Effect<S> => Effect.succeed(change(current)));
    const command = (name: string, body: () => Effect.Effect<unknown>) => Nexus.Mesh.bind(Nexus.Command.define(`t.${name}`, Schema.Struct({}), () => Effect.asVoid(body())), () => ({}));

    return {
      "app/break": command("break", () => up((current) => ({ ...current, bad: true }))),
      "app/fix": command("fix", () => up((current) => ({ ...current, bad: false }))),
      "app/bump": command("bump", () => up((current) => ({ ...current, n: current.n + 1 }))),
      // ONE command, THREE commits, published back to back: valid → invalid → valid (and advanced). Nothing can run between them.
      // ONE command, TWO commits: valid (n advanced), then invalid. The invalid one is the LATEST.
      "app/burst-invalid": command("burst-invalid", () => Effect.zipRight(up((current) => ({ ...current, n: current.n + 1 })), up((current) => ({ ...current, bad: true })))),
      "app/burst": command("burst", () => Effect.zipRight(Effect.zipRight(up((current) => ({ ...current, bad: true })), up((current) => ({ ...current, bad: false }))), up((current) => ({ ...current, n: current.n + 1 })))),
    } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
  },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** What a failed mount/render is made of: MESH's diagnostics, with its code and the input path. */
const diagnosticsOf = (exit: Exit.Exit<unknown, unknown>): string => Exit.isFailure(exit) && Cause.isFailType(exit.cause) ? JSON.stringify(exit.cause.error) : "none";

it("A the application starts at the invalid state: the mount fails by itself on its first render, nothing is drawn; the state is committed; a repaired state is then mountable", async () => {
  const root = document.createElement("main");

  document.body.append(root);
  try {
    const scope = await run(Scope.make());
    const handle = await run(Valance.start(definition(), { state: { n: 0, bad: true } }).pipe(Scope.extend(scope)));
    const attempt = await run(Effect.exit(Valance.mount(handle, Web.target({ container: root, primitives })).pipe(Scope.extend(scope))));

    expect(diagnosticsOf(attempt)).toContain("runtime-value-mismatch");                  // MESH's diagnostic, returned by `mount` itself
    expect(root.innerHTML).toBe("");                                                      // no last good DOM: there was none
    expect(await run(handle.state)).toEqual({ n: 0, bad: true });                         // the state is the application's, committed, valid for its schema

    await run(handle.invoke("app/fix", []));
    const mounted = await run(Valance.mount(handle, Web.target({ container: root, primitives })).pipe(Scope.extend(scope)));

    expect(label(root)).toBe("n0");
    expect(await following(mounted)).toBe("following");
    await run(Scope.close(scope, Exit.void));
  } finally {
    root.remove();
  }
});

it("B valid → invalid, presented: the state commits, the mount ends with MESH's diagnostics, the last good DOM remains, a later valid state is NOT presented by that mount, a fresh mount recovers", async () => {
  const [root, fresh] = [document.createElement("main"), document.createElement("main")];

  document.body.append(root, fresh);
  try {
    const scope = await run(Scope.make());
    const handle = await run(Valance.start(definition()).pipe(Scope.extend(scope)));
    const mounted = await run(Valance.mount(handle, Web.target({ container: root, primitives })).pipe(Scope.extend(scope)));

    await run(handle.invoke("app/break", []));
    await expect.poll(() => following(mounted)).toBe("failed: diagnostics");
    expect(await run(handle.state)).toEqual({ n: 0, bad: true });
    expect(label(root)).toBe("n0");                                                        // last good DOM

    await run(handle.invoke("app/fix", []));
    await run(handle.invoke("app/bump", []));
    await sleep(100);
    expect(label(root)).toBe("n0");                                                        // a later valid state is not presented by the ended mount
    const recovered = await run(Valance.mount(handle, Web.target({ container: fresh, primitives })).pipe(Scope.extend(scope)));

    expect(label(fresh)).toBe("n1");
    expect(await following(recovered)).toBe("following");
    await run(Scope.close(scope, Exit.void));
  } finally {
    root.remove(); fresh.remove();
  }
});

it("C valid → invalid → valid in one burst: the mount presents the latest (valid) state and the invalid intermediate is SKIPPED, so its diagnostic is never produced; the mount stays live", async () => {
  const [root, fresh] = [document.createElement("main"), document.createElement("main")];

  document.body.append(root, fresh);
  try {
    const scope = await run(Scope.make());
    const handle = await run(Valance.start(definition()).pipe(Scope.extend(scope)));
    const mounted = await run(Valance.mount(handle, Web.target({ container: root, primitives })).pipe(Scope.extend(scope)));

    await run(handle.invoke("app/burst", []));
    await expect.poll(() => label(root)).toBe("n1");                                       // converged on the final state
    expect(await following(mounted)).toBe("following");                                    // no failure was reported: the invalid state was never rendered
    expect(await run(handle.state)).toEqual({ n: 1, bad: false });

    // The skipped state WOULD have failed: the diagnostic exists, out of band, and was skipped, not absent.
    const skipped = await run(Effect.exit(renderToHtml(definition(), { primitives, state: { n: 0, bad: true } })));

    expect(diagnosticsOf(skipped)).toContain("runtime-value-mismatch");

    await run(handle.invoke("app/bump", []));                                              // and the mount carries on
    await expect.poll(() => label(root)).toBe("n2");
    await run(Scope.close(scope, Exit.void));
  } finally {
    root.remove(); fresh.remove();
  }
});

it("D the latest state is invalid: the mount still fails and reports MESH's diagnostic, whether or not the valid state before it was ever presented; recovery is unchanged", async () => {
  const [root, fresh] = [document.createElement("main"), document.createElement("main")];

  document.body.append(root, fresh);
  try {
    const scope = await run(Scope.make());
    const handle = await run(Valance.start(definition()).pipe(Scope.extend(scope)));
    const mounted = await run(Valance.mount(handle, Web.target({ container: root, primitives })).pipe(Scope.extend(scope)));

    await run(handle.invoke("app/burst-invalid", []));
    await expect.poll(() => following(mounted)).toBe("failed: diagnostics");
    expect(["n0", "n1"]).toContain(label(root));                                           // the last good DOM: n1 may have been skipped, n0 is the draw
    expect(await run(handle.state)).toEqual({ n: 1, bad: true });

    await run(handle.invoke("app/fix", []));
    const recovered = await run(Valance.mount(handle, Web.target({ container: fresh, primitives })).pipe(Scope.extend(scope)));

    expect(label(fresh)).toBe("n1");
    expect(await following(recovered)).toBe("following");
    await run(Scope.close(scope, Exit.void));
  } finally {
    root.remove(); fresh.remove();
  }
});

it("the invalidity is observable WITHOUT any presentation, only by rendering that state out of band (renderToHtml, a pure function of definition and state); a live handle exposes no such check", async () => {
  const app = definition();
  const valid = await run(Effect.exit(renderToHtml(app, { primitives, state: { n: 3, bad: false } })));
  const invalid = await run(Effect.exit(renderToHtml(app, { primitives, state: { n: 3, bad: true } })));

  expect(Exit.isSuccess(valid)).toBe(true);
  expect(diagnosticsOf(invalid)).toContain("runtime-value-mismatch");                      // the same MESH diagnostic, with no target, mount or follower
  expect(Object.keys(await run(Valance.start(app).pipe(Effect.scoped)))).toEqual(["state", "invoke"]);   // nothing on the handle says whether a state renders
});
