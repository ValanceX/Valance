// The catalog application with one behavior that waits on the asynchronous capability (./async-service.ts) before it commits.
// Nothing async-specific: an ordinary NEXUS command whose body awaits an Effect and then updates state.
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

import { application, type AppState, type Programs } from "./app.js";
import { CatalogAsync } from "./async-service.js";

const firstValue = (args: ReadonlyArray<Mesh.IntentArgument>): unknown => {
  const first = args[0];

  return first !== undefined && "value" in first ? first.value : undefined;
};

export const applicationWithAsyncCatalog = (programs: Programs) => {
  const base = application(programs);

  return Valance.define({
    ...base,
    commands: (state: Nexus.State.StateHandle<AppState>) => {
      // Waits for the capability, then adds the entry it returned. Nothing is committed before the wait ends.
      const lookupAsync = Nexus.Command.define("catalog.lookupAsync", Schema.Struct({ id: Schema.String }), ({ id }) =>
        Effect.gen(function* () {
          const catalog = yield* Nexus.Capability.require(CatalogAsync);
          const entry = yield* catalog.lookup(id);

          yield* state.update((current): Effect.Effect<AppState> => Effect.succeed({ ...current, items: [...current.items, { id: entry.id, name: entry.name }] }));
        }));

      return { ...base.commands(state), "app/lookupAsync": Nexus.Mesh.bind(lookupAsync, (args) => ({ id: firstValue(args) })) };
    },
  });
};
