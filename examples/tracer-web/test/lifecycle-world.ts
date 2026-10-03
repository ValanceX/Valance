// Shared by lifecycle-races.test.ts and handle-after-close.test.ts: a real jsdom window with real history, an application (a counter, a path, a navigate command and gated
// commands reached from a real click or from `invoke`), and helpers to start it and to mount and attach history in Scopes of their own.
import type { WebPort } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Deferred, Effect, Exit, Schema, Scope } from "effect";
import { JSDOM } from "jsdom";

import { compilePrograms } from "../src/catalog/compile.js";
import { primitives } from "../src/catalog/web.js";

export const State = Schema.Struct({ path: Schema.String, n: Schema.Number });
export type State = Schema.Schema.Type<typeof State>;
export const programs = await compilePrograms();
export const run = <A>(effect: Effect.Effect<A, unknown>) => Effect.runPromise(effect);
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const urlOf = ({ path }: State): string => path === "/" ? "/x/" : `/x${path}`;
export const stateOf = (url: URL): { readonly path: string } => ({ path: url.pathname.replace(/^\/x/, "") || "/" });

/** One world: a window with real history, the application (its command log, a gate), and helpers to mount and attach history in Scopes of their own. */
export const world = async () => {
  const dom = new JSDOM(`<!doctype html><body></body>`, { url: "http://localhost/x/" });
  const win = dom.window as unknown as Window;
  const log: Array<string> = [];
  const gate = Effect.runSync(Deferred.make<void>());
  const hold = Effect.runSync(Deferred.make<void>());
  const writes: Array<string> = [];
  const listeners = new Set<unknown>();
  const push = win.history.pushState.bind(win.history);
  const add = win.addEventListener.bind(win);
  const remove = win.removeEventListener.bind(win);

  win.history.pushState = (data, unused, target) => { writes.push(String(target)); push(data, unused, target); };
  win.addEventListener = ((type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => { if (type === "popstate") { listeners.add(listener); } add(type, listener, options); }) as typeof win.addEventListener;
  win.removeEventListener = ((type: string, listener: EventListener, options?: boolean | EventListenerOptions) => { if (type === "popstate") { listeners.delete(listener); } remove(type, listener, options); }) as typeof win.removeEventListener;

  const app = Valance.define({
    name: "races",
    state: { schema: State, initial: { path: "/", n: 0 } },
    views: { only: { program: programs.notfound, scope: (state: State) => ({ title: `n${state.n}${state.path}` }) } },
    view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => {
      const bind = (name: string, body: () => Effect.Effect<unknown>) => Nexus.Mesh.bind(Nexus.Command.define(`t.${name}`, Schema.Struct({}), () => Effect.asVoid(body())), () => ({}));

      return {
        "app/bump": bind("bump", () => Effect.tap(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + 1 })), () => Effect.sync(() => { log.push("commit bump"); }))),
        "app/navigate": Nexus.Mesh.bind(Nexus.Command.define("t.navigate", Schema.Struct({ path: Schema.String }), ({ path }) => Effect.asVoid(Effect.tap(state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, path })), () => Effect.sync(() => { log.push(`commit navigate ${path}`); })))), (args) => (args[0] as { value: unknown }).value),
        // Held by `invoke`: one waits at a gate the test owns and can be interrupted; the other holds UNINTERRUPTIBLY (C23's shape), then commits.
        "app/hold": bind("hold", () => Effect.gen(function* () {
          log.push("hold started");
          yield* Deferred.await(hold).pipe(Effect.onInterrupt(() => Effect.sync(() => { log.push("hold interrupted"); })));
          yield* state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + 1000 }));
          log.push("commit hold");
        })),
        "app/hold-uninterruptible": bind("hold-u", () => Effect.uninterruptible(Effect.gen(function* () {
          log.push("hold-u started");
          yield* Deferred.await(hold);
          yield* state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + 2000 }));
          log.push("commit hold-u");
        }))),
        // Held navigate, for history's popstate: waits at the hold gate, then moves the path (a navigation IN FLIGHT when history closes).
        "app/gated-navigate": Nexus.Mesh.bind(Nexus.Command.define("t.gated-navigate", Schema.Struct({ path: Schema.String }), ({ path }) => Effect.gen(function* () {
          log.push(`gated-navigate started ${path}`);
          yield* Deferred.await(hold).pipe(Effect.onInterrupt(() => Effect.sync(() => { log.push("gated-navigate interrupted"); })));
          yield* state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, path }));
          log.push(`commit gated-navigate ${path}`);
        })), (args) => (args[0] as { value: unknown }).value),
        // The mount's one button: a command that waits at a gate the test owns, then commits (an event command: the application's once admitted, C25).
        "notfound/back": bind("gated", () => Effect.gen(function* () {
          log.push("gated started");
          yield* Deferred.await(gate).pipe(Effect.onInterrupt(() => Effect.sync(() => { log.push("gated interrupted"); })));
          yield* state.update((c): Effect.Effect<State> => Effect.succeed({ ...c, n: c.n + 100 }));
          log.push("commit gated");
        })),
      } as unknown as Record<string, Nexus.Mesh.Binding<never, never>>;
    },
  });

  let counter = 0;
  const mountIn = async (handle: Valance.ApplicationHandle<State, unknown>) => {
    const container = win.document.createElement("main");
    const ops: Array<string> = [];
    const index = counter;

    counter += 1;
    win.document.body.append(container);
    const scope = await run(Scope.make());
    const target: Valance.TargetFactory<WebPort> = (report) => {
      const port = Web.target({ container, primitives })(report);

      return { draw: (t) => { port.draw(t); ops.push(`draw ${text()}`); }, update: (t) => { port.update(t); ops.push(`update ${text()}`); }, hydrate: (t) => port.hydrate(t), unmount: () => { port.unmount(); ops.push("unmount"); } };
    };
    const text = (): string => container.querySelector("section")?.getAttribute("aria-label") ?? "";
    const mounted = await run(Valance.mount(handle, target).pipe(Scope.extend(scope)));

    return { index, container, ops, scope, mounted, text, close: () => run(Scope.close(scope, Exit.void)), click: () => { container.querySelector("button")!.dispatchEvent(new (win as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent("click", { bubbles: true })); } };
  };
  const attachHistory = async (handle: Valance.ApplicationHandle<State, unknown>, navigate = "app/navigate") => {
    const scope = await run(Scope.make());

    await run(Web.history(handle, { window: win, urlOf, stateOf, navigate }).pipe(Scope.extend(scope)));
    await sleep(40);

    return { scope, close: () => run(Scope.close(scope, Exit.void)) };
  };
  const startApp = async () => {
    const scope = await run(Scope.make());
    const handle = await run(Valance.start(app).pipe(Scope.extend(scope)));

    return { scope, handle, close: () => run(Scope.close(scope, Exit.void)) };
  };

  return { win, log, gate, writes, listeners, location: () => win.location.pathname, mountIn, attachHistory, startApp, release: () => Effect.runSync(Deferred.succeed(gate, undefined)), releaseHold: () => Effect.runSync(Deferred.succeed(hold, undefined)) };
};

