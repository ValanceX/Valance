// Developer-experience slice. A small quotes application written the way the Learn pages teach it, using public entries only:
//   state { phase, quote }  ·  a view with a Reload button  ·  startup work that loads through a CAPABILITY the platform supplies
//   an event command (Reload)  ·  direct `invoke` with an argument  ·  loading/success/failure as state  ·  a stale answer ignored
//   mount, then a state transition after mount  ·  server rendering with start-time work (state can run ahead of html)
// The only non-public pieces are the test conveniences `textTarget` (a screen to read) and `until`; see the friction notes in the report.
import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { renderToHtml } from "@valancex/valance/web/server";
import { compileProgram } from "@valancex/mesh-compiler";
import { Deferred, Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { textTarget } from "./non-dom-target.js";

// 1. The view description, compiled before the application runs (Learn: first application, steps 1 and 2).
const manifest = JSON.stringify({
  version: 1, types: {},
  components: {
    page: { props: {}, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    quotes: { props: {}, events: {}, commands: { reload: { parameters: [] } }, scope: { status: { kind: "string" } } },
  },
});
const built = await compileProgram({
  model: { manifest, path: "components.json" }, root: "quotes",
  components: [{ component: "quotes", path: "quotes.mprx", source: `<page><text>{status}</text><button on.click={reload()}>Reload</button></page>` }],
});

if (built.program === undefined) { throw new Error(JSON.stringify(built.assembly ?? built.components)); }

// 2. The capability the application needs from its platform: a quote service that can fail.
interface QuoteService { readonly fetch: (topic: string) => Effect.Effect<string, { readonly _tag: "Offline" }> }
const QuoteService = Nexus.Capability.define<QuoteService>("example/quotes");

// 3. The application (Learn: async work, startup work).
const State = Schema.Struct({ phase: Schema.Literal("loading", "ready", "failed"), quote: Schema.String });
type State = typeof State.Type;

const app = Valance.define({
  name: "quotes",
  state: { schema: State, initial: { phase: "loading", quote: "" } },
  views: { quotes: { program: built.program, scope: ({ phase, quote }: State) => ({ status: phase === "loading" ? "Loading…" : phase === "ready" ? quote : "Offline" }) } },
  view: () => "quotes",
  commands: (state) => {
    let latest = 0;
    const set = (next: (current: State) => State) => state.update((current) => Effect.succeed(next(current)));
    const load = (topic: string) => Effect.gen(function* () {
      const mine = ++latest;
      const quotes = yield* Nexus.Capability.require(QuoteService);

      yield* set((current) => ({ ...current, phase: "loading" }));
      const result = yield* quotes.fetch(topic).pipe(Effect.either);

      if (mine !== latest) { return; }
      yield* set(() => result._tag === "Right" ? { phase: "ready", quote: result.right } : { phase: "failed", quote: "" });
    });
    const reload = Nexus.Command.define("quotes.reload", Schema.Struct({ topic: Schema.String }), ({ topic }) => load(topic));
    const startup = Nexus.Command.define("quotes.startup", Schema.Struct({}), () =>
      Effect.flatMap(state.get, (current) => current.phase === "loading" ? load("general") : Effect.void));

    return {
      "quotes/reload": Valance.entry(reload, () => ({ topic: "general" })),   // the button
      "app/reload": Valance.entry(reload, (topic) => ({ topic })),           // direct invoke, with an argument
      "app/startup": Valance.entry(startup),
    };
  },
  start: "app/startup",
});

// 4. A platform that supplies the capability: a fake with a gate per call, so the test decides when each answer arrives.
const world = () => {
  const calls: Array<{ topic: string; answer: Deferred.Deferred<string, { _tag: "Offline" }>; interrupted: boolean }> = [];
  const service: QuoteService = {
    fetch: (topic) => Effect.suspend(() => {
      const call = { topic, answer: Effect.runSync(Deferred.make<string, { _tag: "Offline" }>()), interrupted: false };

      calls.push(call);

      return Deferred.await(call.answer).pipe(Effect.onInterrupt(() => Effect.sync(() => { call.interrupted = true; })));
    }),
  };
  const platform: Nexus.Application.Platform = Nexus.Capability.EnvironmentLive(new Map([[QuoteService.id, { _tag: "Available" as const, implementation: service }]]));

  return { calls, platform, answer: (n: number, quote: string) => Effect.runPromise(Deferred.succeed(calls[n]!.answer, quote)), refuse: (n: number) => Effect.runPromise(Deferred.fail(calls[n]!.answer, { _tag: "Offline" as const })) };
};
const until = async (done: () => boolean) => { for (let i = 0; !done(); i += 1) { if (i > 400) { throw new Error("timed out"); } await new Promise((resolve) => setTimeout(resolve, 5)); } };

const boot = async (options: { readonly state?: State } = {}) => {
  const w = world();
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app, { platform: w.platform, ...(options.state === undefined ? {} : { state: options.state }) }).pipe(Scope.extend(scope)));
  const factory = textTarget();
  let screen!: ReturnType<typeof factory>;

  await Effect.runPromise(Valance.mount(handle, (report) => (screen = factory(report))).pipe(Scope.extend(scope)));

  return { ...w, handle, scope, screen: () => screen.screen(), click: (label: string) => screen.activate(label), close: () => Effect.runPromise(Scope.close(scope, Exit.void)), state: () => Effect.runPromise(handle.state) };
};

