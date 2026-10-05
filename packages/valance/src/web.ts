/**
 * The Web target for Valance: the only module that names `@valancex/port-web`.
 * It adds nothing to PORT: it fixes `container` and `primitives` (the application's Web realization
 * table, which is target configuration, not part of the application) and hands PORT the report callback.
 */
import type { HydrationResult, WebPort, WebPortOptions, WebPrimitive, WebPrimitives } from "@valancex/port-web";
import type { BoundaryValue } from "@valancex/mesh-runtime";
import type { Ambient, ApplicationDefinition, ApplicationHandle, Mounted, StartOptions, TargetFactory } from "./index.js";

import { attribute, createWebPort } from "@valancex/port-web";
import { hydrate, mount, start } from "./index.js";
import { INPUT_KEY, runningOf } from "./internal.js";
import { Cause, Effect, Exit, Fiber, Option, Queue, Scope, Stream } from "effect";

export type { HydrationResult, WebPrimitive, WebPrimitives } from "@valancex/port-web";
export { attribute, booleanAttribute, property, textProperty } from "@valancex/port-web";
export { event } from "./web-payload.js";
export type { PayloadKind } from "./web-payload.js";

/**
 * A link: an `<a>` whose one prop, `href`, is the destination. It declares no event: with `history` and a `container` (which `run` supplies), a click on it is the
 * application's own navigation (see `HistoryOptions.container`), and without them it is an ordinary anchor. Put it in the primitives table under the name the view uses.
 */
export const link: WebPrimitive = { element: "a", props: { href: attribute("href") } };

export const target = (options: Omit<WebPortOptions, "report">): TargetFactory<WebPort> => (report) => createWebPort({ ...options, report });

export interface HistoryOptions<S> {
  /** The window whose URL and history are kept in step with the application (the container's own: `container.ownerDocument.defaultView`). */
  readonly window: Window;
  /** The URL (path and query) the application is shown at for `state`. What a URL means is the application's. */
  readonly urlOf: (state: S) => string;
  /** What a URL says about the application: the one argument of the navigate binding. The application's, too. */
  readonly stateOf: (url: URL) => BoundaryValue;
  /**
   * The application's navigate command. Either a **bare command name**, whose input is the navigation fact itself (the object `stateOf` returns), validated by the command's
   * schema as always: `navigate: "go"` with `go: command(Schema.Struct({ id: Schema.String }), …)` and `stateOf: (url) => ({ id: … })`. Or an **exact binding key**
   * (`"app/navigate"`), the same entry a MESH intent uses, for a command whose arguments need adapting.
   */
  readonly navigate: string;
  /**
   * The element whose links are navigations. When given, a plain left click on an `<a href>` inside it that leads somewhere in this application's origin is a navigation
   * request, exactly as a popstate is: `navigate` runs with `stateOf(destination)`, and the URL follows the state like any other navigation. The browser keeps every
   * other click: Ctrl, Meta, Shift or Alt held, a non-primary button, `target` other than `_self`, `download`, another origin, a link to a place in the page you are
   * already on (a `#fragment`), and a click something else already handled (`defaultPrevented`). Absent: links are ordinary anchors. `run` passes its own container.
   */
  readonly container?: Element;
}

/**
 * Where a click on a link inside `container` goes, when it is the application's to handle; otherwise undefined and the browser keeps it. See `HistoryOptions.container`.
 * Pure over the event, the window and the container: it prevents nothing and starts nothing.
 */
const linkDestination = (event: MouseEvent, win: Window, container: Element): URL | undefined => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return undefined;
  }

  const origin = event.target as { readonly closest?: (selector: string) => Element | null; readonly parentElement?: Element | null } | null;
  const from = origin !== null && typeof origin.closest === "function" ? origin as Element : origin?.parentElement ?? null;
  const anchor = from?.closest("a[href]") as HTMLAnchorElement | null | undefined;

  if (anchor === null || anchor === undefined || !container.contains(anchor) || (anchor.target !== "" && anchor.target !== "_self") || anchor.hasAttribute("download")) {
    return undefined;
  }

  const destination = new URL(anchor.href, win.location.href);
  const here = new URL(win.location.href);

  // Another origin (including mailto: and tel:, whose origin is "null"), or a place in the page already shown: the browser's.
  if (destination.origin !== here.origin || (destination.hash !== "" && destination.pathname === here.pathname && destination.search === here.search)) {
    return undefined;
  }

  return destination;
};

