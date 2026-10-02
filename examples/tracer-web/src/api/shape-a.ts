// API tracer, candidate A: the caller starts the application and holds a handle; platform bindings attach to the handle.
// Spellings are local to this tracer and decide nothing. Built only from today's public exports.
//
//   author   : the application definition (../catalog/app.ts), no platform
//   caller   : start(app, options) -> handle { state, invoke };  mount(handle, ...);  history(handle, ...)
//   lifetime : the caller's Scope
//
// What had to be invented: the handle is NARROWER than `Valance.Running`, and the bindings still need the rest of it
// (`values`, `dispatch`, `states`, `render`). Making the handle opaque therefore needs a channel from a handle to its
// full `Running` that only bindings may use. Here it is a module-private WeakMap; that is the hidden machinery.
import type { Ambient, Running, StartError, StartOptions } from "@valancex/valance";
import type { WebPrimitives } from "@valancex/valance/web";

import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Scope } from "effect";

/** What an application's caller sees: the minimal state surface and the external entry. No runtime, no render, no dispatch. */
export interface Handle<S, E> {
  readonly state: Running<S, E, never>["state"];
  readonly invoke: Running<S, E, never>["invoke"];
}

const full = new WeakMap<object, Running<never, never, never>>();

const inside = <S, E>(handle: Handle<S, E>): Running<S, E, never> => {
  const running = full.get(handle);

  if (running === undefined) {
    throw new Error("not a handle this module started");
  }

  return running as unknown as Running<S, E, never>;
};

export const start = <S, E, R extends Ambient, V extends string>(app: Valance.ApplicationDefinition<S, E, R, V>, options: StartOptions<S> = {}): Effect.Effect<Handle<S, E>, StartError, Scope.Scope> =>
  Effect.map(Valance.start(app, options), (running) => {
    const handle: Handle<S, E> = Object.freeze({ state: running.state, invoke: running.invoke as Handle<S, E>["invoke"] });

    full.set(handle, running as unknown as Running<never, never, never>);

    return handle;
  });

/** The Web bindings, taking the handle. Each does what the `Valance.mount` / `Web.history` of today does. */
export const mount = <S, E>(handle: Handle<S, E>, options: { readonly container: Element; readonly primitives: WebPrimitives }) =>
  Effect.asVoid(Valance.mount(inside(handle), Web.target(options)));

export const hydrate = <S, E>(handle: Handle<S, E>, options: { readonly container: Element; readonly primitives: WebPrimitives }) =>
  Effect.asVoid(Valance.hydrate(inside(handle), Web.target(options)));

export const history = <S, E>(handle: Handle<S, E>, options: Web.HistoryOptions<S>) => Web.history(inside(handle), options);