describe("a small realistic application through the public model", () => {
  it("startup loads through the platform's capability: loading, then success, drawn after mount", async () => {
    const b = await boot();

    await until(() => b.calls.length === 1);
    expect(b.screen()).toContain("Loading…");
    await b.answer(0, "Less is more");
    await until(() => b.screen().includes("Less is more"));
    expect(await b.state()).toEqual({ phase: "ready", quote: "Less is more" });
    await b.close();
  });

  it("failure is state and a screen; a click reloads, and recovers", async () => {
    const b = await boot();

    await until(() => b.calls.length === 1);
    await b.refuse(0);
    await until(() => b.screen().includes("Offline"));
    b.click("Reload");
    await until(() => b.calls.length === 2);
    expect(b.screen()).toContain("Loading…");
    await b.answer(1, "Back online");
    await until(() => b.screen().includes("Back online"));
    await b.close();
  });

  it("direct invoke with an argument, and a stale answer is ignored whatever order they arrive in", async () => {
    const b = await boot();

    await until(() => b.calls.length === 1);
    const first = Effect.runPromise(b.handle.invoke("app/reload", [{ value: "life" }]));      // newer than startup's
    const second = Effect.runPromise(b.handle.invoke("app/reload", [{ value: "work" }]));     // newest
    await until(() => b.calls.length === 3);
    expect(b.calls.map((c) => c.topic)).toEqual(["general", "life", "work"]);
    await b.answer(2, "newest");
    await until(() => b.screen().includes("newest"));
    await b.answer(1, "older");                                                               // arrives last
    await b.answer(0, "oldest");
    await Promise.all([first, second]);
    expect(b.screen()).toContain("newest");
    expect(await b.state()).toEqual({ phase: "ready", quote: "newest" });
    await b.close();
  });

  it("closing the application cancels the work in flight", async () => {
    const b = await boot();

    await until(() => b.calls.length === 1);
    await b.close();
    expect(b.calls[0]!.interrupted).toBe(true);
  });

  it("a hydrated, already-ready state does no startup work", async () => {
    const b = await boot({ state: { phase: "ready", quote: "From the server" } });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(b.calls.length).toBe(0);
    expect(b.screen()).toContain("From the server");
    await b.close();
  });
});

describe("the easy mistake: no platform", () => {
  it("startup work needs the capability; without a platform it fails with nobody to tell: the screen stays Loading…, and only a direct invoke reports why", async () => {
    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));                      // no platform
    const factory = textTarget();
    let screen!: ReturnType<typeof factory>;

    await Effect.runPromise(Valance.mount(handle, (report) => (screen = factory(report))).pipe(Scope.extend(scope)));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.screen()).toContain("Loading…");                                                                // startup failed unseen: no state says so
    expect(await Effect.runPromise(handle.state)).toEqual({ phase: "loading", quote: "" });

    const viaInvoke = await Effect.runPromise(Effect.exit(handle.invoke("app/reload", [{ value: "general" }])));   // the caller IS told

    expect(Exit.isFailure(viaInvoke) && JSON.stringify(viaInvoke.cause)).toContain("CapabilityUnavailableError");
    await Effect.runPromise(Scope.close(scope, Exit.void));
  });
});

describe("server rendering of the same application", () => {
  const primitives = { page: { element: "main" }, text: { element: "p" }, button: { element: "button", events: { click: { type: "click" } } } };

  it("start-time work begins; a slow answer is cancelled when the render ends; html and state are the starting ones", async () => {
    const w = world();
    const served = await Effect.runPromise(renderToHtml(app, { primitives, platform: w.platform }));

    expect(w.calls.length).toBe(1);
    expect(w.calls[0]!.interrupted).toBe(true);
    expect(served.html).toContain("Loading…");
    expect(served.state).toEqual({ phase: "loading", quote: "" });
  });

  it("an answer that is immediate: `state` is newer than `html` (documented: Learn mounting-and-hydration, Contract 17)", async () => {
    const w = world();
    const instant: Nexus.Application.Platform = Nexus.Capability.EnvironmentLive(new Map([[QuoteService.id, { _tag: "Available" as const, implementation: { fetch: () => Effect.succeed("already here") } satisfies QuoteService }]]));
    const served = await Effect.runPromise(renderToHtml(app, { primitives, platform: instant }));

    expect(served.html).toContain("Loading…");
    expect(served.state).toEqual({ phase: "ready", quote: "already here" });
    void w;
  });
});
