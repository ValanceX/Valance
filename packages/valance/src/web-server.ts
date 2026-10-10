/**
 * Server rendering for the Web target: start the application, take its current MESH render, and let
 * PORT's server entry write it as HTML. The state is returned so the application can embed it for the
 * client: serializing it into a page is the application's job, not NEXUS's, PORT's or Valance's.
 */
import type { Mesh } from "@valancex/nexus";
import type { WebPrimitives } from "@valancex/port-web/server";
import type { Ambient, ApplicationDefinition, StartError, StartOptions } from "./index.js";
import type { HeadTags, Plugin } from "./web-plugin.js";

import { realizeHtml } from "@valancex/port-web/server";
import { Effect } from "effect";

import { runningOf } from "./internal.js";
import { start } from "./index.js";
import { compose } from "./web-plugin.js";

export interface Served<S> {
  readonly html: string;
  readonly state: S;
  /** What the document's head says for the state rendered (empty when neither the application nor a plugin has a head). Write it with `renderHead` from `./web/plugin`. */
  readonly head: HeadTags;
}

export interface RenderOptions<S> extends StartOptions<S> {
  /** The application's Web realization table. Absent: only the tags its plugins add. */
  readonly primitives?: WebPrimitives;
  /** What the head says for a state: the very function `Web.history`'s `head` takes, so the server and the browser say the same. */
  readonly head?: (state: S) => HeadTags;
  /** Plugins, composed with the application's own declarations (see `compose` in `./web/plugin`). A plugin's `routes` is not used here: a server renders the URL it is given. */
  readonly plugins?: ReadonlyArray<Plugin<S>>;
}

/** Starts the application, renders it once, and ends it. No target object, no DOM. */
export const renderToHtml = <S, E, R extends Ambient, V extends string>(
  app: ApplicationDefinition<S, E, R, V>,
  options: RenderOptions<S>
): Effect.Effect<Served<S>, StartError | Mesh.MeshDiagnostics> =>
  Effect.suspend(() => {
    // Composed before anything is acquired: a conflict fails the call with nothing started.
    const composed = compose<S>({ primitives: options.primitives, platform: options.platform, head: options.head }, options.plugins ?? []);

    return Effect.scoped(Effect.gen(function* () {
      const running = runningOf(yield* start(app, { ...options, ...(composed.platform === undefined ? {} : { platform: composed.platform }) }));
      const viewed = yield* running.render;
      const state = yield* running.state;

      return { html: realizeHtml(viewed.render.tree, composed.primitives), state, head: composed.head?.(state) ?? {} };
    }));
  });
