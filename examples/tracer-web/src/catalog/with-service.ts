// The catalog application, extended with one behavior that needs the application-owned capability (./service.ts).
// Same definition as ./app.ts plus one command; nothing here names Web, PORT or the MESH runtime. The command resolves the
// capability through NEXUS, inside the application's own execution context, and the result becomes ordinary state.
import type { Mesh } from "@valancex/nexus";

import * as Valance from "@valancex/valance";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

import { application, type AppState, type Programs } from "./app.js";
import { Catalog } from "./service.js";

const firstValue = (args: ReadonlyArray<Mesh.IntentArgument>): unknown => {
  const first = args[0];

  return first !== undefined && "value" in first ? first.value : undefined;
};

export const applicationWithCatalog = (programs: Programs) => {
  const base = application(programs);

  return Valance.define({
    ...base,
    commands: (state: Nexus.State.StateHandle<AppState>) => {
      // Looks an id up in the catalog the platform supplied, and adds the item it names. Without the capability it fails
      // with NEXUS's own CapabilityUnavailableError: no Valance error exists for it.
      const lookupItem = Nexus.Command.define("catalog.lookupItem", Schema.Struct({ id: Schema.String }), ({ id }) =>
        Effect.gen(function* () {
          const catalog = yield* Nexus.Capability.require(Catalog);
          const name = catalog.lookup(id);

          yield* state.update((current): Effect.Effect<AppState> => Effect.succeed({ ...current, items: [...current.items, { id, name }] }));
        }));

      return { ...base.commands(state), "app/lookupItem": Nexus.Mesh.bind(lookupItem, (args) => ({ id: firstValue(args) })) };
    },
  });
};
