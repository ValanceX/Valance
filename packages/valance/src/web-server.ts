/**
 * Server rendering for the Web target: start the application, take its current MESH render, and let
 * PORT's server entry write it as HTML. The state is returned so the application can embed it for the
 * client: serializing it into a page is the application's job, not NEXUS's, PORT's or Valance's.
 */
import type { Mesh } from "@valancex/nexus";
import type { WebPrimitives } from "@valancex/port-web/server";
import type { Ambient, ApplicationDefinition, StartError, StartOptions } from "./index.js";

import { realizeHtml } from "@valancex/port-web/server";
import { Effect } from "effect";

import { start } from "./index.js";

export interface Served<S> {
  readonly html: string;
  readonly state: S;
}

/** Starts the application, renders it once, and ends it. No target object, no DOM. */
export const renderToHtml = <S, E, R extends Ambient, V extends string>(
  app: ApplicationDefinition<S, E, R, V>,
  options: StartOptions<S> & { readonly primitives: WebPrimitives }
): Effect.Effect<Served<S>, StartError | Mesh.MeshDiagnostics> =>
  Effect.scoped(Effect.gen(function* () {
    const running = yield* start(app, options);
    const viewed = yield* running.render;

    return { html: realizeHtml(viewed.render.tree, options.primitives), state: yield* running.state };
  }));