/**
 * Keeps `location` and the application in step, in both directions, until the caller's Scope closes.
 *
 *   start         the first state's `urlOf` is the baseline; nothing is written.
 *   later state   `urlOf(state)` differs from the last synchronized `urlOf` → `history.pushState`, which becomes the baseline.
 *   popstate      `running.invoke(navigate, [stateOf(location)])`, then the resulting state's `urlOf` becomes the baseline. Never a write.
 *
 * The question it answers is "did the application's URL change?", never "does the browser's URL equal the
 * application's?": a page sitting at a noncanonical URL (a history entry the application did not write) is left
 * alone, and an unrelated state change is not a navigation. Canonicalizing the URL is the application's, before start.
 *
 * A defect in the application's `urlOf` or `stateOf` is logged and ends only that synchronization step, never the follower.
 *
 * A popstate whose navigation fails, or leaves the state unchanged, is not repaired: nothing is written, the browser
 * stays at the URL history gave it, the baseline is the (unchanged) state's own URL, and the failure is only logged.
 * Browser URL and application URL then differ until the next application navigation; restoring one is the application's.
 *
 * Popstate is handled by the same fiber that watches state, in order, so the commit a popstate causes is seen after
 * the baseline has been updated for it, not as a new navigation. It reads and writes the URL and knows nothing of
 * what a URL means. PORT Web has no history API (it touches nothing outside its container), so this is Valance's.
 */
export const history = <S, E>(application: ApplicationHandle<S, E>, options: HistoryOptions<S>): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const running = runningOf(application);
    const scope = yield* Effect.scope;
    const { window: win } = options;
    const popped = yield* Queue.unbounded<string>();
    const { container } = options;
    // A bare `navigate` names a command that takes the navigation fact as its input; an exact key ("app/navigate") is the binding it always was.
    const navigateKey = options.navigate.includes("/") ? options.navigate : INPUT_KEY(options.navigate);
    // The application URL of the last state this mechanism has accounted for. Unset until the first state: the baseline.
    let last: string | undefined;

    const follower = yield* Stream.runForEach(
      Stream.merge(
        Stream.map(running.states, (state) => ({ _tag: "state" as const, state })),
        Stream.map(Stream.fromQueue(popped), (href) => ({ _tag: "popstate" as const, href }))
      ),
      (event) => (event._tag === "state"
        ? Effect.sync(() => {
          const url = options.urlOf(event.state);

          if (last === undefined) {
            last = url;
          } else if (url !== last) {
            last = url;
            win.history.pushState(null, "", url);
          }
        })
        : Effect.gen(function* () {
          // Through the application's own entry: it runs in the application, and a failure or defect is logged, never the follower's.
          yield* running.invoke(navigateKey, [{ value: options.stateOf(new URL(event.href)) }]).pipe(
            Effect.catchAllCause((cause) => Effect.logError("popstate navigation failed", cause))
          );
          // The state the popstate produced is the new baseline, whatever URL history happens to hold for it.
          last = options.urlOf(yield* running.state);
        })
      ).pipe(
        // `urlOf` and `stateOf` are the application's: a defect in either is a failed synchronization, logged like a failed popstate navigation.
        // It never ends the follower, which would silently stop every later URL write; the baseline stays where it was.
        Effect.catchAllCause((cause) => Effect.logError("history synchronization failed", cause))
      )
    ).pipe(Effect.forkIn(scope));

    const onPopState = (): void => { Queue.unsafeOffer(popped, win.location.href); };

    win.addEventListener("popstate", onPopState);

    // A link click is a navigation request. It is NOT handled by the follower: the navigate command may wait (it may load what the destination shows), and a wait in the follower
    // would hold every URL write behind it. The command is the application's, started like any invoke; the state it commits is what the follower sees, and pushes.
    const onClick = (event: MouseEvent): void => {
      const destination = container === undefined ? undefined : linkDestination(event, win, container);

      if (destination === undefined) {
        return;
      }

      event.preventDefault();
      Effect.runFork(running.invoke(navigateKey, [{ value: options.stateOf(destination) }]).pipe(
        Effect.catchAllCause((cause) => Effect.logError("link navigation failed", cause)),
        Effect.forkIn(scope)
      ));
    };

    container?.addEventListener("click", onClick as EventListener);

    // Reverse order of the scope: before the application ends.
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      yield* Effect.sync(() => { win.removeEventListener("popstate", onPopState); container?.removeEventListener("click", onClick as EventListener); });
      yield* Fiber.interrupt(follower);
    }));
  });

