/**
 * Units: the state and commands that belong to one occurrence of a composite (direction Bet 8). The runtime (MESH) takes the state as an input
 * beside the snapshot and says which occurrences a render met; this file is the host's half: a registry of the state of the occurrences that have
 * changed, one NEXUS `State` in a `Scope` of its own per occurrence, closed when a later render no longer has the occurrence (its node left the
 * tree: the lifetime of a unit is the lifetime of its node's identity, spec §9.10.6).
 *
 * Mechanism, not API: an author writes a `unit(...)` and registers it with its component; nothing here is named by an application. Not exported from
 * the package's entry beyond the types a definition needs.
 */
import * as Nexus from "@valancex/nexus";
import { Effect, Exit, Schema, Scope } from "effect";

/**
 * One occurrence of a component with a unit in a render, as MESH 0.18 lists it (`Render.occurrences`). Written here and not imported,
 * so that this package builds and runs, for an application with no units, against the MESH and NEXUS it was released with before them.
 */
export interface UnitOccurrence {
  readonly occurrence: string;
  readonly component: string;
  readonly state: Readonly<Record<string, any>>;
  readonly controlled?: ReadonlyArray<string>;
}

/** The state the host holds for the occurrences that have changed, by the occurrence's key. */
export type UnitStates = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

/** A command intent as far as units are concerned: `controlled` and `occurrence` are in it from MESH 0.18. */
export type UnitIntent = Nexus.Mesh.CommandIntent & { readonly occurrence?: string; readonly controlled?: ReadonlyArray<string> };

/** The part of the NEXUS adapter that units use: NEXUS 0.14 has it. An older one has none, and an application without units never asks for it. */
interface UnitsAdapter {
  readonly render: (program: Nexus.Mesh.Program, snapshot: Record<string, unknown>, units?: UnitStates) => Effect.Effect<Nexus.Mesh.Render, Nexus.Mesh.MeshDiagnostics>;
  readonly update: (previous: Nexus.Mesh.Render, snapshot: Record<string, unknown>, units?: UnitStates) => Effect.Effect<Nexus.Mesh.Updated, Nexus.Mesh.MeshDiagnostics>;
  readonly raise: (
    render: Nexus.Mesh.Render,
    occurrence: string,
    event: string,
    payload?: unknown,
  ) => Effect.Effect<Nexus.Mesh.CommandIntent | undefined, Nexus.Mesh.MeshDiagnostics>;
}

const adapter = (): UnitsAdapter => {
  const found = Nexus.Mesh as unknown as Partial<UnitsAdapter>;

  if (found.render === undefined || found.update === undefined || found.raise === undefined) {
    throw new Error("VALANCE: units need @valancex/nexus 0.14 and @valancex/mesh-runtime 0.15");
  }

  return found as UnitsAdapter;
};

/** The occurrences a render lists: MESH 0.18's `occurrences` (the 0.15 to 0.17 `instances` are no longer read: the peer range starts at 0.18). */
export const occurrencesOf = (render: Nexus.Mesh.Render): ReadonlyArray<UnitOccurrence> => {
  return (render as unknown as { readonly occurrences?: ReadonlyArray<UnitOccurrence> }).occurrences ?? [];
};

/** A unit command's binding: the arguments, and the intent (which names the occurrence). */
export type UnitBinding = (args: ReadonlyArray<Nexus.Mesh.IntentArgument>, intent?: UnitIntent) => Effect.Effect<unknown, never, never>;

/** The brand of a unit definition. */
export const UNIT = Symbol.for("valancex.valance.unit");

/** One command of a unit: its parameters (a struct, whose fields in order are the command's parameters), and the pure transition. */
export interface UnitCommand<S = any> {
  /** The command's parameters, in order. None when it takes none. */
  readonly input?: Schema.Struct<Schema.Struct.Fields>;
  /** The changes to the unit's state this command makes, from the state as the person saw it. The fields a caller owns (`controllable`) are not applied. */
  readonly run: (state: S, args: any) => Partial<S>;
  /**
   * Events of the component this command announces to its caller, with the payload each carries: computed from the state the command leaves and its
   * arguments. A controlled caller learns what the person chose this way, and keeps the one copy of the value.
   */
  readonly raises?: Readonly<Record<string, (next: S, args: any) => unknown>>;
}

/** A unit: typed state with defaults, and commands that are pure transitions of it. Made by `unit(...)` in `@valancex/common`. */
export interface Unit<S = any> {
  readonly [UNIT]: true;
  /** The state's schema: a struct of the unit's fields. */
  readonly schema: Schema.Schema<S, any, never>;
  /** The fields, by name, with the schema and the default of each. */
  readonly fields: Readonly<Record<string, { readonly schema: Schema.Schema<any, any, never>; readonly initial: unknown }>>;
  /** The fields a caller may own by writing a prop of the same name. */
  readonly controllable: ReadonlyArray<string>;
  readonly commands: Readonly<Record<string, UnitCommand<S>>>;
}

export const isUnit = (value: unknown): value is Unit => typeof value === "object" && value !== null && UNIT in value;

/** A unit occurrence the registry holds state for: its own scope, and its state in it. */
interface Held {
  readonly scope: Scope.CloseableScope;
  readonly state: Nexus.State.StateHandle<Record<string, unknown>>;
}

/** What the last render said about an occurrence, and the render it was in. */
interface Seen {
  readonly occurrence: UnitOccurrence;
  readonly render: Nexus.Mesh.Render;
}

/** Runs a deliverable intent: the binding of the command table it names. */
export type Deliver = (intent: Nexus.Mesh.CommandIntent) => Effect.Effect<unknown, unknown, never>;

