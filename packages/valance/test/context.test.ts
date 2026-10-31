// The context channel (refinements C-1, MESH 0.18): `define`'s `context` projection gives the values a component two levels down reads by listing them in `uses`, beside each view's
// `scope`; a state change re-renders what reads them; and a Schema.Redacted field never reaches them (C-3).
import { compileProgram } from "@valancex/mesh-compiler";
import { Effect, Exit, Redacted, Schema, Scope, Stream } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { redactedProblems, runningOf } from "../src/internal.js";
import { recorder } from "../src/replay.js";
import { renderToHtml } from "../src/web-server.js";

const model = JSON.stringify({
  version: 1,
  types: {},
  context: { theme: { kind: "enum", values: ["light", "dark"] }, user: { kind: "optional", type: { kind: "string" } } },
  components: {
    box: { props: {}, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    // The page reads no theme and passes none: the badge, inside the card, lists both names in `uses`.
    page: { props: {}, events: {}, commands: {}, scope: { title: { kind: "string" } } },
    card: { props: {}, events: {}, commands: {}, scope: {} },
    badge: { props: {}, events: {}, commands: {}, scope: {}, uses: ["theme", "user"] },
  },
});
const built = await compileProgram({
  model: { manifest: model, path: "components.json" },
  root: "page",
  components: [
    { component: "page", source: "<box><text>{title}</text><card /></box>", path: "page.mprx" },
    { component: "card", source: "<box><badge /></box>", path: "card.mprx" },
    { component: "badge", source: '<text>{theme} {user ?? "nobody"}</text>', path: "badge.mprx" },
  ],
});

if (built.program === undefined) {
  throw new Error(JSON.stringify(built.assembly ?? built.components));
}

const program = built.program;
const State = Schema.Struct({ title: Schema.String, theme: Schema.Literal("light", "dark"), token: Schema.RedactedFromSelf(Schema.String) });
type State = typeof State.Type;

const app = (context: (state: State) => Record<string, unknown>) =>
  Valance.define({
    name: "context",
    state: { schema: State, initial: { title: "home", theme: "dark", token: Redacted.make("default") } },
    views: { page: { program, scope: (state: State) => ({ title: state.title }) } },
    commands: (state) => ({ light: Valance.command(state)((s) => ({ ...s, theme: "light" as const })) }),
    context,
  });

const texts = (tree: unknown): ReadonlyArray<string> => {
  const found: Array<string> = [];
  const walk = (node: { readonly type?: string; readonly text?: string; readonly children?: ReadonlyArray<unknown> }): void => {
    if (node.type === "text") found.push(node.text!);
    node.children?.forEach((child) => walk(child as never));
  };

  walk((tree as { readonly root: unknown }).root as never);

  return found;
};

describe("define's context projection (C-1)", () => {
  it("reaches a component that uses it, and a state change re-renders it as an update", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app((state) => ({ theme: state.theme }))).pipe(Scope.extend(scope)));
    const running = runningOf(handle);
    const seen: Array<{ readonly render: { readonly tree: unknown }; readonly patches?: unknown }> = [];

    Effect.runFork(Stream.runForEach(running.values, (viewed) => Effect.sync(() => void seen.push(viewed as never))).pipe(Scope.extend(scope)));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(texts(seen.at(-1)!.render.tree)).toEqual(["home", "dark nobody"]);

    await Effect.runPromise(handle.command("app/light", undefined as never));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(texts(seen.at(-1)!.render.tree)).toEqual(["home", "light nobody"]);
    expect(seen.at(-1)!.patches).toBeDefined();
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });

  it("is given the state without its Redacted fields, so a secret cannot reach the HTML through it, and vlx check reports the read", async () => {
    const leaking = app((state) => ({ theme: state.theme, user: state.token === undefined ? undefined : Redacted.value(state.token) }));
    const served = await Effect.runPromise(renderToHtml(leaking, { state: { title: "home", theme: "dark", token: Redacted.make("hunter2") } as State }));

    expect(served.html).not.toContain("hunter2");
    expect(served.html).toContain("dark nobody");
    expect(redactedProblems(leaking)).toMatchObject([{ code: "redacted-in-view", field: "token", message: expect.stringContaining("the context projection") }]);
    expect(redactedProblems(app((state) => ({ theme: state.theme })))).toEqual([]);
  });

  it("refuses to record a session up front: a session log holds no context values, so it could not be replayed", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app((state) => ({ theme: state.theme }))).pipe(Scope.extend(scope)));
    const recording = recorder({ write: () => undefined, runtime: "test", programs: () => ({ templates: program.templates, model: program.model }) });
    const target = () => ({ draw: () => undefined, update: () => undefined, unmount: () => undefined });
    const exit = await Effect.runPromiseExit(Valance.mount(handle, target, { record: recording }).pipe(Scope.extend(scope)));

    expect(exit._tag).toBe("Failure");
    expect(JSON.stringify(exit)).toContain("context-not-recordable");
    // Without a recorder it mounts.
    expect((await Effect.runPromiseExit(Valance.mount(handle, target).pipe(Scope.extend(scope))))._tag).toBe("Success");
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
});
