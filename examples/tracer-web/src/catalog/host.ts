// Host-side code for the catalog application: an author-written producer. It is not part of the application definition
// (./app.ts) and not a Valance binding: it sees ONLY the application's public handle, `invoke` here, and does what
// anything outside the definition does to reach application behavior: enter a command by key.
import type { ApplicationHandle } from "@valancex/valance";

import { Cause, Effect, type Scope } from "effect";

/** The whole of what an outside producer needs from the application: the entry. Not `state`, not the composition. */
export type Entry = Pick<ApplicationHandle<unknown, unknown>, "invoke">;

/**
 * A host page announces data as a window event; each one enters the application at `key`, with the event's detail as the
 * argument. It needs: the entry; a Scope, to remove its listener before the application ends; the key and its argument
 * contract (defined in the application's definition); and a decision about failure (here: logged, never thrown into the
 * page's event loop).
 */
export const fromWindowEvent = (entry: Entry, win: Window, name: string, key: string): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const listener = (event: Event): void => {
      void Effect.runPromise(entry.invoke(key, [{ value: (event as CustomEvent<never>).detail }]).pipe(
        Effect.catchAllCause((cause) => Effect.logError("host event failed", Cause.pretty(cause)))
      ));
    };

    win.addEventListener(name, listener);
    yield* Effect.addFinalizer(() => Effect.sync(() => { win.removeEventListener(name, listener); }));
  });