export interface Registry {
  /** The state of the occurrences that have changed, for the runtime's `units` input. */
  readonly units: Effect.Effect<UnitStates>;
  /** The render just made: remembers its occurrences and lets go of the state of those it no longer has. */
  readonly observe: (render: Nexus.Mesh.Render) => Effect.Effect<void>;
  /** The bindings of the command table for every unit command, by `"component/name"`. */
  readonly bindings: Readonly<Record<string, UnitBinding>>;
  /** A counter that changes whenever any occurrence's state does: what wakes the renders. */
  readonly epoch: Nexus.State.StateHandle<number>;
}

const fieldNames = (unit: Unit): ReadonlyArray<string> => Object.keys(unit.fields);

const same = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

/**
 * The registry of an application's units. `deliver` runs the intent a unit's `raises` resolves to (the command table is the application's, and it is
 * built before the registry, so the registry is told how to reach it).
 */
export const makeRegistry = (units: Readonly<Record<string, Unit>>, deliver: () => Deliver): Effect.Effect<Registry, never, Scope.Scope> =>
  Effect.gen(function* () {
    const owner = yield* Scope.Scope;
    const held = new Map<string, Held>();
    const seen = new Map<string, Seen>();
    const epoch = yield* Nexus.State.create(Schema.Number, 0).pipe(Effect.orDie);

    // The application's end ends every occurrence's state.
    yield* Scope.addFinalizer(
      owner,
      Effect.suspend(() => Effect.forEach([...held.values()], (each) => Scope.close(each.scope, Exit.void), { discard: true })).pipe(
        Effect.tap(() => Effect.sync(() => held.clear())),
      ),
    );

    const bump = epoch.update((current) => Effect.succeed(current + 1));

    const ensure = (key: string, component: string, from: Record<string, unknown>): Effect.Effect<Held> =>
      Effect.gen(function* () {
        const existing = held.get(key);

        if (existing !== undefined) {
          return existing;
        }

        const unit = units[component]!;
        const scope = yield* Scope.make();
        const state = yield* Nexus.State.create(unit.schema as Schema.Schema<Record<string, unknown>>, from).pipe(Scope.extend(scope), Effect.orDie);
        const made: Held = { scope, state };

        held.set(key, made);

        return made;
      });

    const bind = (component: string, name: string, unit: Unit): UnitBinding => {
      const command = unit.commands[name]!;
      const names = command.input === undefined ? [] : Object.keys(command.input.fields);

      return (args, intent) =>
        Effect.gen(function* () {
          const key = intent?.occurrence;
          const known = key === undefined ? undefined : seen.get(key);

          if (key === undefined || known === undefined) {
            // The occurrence is not in the render the host last made: its node has left the tree, so there is nothing to change.
            return;
          }

          const controlled = new Set(intent?.controlled ?? []);
          const stored = held.get(key);
          const base = stored === undefined ? { ...known.occurrence.state } : yield* stored.state.get;
          // What the person saw: the stored state, but the caller's value for a field the caller owns.
          const basis: Record<string, unknown> = { ...base };

          for (const name of controlled) {
            basis[name] = known.occurrence.state[name];
          }

          const given = Object.fromEntries(names.map((each, index) => [each, (args[index] as { readonly value?: unknown } | undefined)?.value]));
          const decoded = command.input === undefined ? {} : Schema.decodeUnknownSync(command.input as unknown as Schema.Schema<any, any, never>)(given);
          const changes = command.run(basis, decoded);
          const applied = Object.fromEntries(Object.entries(changes).filter(([field, value]) => !controlled.has(field) && !same(value, base[field])));

          if (Object.keys(applied).length > 0) {
            const next = { ...base, ...applied };
            const entry = yield* ensure(key, component, base);

            yield* entry.state.set(next).pipe(Effect.orDie);
            yield* bump;
          }

          // What the command announces to its caller, told against the state it leaves (the caller's value for a field it owns).
          for (const [event, payload] of Object.entries(command.raises ?? {})) {
            const intended = yield* Effect.suspend(() => adapter().raise(known.render, key, event, payload({ ...basis, ...changes }, decoded))).pipe(Effect.orDie);

            if (intended !== undefined) {
              yield* deliver()(intended).pipe(Effect.orDie);
            }
          }
        }) as Effect.Effect<unknown, never, never>;
    };

    const bindings: Record<string, UnitBinding> = {};

    for (const [component, unit] of Object.entries(units)) {
      for (const name of Object.keys(unit.commands)) {
        bindings[`${component}/${name}`] = bind(component, name, unit);
      }
    }

    const registry: Registry = {
      units: Effect.suspend(() =>
        Effect.forEach([...held.entries()], ([key, each]) => Effect.map(each.state.get, (state) => [key, state] as const)).pipe(
          Effect.map((entries) => Object.fromEntries(entries)),
        ),
      ),
      observe: (render) =>
        Effect.suspend(() => {
          const occurrences = occurrencesOf(render);
          const present = new Set(occurrences.map((each) => each.occurrence));

          seen.clear();

          for (const occurrence of occurrences) {
            seen.set(occurrence.occurrence, { occurrence, render });
          }

          return Effect.forEach(
            [...held.entries()].filter(([key]) => !present.has(key)),
            ([key, each]) =>
              Effect.suspend(() => {
                held.delete(key);

                return Scope.close(each.scope, Exit.void);
              }),
            { discard: true },
          );
        }),
      bindings,
      epoch,
    };

    return registry;
  });

/** The unit's fields as the manifest names them, for a definition that is checked against a manifest. */
export const unitFieldNames = fieldNames;