export interface RunOptions<S> extends StartOptions<S> {
  /** The element the application is presented in. */
  readonly container: Element;
  /** The application's Web realization table (the same one the server rendered with, when it did). */
  readonly primitives: WebPrimitives;
  /**
   * Explicit, and never inferred from what the container holds. `"mount"` creates the presentation: whatever the container held is replaced.
   * `"hydrate"` adopts server-rendered markup in the container with the client's own render, and reports whether it did in `Host.mounted.hydration`.
   */
  readonly present: "mount" | "hydrate";
  /** The application's own URL policy, handed to `history` unread. Absent: the URL is not kept in step. */
  readonly history?: HistoryOptions<S>;
}

/** One application running on one page: the core's handle, the presentation, and the one operation the host adds. */
export interface Host<S, E> {
  /** The application's handle, unchanged: the same one `start` returns, for whatever else wants to enter or read the application. */
  readonly handle: ApplicationHandle<S, E>;
  /** The presentation, unchanged: what `mount` or `hydrate` returned (`hydration` is present when the host hydrated). */
  readonly mounted: Mounted<E> & { readonly hydration?: HydrationResult };
  /**
   * Ends the page's composition: the URL synchronization, then the presentation, then the application (its admitted commands are interrupted and
   * awaited, then its resources are released), exactly the order of one Scope holding all three. Calling it again returns the same completion.
   */
  readonly stop: () => Promise<void>;
}

/**
 * Runs one ordinary application on one page: `start`, then `mount` or `hydrate` as `present` says, then `history` if the application has a URL
 * policy, all in ONE lifetime that `stop` closes. It is the caller of the core and nothing more: it decides no state, command, URL, navigation or
 * failure, never looks at the container to choose how to present, and writes nothing to the page, the log or the application's state.
 *
 * A start or first-presentation failure rejects with the existing failure itself (the typed `StartError` or `MeshDiagnostics`; a defect as the
 * defect), after the lifetime it began has been closed. Everything after startup is observed through what the core already gives: `handle`,
 * `mounted.followed` (how the presentation ended), `mounted.settled` and `mounted.dispatched`.
 *
 * It is a convenience for the ordinary page. Several mounts, independent lifetimes, a custom target and headless use are the core's own: `start`,
 * `mount`, `hydrate` and `history`, composed by the caller.
 */
export const run = async <S, E, R extends Ambient, V extends string>(app: ApplicationDefinition<S, E, R, V>, options: RunOptions<S>): Promise<Host<S, E>> => {
  const scope = await Effect.runPromise(Scope.make());
  const startup = Effect.gen(function* () {
    const handle = yield* start(app, options);
    const web = target({ container: options.container, primitives: options.primitives });
    const mounted: Host<S, E>["mounted"] = options.present === "hydrate" ? yield* hydrate(handle, web) : yield* mount(handle, web);

    if (options.history !== undefined) {
      yield* history(handle, { container: options.container, ...options.history });
    }

    return { handle, mounted };
  });
  const exit = await Effect.runPromiseExit(Scope.extend(startup, scope));

  if (Exit.isFailure(exit)) {
    // What `start` and the presentation had already acquired belongs to this lifetime: release it, then report the startup failure itself (a failure
    // to release is a second, later fact, and does not replace it).
    await Effect.runPromiseExit(Scope.close(scope, exit));

    throw Option.getOrElse(Cause.failureOption(exit.cause), () => Cause.squash(exit.cause));
  }

  let stopping: Promise<void> | undefined;

  return { ...exit.value, stop: () => stopping ??= Effect.runPromise(Scope.close(scope, Exit.void)) };
};
