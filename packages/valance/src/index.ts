/**
 * @valancex/valance: the application-composition boundary over NEXUS, MESH and PORT.
 *
 * It owns the composition that no substrate may own (NEXUS ARCHITECTURE §16, PORT CONTRACT "the composer"):
 *
 *   define(app)            data: program, state, scope, command bindings. No target, no platform.
 *   start(app, options)    starts the NEXUS application in the CALLER's Scope; supplies the platform;
 *                          creates the application's state and its MESH host; checks that every event the views' programs declare has
 *                          a command-table key (MESH says what is declared; Contract §2); returns the application's handle:
 *                          its `state`, `invoke` and `command`, and nothing of the composition (see ./internal).
 *   mount / hydrate        connects a PORT target to a started application: draws (or adopts server
 *                          server output for) the current render, follows later renders as updates, and
 *                          dispatches each reported event with the render that was drawn.
 *
 * Command lifetime: commands admitted through `invoke` or MESH dispatch are owned by the application until they exit; closing the
 * caller's Scope closes admission and drains them before NEXUS terminates and platform resources release (docs/FINDINGS.md, "Canonical lifecycle architecture").
 *
 * Nothing here is target-specific. A target is whatever satisfies `Target`, which is PORT's
 * contract (draw / update / unmount, plus hydrate where a PORT has one) and nothing more.
 */
import type { BoundaryValue, DeclaredEvent, RenderTree, SourceSpan } from "@valancex/mesh-runtime";

import { declaredEvents } from "@valancex/mesh-runtime";
import * as Nexus from "@valancex/nexus";
import { ValanceError } from "./errors.js";
import type { SessionRecorder } from "./replay.js";
import { handleOf, INPUT_KEY, runningOf, type DispatchExit, type Running, type Viewed } from "./internal.js";
import { makeRegistry, renderWithUnits, updateWithUnits, type Deliver, type Registry, type Unit } from "./units.js";
import { Cause, Deferred, Duration, Effect, Equal, Exit, Fiber, Layer, Option, Schema, Scope, Stream } from "effect";

export { isRefusal, isValanceError, ValanceError } from "./errors.js";
export { isUnit, UNIT } from "./units.js";
export type { Unit, UnitCommand } from "./units.js";
export type { ValanceErrorCode } from "./errors.js";

/** What a command binding may require: only what the NEXUS application runtime itself provides. */
export type Ambient = Nexus.Capability.EnvironmentShape | Nexus.Event.EventBusShape;

/** A compiled view description: what `compileProgram` returns as `program`, and what a view's `program` takes. Opaque; VALANCE never looks inside it. */
export type Program = Nexus.Mesh.Program;

/** The state as `commands` receives it, for typing a `commands` function written apart from `define` (for example, to derive the manifest from it). */
export type StateHandle<S> = Nexus.State.StateHandle<S>;

/** One MESH program the application can show, and the manifest-shaped values it is rendered from. */
export interface View<S> {
  /** MESH program: templates compiled at build time, and the manifest's text. */
  readonly program: Nexus.Mesh.Program;
  /** State → the program root's scope values, shaped to the manifest. */
  readonly scope: (state: S) => Record<string, unknown>;
}

/**
 * What `commands` holds, by the shape of the key:
 *
 *   `"component/name"`  a binding (`entry(...)`), for exactly that component and command.
 *   `name`              a NEXUS command, for every declared `component/name` whose name it is, and for `"app/name"`.
 *
 * Both forms may be mixed in one table. An exact `"component/name"` key always wins over a bare name for that declaration (see `ApplicationDefinition.commands`).
 */
export type CommandTable<E, R extends Ambient> = Readonly<Record<string, Nexus.Mesh.Binding<E, R> | Nexus.Command.Command<any, any, E, R>>>;

/** Carries an application's `invoke` keys in its definition's type, for `start` to read. Type only: no definition has it. */
declare const invokeKeys: unique symbol;
/** Carries what `ApplicationHandle.command` takes per key, in the definition's type, for `start` to read. Type only: no definition has it. */
declare const commandInputs: unique symbol;

export interface ApplicationDefinition<
  S,
  E,
  R extends Ambient,
  V extends string,
  K extends string = string,
  C extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  /** The keys `invoke` takes (see `ApplicationHandle.invoke`): set by `define` from the command table's type, read by `start`. Never present at run time. */
  readonly [invokeKeys]?: K;
  /** What `ApplicationHandle.command` takes, by key: set by `define` from the command table's type, read by `start`. Never present at run time. */
  readonly [commandInputs]?: C;
  readonly name: string;
  /** The application's one NEXUS state. `initial` is the default; `start` may be given another (hydration). */
  readonly state: { readonly schema: Schema.Schema<S>; readonly initial: NoInfer<S> };
  /** The MESH programs the application can show. The application's state outlives a change of program. */
  readonly views: { readonly [K in V]: View<S> };
  /** Which program the current state shows. A function of application state: what the active view is, is the application's. */
  readonly view: (state: S) => V;
  /**
   * Behavior, for every view: a function of the application's state that returns the table. A key is one of two forms:
   *
   *  - **`"component/name"`** binds exactly that declared event's command: `entry(command, input?)`, as always. `"app/name"` is the same form, for `invoke` and history.
   *  - **a bare `name`** is a NEXUS command (`command(state)(…)` or `Command.define`). It is bound to every declared `component/name` whose `name` it is, and to `"app/name"`.
   *
   * **Resolution**, for each declared `component/name` and for each `app/name`: the exact key in the table wins; otherwise the bare `name` is used; otherwise there is
   * no command, and `start` fails with `ConformanceViolation` (declared events) or the key is `UnmappedCommand` (everything else). One rule, no other precedence.
   *
   * **Arguments of a bare command.** If its input is a struct and every argument of the event's call carries a name (an argument written as a plain path, `to` or `row.id`,
   * is named by its last segment) that is a field of the struct, each one fills the field of its name, wherever it stands: `move(to, from)` fills `to` and `from`. Otherwise
   * (a literal or `$event` among the arguments, a name that is not a field, two arguments of one name, or an `invoke` whose arguments carry no `name`; `invoke` binds by name when they do) the arguments are its
   * fields **in the struct's field order**: the first argument is the first field, and so on. An argument the event does not supply is `undefined` (so a required field then
   * fails validation), and arguments beyond the fields are ignored. The declared parameter names are not used; the call site's argument names are, as above. If its input is not a struct, the first argument is the whole input. The input is validated by the
   * command's schema as always. (A single object argument is not unpacked into fields.)
   *
   * A bare name must hold a command object. A function there (such as an `entry`) is a mistake and `start` dies with a defect naming it.
   */
  readonly commands: (state: Nexus.State.StateHandle<S>) => CommandTable<E, R>;
  /**
   * The key of a command-table entry (an exact `"component/name"` key, or a bare command name, which means `"app/name"`) that `start` runs, once, with no arguments, as the application's own command: admitted before `start` returns, owned
   * by the application's registry like any admitted command (closing the Scope interrupts and awaits it before NEXUS terminates), with no caller. Its exit is
   * returned nowhere (no caller, no mount ledger), and a failure it does not catch is logged with `Effect.logError("start-time work failed")` and the failure's identity only (annotation `failure`: its `_tag`, `code` or
   * `name`, else its kind), never its message or value, which may carry a secret (a token in an error). The whole cause goes only to `StartOptions.onStartFailure`, if the application asks. Work that can
   * fail catches the failure into state, as an event command does. A key the table lacks fails `start` with `UnmappedCommand`.
   */
  readonly start?: string;
  /**
   * The units of the components the views' programs use, by component name (Tier 2): state and commands that belong to one occurrence of a component, such as whether a disclosure is open.
   * `start` keeps the state of the occurrences that have changed, gives it to every render beside the state of the application, binds each unit's commands to
   * `"component/name"` (an exact key of `commands` for the same name wins) and lets go of an occurrence's state when a later render no longer has it. The application never sees any of it.
   * Without `units`, nothing about them is done.
   */
  readonly units?: Readonly<Record<string, Unit>>;
  /**
   * Takes the person to the first field in error each time a count of the application's rises (Tier 2): a count, not a flag, so that a second failed submit, which changes no
   * message, still counts. A form keeps one (`attempts`), and `focusFirstInvalid: (state) => state.signup.attempts` is the whole of it. After the render that shows the rise
   * is applied, the target is asked to focus the first node in the tree that says it is `invalid` (a request to the platform, not a command, and not state); nothing is done
   * when no node is, or when the target cannot focus. The count at the first render is the baseline: a page that opens with attempts already made does not move focus.
   */
  readonly focusFirstInvalid?: (state: S) => number;
}

/** The failures a table can raise: the union over every command (and binding) in it, exactly. */
type ErrorOf<V> = V extends Nexus.Command.Command<any, any, infer Err, any> ? Err : V extends Nexus.Mesh.Binding<infer Err, any> ? Err : never;
/** The services a table needs: the union over every command (and binding) in it. */
type RequirementOf<V> = V extends Nexus.Command.Command<any, any, any, infer Req> ? Req : V extends Nexus.Mesh.Binding<any, infer Req> ? Req : never;

/**
 * The definition, typed. An application is data: defining one starts nothing. `E` is the union of every failure in the command table (each command may fail
 * differently), plus `CommandValidationError`: every command's input is validated, and a table of bare command names (which have no `entry` to carry it)
 * would otherwise claim that failure cannot happen. `R` is the union of the services the table needs. Both are read from the table's own type, so no command's
 * failure is narrowed to another's.
 */
export function define<S, T extends CommandTable<any, Ambient>, V extends string>(
  // With exactly one view, `view` may be left out: it is that view (Tier 1, a default for what has only one answer). With more than one key it is required (omitting it is a type error).
  definition: Omit<ApplicationDefinition<S, never, never, V>, "commands" | "view"> & { readonly commands: (state: Nexus.State.StateHandle<S>) => T } & (IsUnion<V> extends true
      ? { readonly view: (state: S) => V }
      : { readonly view?: (state: S) => V }),
): ApplicationDefinition<S, ErrorOf<T[keyof T]> | Nexus.Command.CommandValidationError, Extract<RequirementOf<T[keyof T]>, Ambient>, V, InvokeKeys<T>, CommandInputs<T>>;
export function define(definition: { readonly views: Record<string, unknown>; readonly view?: unknown }): unknown {
  // Same rule as `defineApp`'s: the one view is the default. The runtime, which cannot see the types, defaults whenever `view` is absent and there is one key.
  const keys = Object.keys(definition.views);

  if (definition.view !== undefined) return definition;
  // A JS caller (or a cast) can omit `view` with no views or several: say so here, not later as "app.view is not a function".
  if (keys.length !== 1) throw new ValanceError("missing-view", "define: `view` is required unless `views` has exactly one entry");

  return { ...definition, view: () => keys[0] };
}

/**
 * The keys `invoke` takes, from a command table's type: an exact `"component/name"` key is itself, and a bare name `n` is `"app/n"` (what it is bound to outside a render).
 * A table whose type has no literal keys (`Record<string, …>`) takes any string.
 */
type InvokeKeys<T> = string extends keyof T ? string : { readonly [N in keyof T & string]: N extends `${string}/${string}` ? N : `app/${N}` }[keyof T & string];

/**
 * What `ApplicationHandle.command` takes, by key, from a command table's type: a bare name `n` is `"app/n"` and takes the command's input whole (its schema's type), and an exact
 * `"component/name"` key takes its entry's arguments, as `invoke` does. A table whose type has no literal keys takes any string and any input.
 */
type CommandInputs<T> = string extends keyof T
  ? Readonly<Record<string, unknown>>
  : {
      readonly [N in keyof T & string as N extends `${string}/${string}` ? N : `app/${N}`]: N extends `${string}/${string}`
        ? ReadonlyArray<Nexus.Mesh.IntentArgument>
        : T[N] extends Nexus.Command.Command<infer I, any, any, any>
          ? I
          : never;
    };

/** The rest of `command`'s parameters for an input `I`: optional when the empty input is one (a command that takes none). */
type InputArguments<I> = {} extends I ? [input?: I] : [input: I];

/** True for a union of two or more literals (`"a" | "b"`), false for a single one. */
type IsUnion<U, C = U> = [U] extends [never] ? false : U extends unknown ? ([C] extends [U] ? false : true) : never;

/** How a waiting command's work ended: the value it produced, or what its Promise rejected with, as received. */
export type Outcome<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: unknown };

/** What a command that waits says. Every function is a plain function of the state; none may throw (a throw is a defect, as in any command). */
export interface Waiting<S, I, A, R extends Ambient = never> {
  /** The state when the run starts, before the work: typically "loading". Optional: the state may already say so (start-time work). */
  readonly begin?: (input: I, current: S) => S;
  /**
   * The work: the only asynchronous thing. Either a Promise (`signal` aborts when the run is interrupted: the application closes), or, when the work needs a capability, an Effect
   * that requires the application's environment (`Nexus.Capability.require`), which Effect interrupts itself. Its result, or its rejection or failure, reaches `settle`; an
   * Effect's typed failure arrives exactly as it failed.
   */
  readonly work: (input: I, signal: AbortSignal) => Promise<A> | Effect.Effect<A, unknown, R>;
  /**
   * Is the result still relevant to the state as it is NOW? Asked when the work ends, in the same step as the commit; false and nothing is committed. **Required**, because a
   * result that no longer fits the application must not land silently. This is relevance to the application's state; it is separate from, and in addition to, a newer run of this
   * same command superseding an older one, which needs no code.
   */
  readonly wanted: (input: I, current: S) => boolean;
  /** The state once the work has ended and the result is wanted: success and failure alike are ordinary state. */
  readonly settle: (outcome: Outcome<A>, input: I, current: S) => S;
}

/** What `command(state)` returns: the pure-transition forms, and `waiting`. */
export interface CommandMaker<S> {
  (transition: (current: S) => S): Nexus.Command.Command<{}, void, never, never>;
  <I>(input: Schema.Schema<I>, transition: (input: I, current: S) => S): Nexus.Command.Command<I, void, never, never>;
  /**
   * A command whose body is an Effect: for what a pure transition cannot say. It may read the state, change it in several steps, move the route, wait on something it needs from the
   * platform (`Nexus.Capability.require`), or fail with its own typed error. Without an input schema it takes none. It is an ordinary NEXUS command, so a bare name binds it like any other.
   */
  effect<E = never, R extends Ambient = never>(run: () => Effect.Effect<void, E, R>): Nexus.Command.Command<{}, void, E, R>;
  effect<I, E = never, R extends Ambient = never>(input: Schema.Schema<I>, run: (input: I) => Effect.Effect<void, E, R>): Nexus.Command.Command<I, void, E, R>;
  /**
   * A command that waits. Once admitted it belongs to the application until it settles or is interrupted; closing the application aborts `work`'s signal and nothing commits afterwards.
   * **A newer run of the same command supersedes an older one**: the older run is NOT cancelled (its work continues, and its caller sees it complete) but its result is discarded,
   * success or failure. Whether a result is still wanted by the state is `wanted`'s question, answered per run.
   */
  waiting<I, A, R extends Ambient = never>(input: Schema.Schema<I>, spec: Waiting<S, I, A, R>): Nexus.Command.Command<I, void, never, R>;
}

/** The diagnostic id of a command made by `command`: it has no author-chosen id, and the id only decorates `CommandValidationError.command`. */
const TRANSITION_COMMAND = "valance.command";
const WAITING_COMMAND = "valance.waiting";
const EFFECT_COMMAND = "valance.effect";

/** The input of a command that takes none. */
const NO_INPUT = Schema.Struct({});

/**
 * Binds the application's state, and returns the function that makes commands whose whole behavior is a pure transition of it:
 * `transition` receives the validated input and the current state, and returns the next state. The input is validated by `input`
 * before `transition` runs, exactly as for any command (a failure is the typed `CommandValidationError`, and nothing commits).
 *
 *     const command = Valance.command(state);
 *     const add = command(Schema.Struct({ amount: Schema.Number }), ({ amount }, current) => ({ ...current, count: current.count + amount }));
 *     const increment = command((current) => ({ ...current, count: current.count + 1 }));   // no input: the same as `command(Schema.Struct({}), (_input, current) => …)`
 *
 * It is the trusted, atomic writer of Contract §3, not the validating one: the result is committed AS RETURNED, without being checked
 * against the state's schema, and concurrent transitions all land. (It is `state.update`, never `state.set`.)
 *
 * It is an ordinary NEXUS command, so `entry` binds it like any other. A command that must consult the platform, wait, or fail with
 * its own error is written as a NEXUS command over an Effect (`Nexus.Command.define`) and bound the same way.
 *
 * The state is bound in a first call, and the transition is checked against exactly that state type: what `transition` returns must be a
 * state, and is not inferred from what it returns. So a union-shaped state needs no annotation, a literal keeps the type the state gives it
 * (a mutable array stays mutable, a readonly one stays readonly), and no returned type is read "as const". (One call with the state and the
 * transition together cannot do this: TypeScript then types the returned literals from a type parameter of that same call, and widens them.)
 * A returned object is not checked for excess properties, the same as returning it from `state.update`.
 */
export const command = <S>(state: Nexus.State.StateHandle<S>): CommandMaker<S> => {
  const make = <I>(input: Schema.Schema<I>, transition: (input: I, current: S) => S): Nexus.Command.Command<I, void, never, never> =>
    Nexus.Command.define(TRANSITION_COMMAND, input, (decoded) => Effect.asVoid(state.update((current) => Effect.sync(() => transition(decoded, current)))));

  // The one-argument form is the two-argument form with the empty input: the same `Command`, validated, admitted and run in the same way.
  const transition = ((a: unknown, b?: unknown) =>
    b === undefined
      ? make(NO_INPUT, (_input, current) => (a as (current: S) => S)(current))
      : make(a as Schema.Schema<unknown>, b as (input: unknown, current: S) => S)) as unknown as (...args: ReadonlyArray<unknown>) => unknown;

  return Object.assign(transition, {
    effect: (a: unknown, b?: unknown) =>
      b === undefined
        ? Nexus.Command.define(EFFECT_COMMAND, NO_INPUT, () => (a as () => Effect.Effect<void, unknown, Ambient>)())
        : Nexus.Command.define(EFFECT_COMMAND, a as Schema.Schema<unknown>, (decoded) => (b as (input: unknown) => Effect.Effect<void, unknown, Ambient>)(decoded)),
    waiting: <I, A, R extends Ambient = never>(input: Schema.Schema<I>, spec: Waiting<S, I, A, R>): Nexus.Command.Command<I, void, never, R> => {
      let latest = 0; // this command's newest run: created with the command, so there is one per started application

      return Nexus.Command.define(WAITING_COMMAND, input, (decoded) =>
        Effect.gen(function* () {
          const mine = ++latest;

          if (spec.begin !== undefined) {
            yield* state.update((current) => Effect.sync(() => spec.begin!(decoded, current)));
          }

          // A Promise's rejection is `unknown` and is passed to `settle` exactly as received. Interruption (the application closing, or the caller's) is not a failure: it ends the
          // run here, aborts `signal`, and `settle` never runs.
          // The work is a Promise or an Effect. A Promise is awaited here, with the signal; an Effect is only taken here and run after, so it is interrupted as any Effect is and may use the
          // application's capabilities. Whichever it is, a throw from `work` itself is a failure outcome.
          const started = yield* Effect.tryPromise({
            try: async (signal) => {
              const produced = spec.work(decoded, signal);

              return Effect.isEffect(produced) ? { effect: produced as Effect.Effect<A, unknown, R> } : { value: await produced };
            },
            catch: (error) => error,
          }).pipe(Effect.catchAll((error) => Effect.succeed({ failed: error })));
          const outcome: Outcome<A> =
            "failed" in started
              ? { ok: false, error: started.failed }
              : "value" in started
                ? { ok: true, value: started.value }
                : yield* started.effect.pipe(
                    Effect.map((value): Outcome<A> => ({ ok: true, value })),
                    Effect.catchAll((error) => Effect.succeed<Outcome<A>>({ ok: false, error })),
                  );

          // Both questions are asked in the same atomic step as the commit: is this still the newest run of this command, and is the result still wanted by the state as it is now.
          yield* state.update((current) => Effect.sync(() => (mine === latest && spec.wanted(decoded, current) ? spec.settle(outcome, decoded, current) : current)));
        }).pipe(Effect.asVoid),
      );
    },
  }) as unknown as CommandMaker<S>;
};

/** The field names of a command's struct input, in order; `undefined` when the input is not a struct. */
const fieldsOf = (schema: Schema.Schema<any>): ReadonlyArray<string> | undefined => {
  let ast = schema.ast;

  while (ast._tag === "Refinement") {
    ast = ast.from;
  }

  return ast._tag === "TypeLiteral" ? ast.propertySignatures.map((property) => String(property.name)) : undefined;
};

/**
 * The binding of a bare command name. When the input is a struct and every argument carries a name (MESH writes one for an argument that is a plain path: `to`, `row.id`), each
 * name is a different field of it, the arguments fill those fields BY NAME. Otherwise (a literal or `$event` has no name, a name is not a field, two share one, or an `invoke` passes
 * arguments without `name`) a struct takes its arguments as its fields in order, and an input that is not a struct takes the first argument whole.
 */
const bareBinding = <E, R>(command: Nexus.Command.Command<any, any, E, R>): Nexus.Mesh.Binding<E | Nexus.Command.CommandValidationError, R> => {
  const fields = fieldsOf(command.input);

  return Nexus.Mesh.bind(command, (args) => {
    const values = args.map(plain);

    if (fields === undefined) {
      return values[0];
    }

    const names = args.map((argument) => argument.name);

    return args.length > 0 && names.every((name) => name !== undefined && fields.includes(name)) && new Set(names).size === names.length
      ? Object.fromEntries(names.map((name, index) => [name, values[index]]))
      : Object.fromEntries(fields.map((field, index) => [field, values[index]]));
  });
};

/**
 * A bare command bound to receive its input WHOLE, as one argument: what history supplies when its `navigate` names a bare command. The navigation fact `stateOf` reads from a
 * URL is not an event's arguments but the command's input, so the positional rule of `bareBinding` (a struct takes its arguments as fields, in order) does not apply to it. The
 * input is validated by the command's schema as always.
 */
const wholeBinding = <E, R>(command: Nexus.Command.Command<any, any, E, R>): Nexus.Mesh.Binding<E | Nexus.Command.CommandValidationError, R> =>
  entry(command, (...values) => values[0]);

/** What an entry's argument is to the application: the value itself, or `undefined` when the argument is absent. */
const plain = (argument: Nexus.Mesh.IntentArgument): unknown => ("value" in argument ? argument.value : undefined);

/**
 * An entry's behavior: it runs the command `run`, with the input `input` makes from the entry's arguments, as plain values in order (an absent
 * argument is `undefined`). Without `input` the command is given `{}`, the input of a command that takes none. `input`'s result is
 * validated by the command's schema before its body runs, as for any command.
 *
 * The result is a table entry for `ApplicationDefinition.commands`. Any number of entries may run the same command, and it takes a
 * command from `command` or from NEXUS. A rendered view's entry is keyed `"component/name"`; an entry for a caller outside any view
 * (`invoke`, history) is keyed `"app/..."`. Both are resolved in the one table, and an unknown key is the typed `UnmappedCommand`.
 */
export const entry = <I, O, E, R>(
  run: Nexus.Command.Command<I, O, E, R>,
  input?: (...values: ReadonlyArray<unknown>) => unknown,
): Nexus.Mesh.Binding<E | Nexus.Command.CommandValidationError, R> => Nexus.Mesh.bind(run, (args) => (input === undefined ? {} : input(...args.map(plain))));

/**
 * One event a view's program declares whose `component/command` key the application's command table lacks. `key`, `component` and `command`
 * are MESH's declaration; `view` is the application's name for the program; `span` is MESH's, in the source of `component`'s template (it names no file).
 */
export interface UnmappedDeclaration {
  readonly view: string;
  readonly component: string;
  readonly event: string;
  readonly command: string;
  readonly key: string;
  readonly span: SourceSpan;
}

/**
 * `start`'s conformance failure (D ⊆ B, Contract §2): every event the programs of ALL the application's views declare needs an entry in the command table.
 * `missing` lists each declaration whose key is absent: in the order of the definition's views, then MESH's order. It says only that a key is absent: nothing
 * about a command, a binding, arguments or success.
 */
export type ConformanceViolation = { readonly _tag: "ConformanceViolation"; readonly missing: ReadonlyArray<UnmappedDeclaration> };

/**
 * Why `start` yields no handle: NEXUS's state and platform failures; the diagnostics MESH reports for a view's program (the first view, in the definition's order,
 * that has any: they depend on the program alone, never on state); or the conformance failure.
 */
export type StartError = Nexus.Application.ApplicationInitError | Nexus.State.StateInitError | Nexus.Mesh.MeshDiagnostics | ConformanceViolation | Nexus.Mesh.UnmappedCommand;

export interface StartOptions<S> {
  /** Supplied to NEXUS `Application.start`, where platform services (capabilities, Clock, …) enter. */
  readonly platform?: Nexus.Application.Platform;
  /** Overrides the definition's initial state: the client's, from what the server embedded. */
  readonly state?: S;
  /**
   * How the application ends. `grace` is how long closing the application's Scope waits for the commands it admitted (and the work NEXUS tracks) to finish on their own, after new
   * commands are refused, before it interrupts what is left and waits for each to exit. The default, `0`, interrupts at once. `Duration.infinity` waits for every command.
   */
  readonly shutdown?: Nexus.Runtime.ShutdownOptions;
  /**
   * Receives the whole cause of a start-time command's failure, which the log leaves out (it carries only the failure's identity, since the cause may hold a secret). Opt in to send it
   * somewhere you control. Not called for interruption or a refusal by a closing application. A throw from it is ignored.
   */
  readonly onStartFailure?: (cause: Cause.Cause<unknown>) => void;
}

/** What a failure is called in a log without saying what it carried: its `_tag`, `code` or `name` when it has one, else the kind of failure. Never a message or a value. */
const failureIdentity = (cause: Cause.Cause<unknown>): string => {
  const found = Option.orElse(Cause.failureOption(cause), () => Cause.dieOption(cause));

  if (Option.isSome(found) && typeof found.value === "object" && found.value !== null) {
    const named = found.value as { readonly _tag?: unknown; readonly code?: unknown; readonly name?: unknown };
    const label = [named._tag, named.code, named.name].find((each) => typeof each === "string" && /^[\w.:-]{1,64}$/.test(each));

    if (typeof label === "string") {
      return label;
    }
  }

  return Option.isSome(Cause.failureOption(cause)) ? "failure" : Option.isSome(Cause.dieOption(cause)) ? "defect" : "unknown";
};

/**
 * The application's external face: what code outside its definition, and outside any MESH render, may do with it.
 * Whoever holds it (a host page, a custom producer, a headless host, one of Valance's own bindings) holds exactly this.
 *
 * It carries no runtime, no render, no dispatch, and no lifecycle: the application's lifetime is the `Scope` `start`
 * ran in, and nothing here ends it, restarts it, or reports on it.
 */
export interface ApplicationHandle<S, E, K extends string = string, C extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
  /**
   * The application's current state: one read, as of when it runs. A read, not a subscription: the state a host sees
   * is the state commands have committed, whatever view is shown.
   */
  readonly state: Effect.Effect<S>;
  /**
   * Runs the command bound to `key` with the given arguments, exactly as a MESH intent for that key would:
   * through the same table, so there is one way into application behavior. For input that does not come from a MESH
   * render (a browser event, a host page, a headless caller).
   *
   * It executes in the application's own context, with the platform's FiberRefs, and nothing of that context flows
   * back to the caller (NEXUS I44). The caller needs no runtime and provides no services: interrupting the returned
   * effect interrupts the command, and typed failures and defects pass through unchanged.
   *
   * `key` is one of `K` (from `define`'s command table: `"app/name"` for a bare command, an exact key as written), which an editor completes, or any other string, as before: a key
   * the table lacks is the typed `UnmappedCommand` at run time, not a type error (a table built by spreading another has keys its type does not show). A method, so a typed handle is
   * still an `ApplicationHandle<S, E>`.
   */
  invoke(key: K | (string & {}), args: ReadonlyArray<Nexus.Mesh.IntentArgument>): Effect.Effect<unknown, Nexus.Mesh.UnmappedCommand | E>;
  /**
   * Runs the command bound to `key`, as `invoke` does (the same table, the same admission), with a key and an input the type CHECKS. Opt-in: `invoke` is unchanged.
   *
   *  - **`"app/name"` for a bare command** takes the command's input whole, typed by its schema: a struct by field name (`command("app/move", { from, to })`), never by
   *    position; another input as itself; nothing for a command that takes none. It is validated by the command's schema as always.
   *  - **an exact `"component/name"` key** takes its entry's arguments, as `invoke` does: what an `entry`'s adapter makes of them is not in its type.
   *
   * A key the table's type lacks is a type error. A table built by spreading one typed as the wide `CommandTable` has keys its type does not show: give the shared table its
   * own literal keys (no annotation), or call those keys with `invoke`. A table whose type has no literal keys at all takes any string, and an unknown key is the typed `UnmappedCommand`.
   */
  command<N extends keyof C & string>(key: N, ...input: InputArguments<C[N]>): Effect.Effect<unknown, Nexus.Mesh.UnmappedCommand | E>;
}

/**
 * Starts the application. Its lifetime is the caller's `Scope`: closing it ends the application and its state, and
 * Valance keeps nothing that outlives that scope. (NEXUS can also end an application early; that is the substrate's,
 * is outside this model, and nothing here asks for it. The command drain below belongs to the Scope close, so that route does not pass it.)
 */
export const start = <
  S,
  E,
  R extends Ambient,
  V extends string,
  K extends string = string,
  C extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
>(
  app: ApplicationDefinition<S, E, R, V, K, C>,
  options: StartOptions<S> = {},
): Effect.Effect<ApplicationHandle<S, E, K, C>, StartError, Scope.Scope> =>
  Effect.gen(function* () {
    const definition = Nexus.Application.define({ name: app.name, runtime: Layer.empty });
    const nexus = yield* Nexus.Application.start(
      definition,
      options.platform === undefined && options.shutdown === undefined
        ? undefined
        : { ...(options.platform === undefined ? {} : { platform: options.platform }), ...(options.shutdown === undefined ? {} : { shutdown: options.shutdown }) },
    );

    // Command lifetime: a command admitted through `inApplication` stays owned by the application until it exits. When the
    // application's Scope closes, VALANCE closes admission, waits up to `shutdown.grace` for the admitted commands to finish, then interrupts and awaits
    // every one that is left, BEFORE NEXUS terminates and the platform releases its resources. This finalizer is added right after `Application.start` registered
    // NEXUS's own; Scope finalizers run in reverse order, so it runs first. It owns commands only, not daemons or escaped fibers.
    const admitted = new Set<Fiber.RuntimeFiber<unknown, unknown>>();
    let admissionClosed = false;

    const grace = Duration.decode(options.shutdown?.grace ?? 0);

    yield* Effect.addFinalizer(() =>
      Effect.suspend(() => {
        admissionClosed = true; // closes synchronously, before anything below can run

        const commands = [...admitted];
        // The wait is a fiber of its own, interruptible, so the grace can end it although a finalizer is not: the Scope's close awaits it.
        const waited = Effect.interruptible(
          Effect.ignore(
            Effect.timeout(
              Effect.forEach(commands, (command) => Fiber.await(command), { discard: true }),
              grace,
            ),
          ),
        );

        // No grace is no wait at all (not even a turn): a command admitted in the step the close began is interrupted before it runs.
        return commands.length === 0
          ? Effect.void
          : (Duration.isZero(grace) ? Effect.void : Effect.flatMap(Effect.forkDaemon(waited), Fiber.await)).pipe(
              Effect.andThen(Effect.forEach(commands, (command) => Fiber.interrupt(command), { discard: true })), // interrupts what is left, and awaits each ACTUAL exit
            );
      }),
    );
    const state = yield* Nexus.Application.createState(nexus, app.state.schema, options.state ?? app.state.initial);
    const given = app.commands(state);

    // Conformance, D ⊆ B (Contract §2). B is the table's own keys. D is what MESH says the programs of EVERY view declare (unselected views, inactive
    // conditional branches and repeated bodies included): VALANCE asks MESH and reads no program. A program MESH rejects has no declared events, so it fails
    // `start` first (its diagnostics do not depend on state), and D ⊆ B is evaluated only for a complete D. A MESH package failure is a defect, as in a render.
    const declared: Array<{ readonly view: string; readonly event: DeclaredEvent }> = [];

    for (const [view, { program }] of Object.entries<View<S>>(app.views)) {
      const result = yield* Effect.promise(() => declaredEvents({ program: { root: program.root, templates: program.templates }, model: program.model }));

      if (result.diagnostics !== undefined) {
        return yield* Effect.fail<Nexus.Mesh.MeshDiagnostics>({ _tag: "MeshDiagnostics", diagnostics: result.diagnostics });
      }

      declared.push(...result.events.map((event) => ({ view, event })));
    }

    // The table every later step uses: exact keys as given, then bare names bound where an exact key is absent (the rule on `ApplicationDefinition.commands`).
    // Built from D, which is already known, so the registry, the hosts, `invoke` and conformance see ONE plain table of exact keys.
    const commands: Record<string, Nexus.Mesh.Binding<E, R>> = {};
    const named = new Map<string, Nexus.Mesh.Binding<E, R>>();

    for (const [key, value] of Object.entries(given)) {
      if (key.includes("/")) {
        commands[key] = value as Nexus.Mesh.Binding<E, R>;
      } else if (typeof value === "function") {
        throw new ValanceError(
          "bare-command-binding",
          `VALANCE: "${key}" is a bare command name, so it must hold a command; a binding (entry) belongs under a "component/name" key`,
        );
      } else {
        named.set(key, bareBinding(value) as Nexus.Mesh.Binding<E, R>);
      }
    }

    // The units' commands: a binding for each, below an exact key the author wrote and above a bare name (which would otherwise bind to a unit's command of the same name).
    let deliverIntent: Deliver = () => Effect.die(new ValanceError("target-not-drawn", "VALANCE: a unit announced something before the application was ready"));
    const registry: Registry | undefined = app.units === undefined || Object.keys(app.units).length === 0 ? undefined : yield* makeRegistry(app.units, () => deliverIntent);

    for (const [key, binding] of Object.entries(registry?.bindings ?? {})) {
      commands[key] ??= binding as Nexus.Mesh.Binding<E, R>;
    }

    for (const [name, binding] of named) {
      commands[`app/${name}`] ??= binding;
    }

    for (const [key, value] of Object.entries(given)) {
      if (!key.includes("/")) {
        commands[INPUT_KEY(key)] ??= wholeBinding(value as Nexus.Command.Command<any, any, E, R>) as Nexus.Mesh.Binding<E, R>;
      }
    }

    for (const { event } of declared) {
      const bound = named.get(event.command);

      if (bound !== undefined) {
        commands[`${event.component}/${event.command}`] ??= bound;
      }
    }

    const missing = declared.flatMap(({ view, event }): ReadonlyArray<UnmappedDeclaration> => {
      const key = `${event.component}/${event.command}`;

      return Object.hasOwn(commands, key) ? [] : [{ view, component: event.component, event: event.event, command: event.command, key, span: event.span }];
    });

    if (missing.length > 0) {
      return yield* Effect.fail<ConformanceViolation>({ _tag: "ConformanceViolation", missing });
    }

    // The views the application has, by name: those it was defined with, and those admitted since (`admit`). One host per view, used to dispatch (render, handler) → intent → command.
    // The one NEXUS state is shared by all of them. A view is admitted by replacing its entry and bumping its generation, so a render made before is never `update`d into one made after.
    const views: Record<string, View<S>> = { ...app.views };
    const generations = new Map<string, number>();
    // How many times a view that is being shown was admitted anew: part of what a render is made from, so a render is wanted when it changes (see `values`). A plain counter, not a stream: the
    // wake is the state's own (an admission commits the state it finds, which `values` emits whether or not it differs).
    let admissions = 0;
    const hosts = new Map<string, Nexus.Mesh.Host<E, R>>(
      Object.entries<View<S>>(views).map(([name, view]) => [name, Nexus.Mesh.host<E, R>({ program: view.program, scope: Nexus.Selector.define(state, view.scope), commands })]),
    );
    // The count `focusFirstInvalid` reads from a state, for the render of that state: absent when the application has no such function.
    const attended = (value: S): { readonly attention?: number } => (app.focusFirstInvalid === undefined ? {} : { attention: app.focusFirstInvalid(value) });
    // The render of one given state. The adapter renders a host's scope value, not a value it is handed, and a
    // sequential stream must render each emitted state exactly: a constant scope does that.
    const renderOf = (value: S): Effect.Effect<Viewed, Nexus.Mesh.MeshDiagnostics> =>
      Effect.gen(function* () {
        const view = app.view(value);
        const snapshot = views[view]!.scope(value) as Record<string, unknown>;
        const generation = generations.get(view) ?? 0;

        if (registry === undefined) {
          const scope = { value: Effect.succeed(snapshot), changes: Stream.empty, values: Stream.make(snapshot) };
          const render = yield* Nexus.Mesh.host<never, never>({ program: views[view]!.program, scope, commands: {} }).render;

          return { view, render, snapshot, generation, ...attended(value) };
        }

        const render = yield* renderWithUnits(views[view]!.program, snapshot, yield* registry.units);

        yield* registry.observe(render);

        return { view, render, snapshot, generation, ...attended(value) };
      });

    // The render of `value` after `previous`: the same view is MESH's update of the previous render (the new render and the patches that turn the one into the other), anything else
    // is rendered afresh. The previous render is the last one this stream produced, so what `update` is given is always the render the target was last given.
    const advance = (previous: Viewed | undefined, value: S): Effect.Effect<Viewed, Nexus.Mesh.MeshDiagnostics> =>
      Effect.gen(function* () {
        const view = app.view(value);

        // Another view, or the same view admitted anew since (its program is not the one the previous render was made from): rendered afresh, with the keys of the new program.
        if (previous === undefined || previous.view !== view || previous.generation !== (generations.get(view) ?? 0)) {
          return yield* renderOf(value);
        }

        const snapshot = views[view]!.scope(value) as Record<string, unknown>;
        const { render, patches } =
          registry === undefined ? yield* Nexus.Mesh.update(previous.render, snapshot) : yield* updateWithUnits(previous.render, snapshot, yield* registry.units);

        if (registry !== undefined) {
          yield* registry.observe(render);
        }

        return { view, render, snapshot, generation: generations.get(view) ?? 0, patches, ...attended(value) } satisfies Viewed;
      });

    // The one place an event enters the application's execution: its own fiber, with its own FiberRefs (NEXUS
    // `runFork`: the handle holds none of them, so joining it imports nothing into the caller). The caller's
    // interruption interrupts the event; results, typed failures and defects pass through unchanged.
    // Admission: the command registers ITS OWN fiber as its first step. The admission check and the registration are one
    // synchronous step inside that fiber (no gap in which the drain's snapshot could be taken between them); a refusal is a
    // defect, by Effect's own means. The command leaves the registry on every exit.
    const admit = <A, F>(effect: Effect.Effect<A, F, R>): Effect.Effect<A, F, R> =>
      Effect.acquireUseRelease(
        Effect.withFiberRuntime<void>((fiber) =>
          Effect.sync(() => {
            if (admissionClosed) {
              throw new ValanceError("admission-closed", "VALANCE: admission is closed (draining)");
            }

            admitted.add(fiber as Fiber.RuntimeFiber<unknown, unknown>);
          }),
        ),
        () => effect,
        () =>
          Effect.withFiberRuntime<void>((fiber) =>
            Effect.sync(() => {
              admitted.delete(fiber as Fiber.RuntimeFiber<unknown, unknown>);
            }),
          ),
      );
    const inApplication = <A, F>(effect: Effect.Effect<A, F, R>): Effect.Effect<A, F> =>
      Effect.suspend(() => {
        const handle = Nexus.Runtime.runFork(nexus.runtime, admit(effect));

        return Fiber.join(handle).pipe(Effect.onInterrupt(() => Fiber.interrupt(handle)));
      });

    const running: Running<S, E> = {
      nexus,
      render: Effect.flatMap(state.get, renderOf),
      // Latest available state. Each element the state stream delivers is only a wake-up: the state rendered is the CURRENT one, and a state already
      // presented is not presented again, so commits that landed while a render was in progress are superseded by the latest, not queued behind it.
      // `state.get` is read after the wake, so what is rendered is never older than the element that woke it; the first element is still the first draw.
      // With units, a change in any occurrence's state wakes a render too, and a render is wanted when either the application's state or the units' state is not the one last rendered.
      values:
        registry === undefined
          ? Stream.mapAccumEffect(
              Stream.changesWith(
                Stream.mapEffect(state.values, () =>
                  Effect.zip(
                    state.get,
                    Effect.sync(() => admissions),
                  ),
                ),
                (left, right) => Equal.equals(left[0], right[0]) && left[1] === right[1],
              ),
              undefined as Viewed | undefined,
              (previous, [value]) => advance(previous, value).pipe(Effect.map((viewed): readonly [Viewed | undefined, Viewed] => [viewed, viewed])),
            )
          : Stream.mapAccumEffect(
              Stream.changesWith(
                Stream.mapEffect(Stream.merge(state.values, registry.epoch.values), () => Effect.all([state.get, registry.epoch.get, Effect.sync(() => admissions)])),
                (left, right) => left[0] === right[0] && left[1] === right[1] && left[2] === right[2],
              ),
              undefined as Viewed | undefined,
              (previous, [value]) => advance(previous, value).pipe(Effect.map((viewed): readonly [Viewed | undefined, Viewed] => [viewed, viewed])),
            ),
      dispatch: (viewed, handler, payload) => {
        const host = hosts.get(viewed.view);

        return host === undefined ? Effect.die(new ValanceError("unknown-view", `no view named ${viewed.view}`)) : inApplication(host.dispatch(viewed.render, handler, payload));
      },
      admit: (name, view) =>
        Effect.gen(function* () {
          if (admissionClosed) {
            return yield* Effect.die(new ValanceError("admission-closed", "VALANCE: admission is closed (draining)"));
          }

          // The same invariant as `start`, for this program alone: what MESH says it declares must all be in the table. Nothing is changed unless it holds.
          const result = yield* Effect.promise(() => declaredEvents({ program: { root: view.program.root, templates: view.program.templates }, model: view.program.model }));

          if (result.diagnostics !== undefined) {
            return yield* Effect.fail<Nexus.Mesh.MeshDiagnostics>({ _tag: "MeshDiagnostics", diagnostics: result.diagnostics });
          }

          const bound = (event: DeclaredEvent): Nexus.Mesh.Binding<E, R> | undefined => {
            const key = `${event.component}/${event.command}`;

            return Object.hasOwn(commands, key) ? commands[key] : named.get(event.command);
          };
          const unmapped = result.events.filter((event) => bound(event) === undefined);

          if (unmapped.length > 0) {
            return yield* Effect.fail<ConformanceViolation>({
              _tag: "ConformanceViolation",
              missing: unmapped.map((event) => ({
                view: name,
                component: event.component,
                event: event.event,
                command: event.command,
                key: `${event.component}/${event.command}`,
                span: event.span,
              })),
            });
          }

          for (const event of result.events) {
            commands[`${event.component}/${event.command}`] ??= bound(event)!;
          }

          views[name] = view;
          hosts.set(name, Nexus.Mesh.host<E, R>({ program: view.program, scope: Nexus.Selector.define(state, view.scope), commands }));
          generations.set(name, (generations.get(name) ?? 0) + 1);

          // A mount that shows this view draws the new program now; one that shows another has nothing to redraw.
          if (app.view(yield* state.get) === name) {
            admissions += 1;
            yield* state.update((current) => Effect.succeed(current));
          }
        }),
      state: state.get,
      states: state.values,
      invoke: (key, args) => {
        const binding = Object.hasOwn(commands, key) ? commands[key] : undefined;
        const [component = "", name = ""] = key.split("/");

        return binding === undefined ? Effect.fail<Nexus.Mesh.UnmappedCommand>({ _tag: "UnmappedCommand", component, name }) : inApplication(binding(args));
      },
      // A bare command's `"app/name"` (no exact key of that name) runs the binding that takes the input whole; anything else is `invoke`, with the input as the arguments.
      command: (key, input) => {
        const name = key.startsWith("app/") ? key.slice("app/".length) : undefined;

        return name !== undefined && !Object.hasOwn(given, key) && named.has(name)
          ? running.invoke(INPUT_KEY(name), [{ value: (input ?? {}) as BoundaryValue }])
          : running.invoke(key, (input ?? []) as ReadonlyArray<Nexus.Mesh.IntentArgument>);
      },
    };

    // What a unit announces to its caller goes where any event does: to the table's binding for the intent, admitted like any command.
    deliverIntent = (intent) => {
      const { component, name } = intent.command;
      const key = `${component}/${name}`;
      const binding = Object.hasOwn(commands, key) ? commands[key] : undefined;

      return binding === undefined
        ? Effect.fail<Nexus.Mesh.UnmappedCommand>({ _tag: "UnmappedCommand", component, name })
        : inApplication((binding as (args: ReadonlyArray<Nexus.Mesh.IntentArgument>, intent: Nexus.Mesh.CommandIntent) => Effect.Effect<unknown, E, R>)(intent.arguments, intent));
    };

    // Start-time work: the SAME admission as `invoke` and dispatch, with no caller. Last step before the handle exists, after every failure `start` can have, so a
    // failed start runs nothing. The fiber registers itself first (`admit`); a Scope close that wins the race finds admission closed and the work dies unrun.
    // `Effect.exit` keeps its exit from being an unhandled fiber failure: nobody joins it. A failure is LOGGED (`Effect.logError`, as a failed popstate is, C28),
    // never returned: there is no caller to return it to, and the state stays the only channel. Interruption and a refusal by a closing application are not failures.
    if (app.start !== undefined) {
      const startKey = app.start.includes("/") ? app.start : `app/${app.start}`;
      const binding = Object.hasOwn(commands, startKey) ? commands[startKey] : undefined;
      const [component = "", name = ""] = startKey.split("/");

      if (binding === undefined) {
        return yield* Effect.fail<Nexus.Mesh.UnmappedCommand>({ _tag: "UnmappedCommand", component, name });
      }

      Nexus.Runtime.runFork(
        nexus.runtime,
        Effect.exit(
          admit(binding([])).pipe(
            Effect.tapErrorCause((cause) =>
              admissionClosed || Cause.isInterruptedOnly(cause)
                ? Effect.void
                : Effect.logError("start-time work failed").pipe(
                    Effect.annotateLogs({ failure: failureIdentity(cause) }),
                    Effect.zipRight(
                      Effect.sync(() => {
                        try {
                          options.onStartFailure?.(cause);
                        } catch {
                          // the application's own sink failing is not the application's failure
                        }
                      }),
                    ),
                  ),
            ),
          ),
        ),
      );
    }

    return handleOf(running);
  });

/**
 * Late admission (Tier 2, Provisional; decision W19): puts a view's program into a running application, under `name`, and draws it. For code that arrives after the application has
 * started (a route's program in a chunk loaded once the page is running): the application shows a placeholder view while it loads, and admits the real one when it has.
 *
 * - The program is held to the invariant `start` holds every view to: what MESH says it declares must be in the command table. If not, this fails with the same `ConformanceViolation`
 *   (naming the view) and **nothing changes**. A program MESH rejects fails with its diagnostics.
 * - A `name` the application already has is replaced (the placeholder gives way); a new one is added. Either way a mount that is showing it draws it **afresh**, with the keys of the new
 *   program, never `update`d from the old render (the keys of a program are derived from it; MESH's `update` of another program's render is not defined). A mount showing another view is
 *   not redrawn.
 * - The state is not touched: which view the state selects is still `view(state)`, so a view named by `view` must have been admitted (or defined) by the time the state selects it.
 *
 * It is the loading that is the application's: an ordinary waiting command whose busy and failed states are application state (Bet 3, W13). `admit` is only the step that makes what arrived usable.
 */
export const admit = <S, E>(handle: ApplicationHandle<S, E>, name: string, view: View<S>): Effect.Effect<void, ConformanceViolation | Nexus.Mesh.MeshDiagnostics> =>
  Effect.suspend(() => runningOf(handle).admit(name, view));

/** Reports what the user did: PORT's handler identifier and payload. */
export type Report = (handler: string, payload?: BoundaryValue) => void;

/**
 * PORT's contract as the composer uses it. `draw`/`update` carry program continuity, which only the composer knows. A PORT that can apply MESH's patches in place also has `patch`: the
 * composer then gives it the patches of each later render of the same view, and `update` only when there are none (a target without `patch` is always given `update`).
 */
export interface Target {
  draw(tree: RenderTree): void;
  update(tree: RenderTree): void;
  patch?(patches: Nexus.Mesh.RenderPatches): unknown;
  /** Asks the platform to move focus to the part `key` names, once the render that has it is applied (a request, not state): `focusFirstInvalid` uses it. A target that cannot has none. */
  focus?(key: string): unknown;
  unmount(): void;
}

/** A target whose PORT can take over server output (a PORT with a `hydrate`). `H` is PORT's own result. */
export interface HydratableTarget<H> extends Target {
  hydrate(tree: RenderTree): H;
}

/** Builds a target that reports to `report`. */
export type TargetFactory<T extends Target> = (report: Report) => T;

/**
 * What `mount` returns (and `hydrate` returns with `hydration` added): a host's view of ONE mount, owned by that mount's Scope. Every member is
 * mount-owned information that no other public surface gives a host: `followed` is the only way to learn how the mount ended (the application ended, a render
 * failed, or its Scope closed), `settled` the only way to wait for the event dispatches the mount made, `dispatched` the only record of their outcomes.
 * Hosts that need none of them can ignore the value. The lifecycle of each member is stated in "Canonical lifecycle architecture" (docs/FINDINGS.md).
 */
export interface Mounted<E> {
  /**
   * The exit of the most recent dispatches this mount made for a reported event, appended as each one settles (settle order, never reordered). It is
   * BOUNDED: it keeps the most recent `MountOptions.ledger` exits (1,000 by default), and the oldest is dropped when one more arrives (`dispatchedDropped` counts them).
   * The only place the outcome of an event-triggered command is recorded: a failure or a defect appears nowhere else (not in state, values or the render), so
   * a dropped failure or defect is logged once, as it is dropped (`Effect.logError`, the failure's identity only). It is the same live array for the mount's life.
   * It belongs to the mount that dispatched, so exits keep arriving after that mount closed (a command is the application's once admitted, and ends with
   * the application at the latest). It is an observation facility for hosts and tests, not part of the application programming model: nothing in
   * Valance reads it, and `ApplicationHandle` does not expose it. It lives as long as the `Mounted` value is held.
   */
  readonly dispatched: ReadonlyArray<DispatchExit<E>>;
  /** How many exits `dispatched` has dropped to stay within its bound: the oldest ones, in settle order. `dispatched.length + dispatchedDropped` is every exit so far. Live, like `dispatched`. */
  readonly dispatchedDropped: number;
  /**
   * A barrier: succeeds once every dispatch this OPEN mount has made so far has settled (and those made while it waits). It does not read `dispatched`.
   * A closed mount holds no dispatches, so `settled` returns at once and does not wait for the exits that are still to arrive in `dispatched`.
   */
  readonly settled: Effect.Effect<void>;
  /** Completes when Valance stops following renders: Success when the application ended, a Failure when a render failed, Interrupted when the scope closed. */
  readonly followed: Effect.Effect<Exit.Exit<void, Nexus.Mesh.MeshDiagnostics>>;
}

/** `value` without `key`, keeping its other members as they are: a getter stays live (`{ ...value }` would read it once). */
const without = <V extends object, K extends keyof V>(value: V, key: K): Omit<V, K> => {
  const { [key as PropertyKey]: _, ...rest } = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;

  return Object.defineProperties({}, rest) as Omit<V, K>;
};

/** What `mount` and `hydrate` take beyond the application and the target. */
export interface MountOptions {
  /**
   * How many of the most recent exits `Mounted.dispatched` keeps (default 1,000): a number of at least 0. `Infinity` keeps every exit (the ledger then grows with every event,
   * for the life of the `Mounted` value); `0` records none (each exit counts as dropped, and a failure or defect is logged).
   */
  readonly ledger?: number;
  /**
   * A recorder (`recorder` of `@valancex/valance/replay`) for the session this mount follows: it is told each render presented and each event the target reports. A development feature
   * (Provisional): `vlx dev --record` passes one; the application's own code and a production build do not. A log holds the user's data, so it is never on by default.
   */
  readonly record?: SessionRecorder;
}

/** The ledger's default bound: the most recent exits kept. */
const DEFAULT_LEDGER = 1000;

const ledgerBound = (ledger: number | undefined): number => {
  const bound = ledger ?? DEFAULT_LEDGER;

  if (Number.isNaN(bound) || bound < 0) {
    throw new ValanceError("invalid-ledger", `the ledger bound must be a number of at least 0 (Infinity keeps every exit), found ${String(bound)}`);
  }

  return Math.floor(bound);
};

/** The key of the first node, in tree order, whose `invalid` prop is true: where a failed submit takes the person. */
const firstInvalid = (part: RenderTree["root"] | RenderTree["root"]["children"][number]): string | undefined => {
  if (part.type === "text") {
    return undefined;
  }

  if (part.props["invalid"] === true) {
    return part.key;
  }

  for (const child of part.children) {
    const found = firstInvalid(child);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
};

const connect = <S, E, T extends Target, A>(
  application: ApplicationHandle<S, E>,
  create: TargetFactory<T>,
  first: (target: T, tree: RenderTree) => A,
  options: MountOptions | undefined,
): Effect.Effect<Mounted<E> & { readonly first: A }, Nexus.Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.gen(function* () {
    const running = runningOf(application);
    const scope = yield* Effect.scope;
    // The render whose tree is drawn: the only render an event may be dispatched with (NEXUS M1, M2).
    const drawn: { current: Viewed | undefined } = { current: undefined };
    const bound = ledgerBound(options?.ledger);
    const dispatched: Array<DispatchExit<E>> = [];
    let dropped = 0;
    const pending: Array<Fiber.RuntimeFiber<unknown, never>> = [];

    const target = create((handler, payload) => {
      const render = drawn.current;

      if (render === undefined) {
        throw new ValanceError("target-not-drawn", "the target reported an interaction before anything was drawn");
      }

      options?.record?.event({ handler, payload, render: render.render });

      // `dispatch` runs inside the application (its platform's FiberRefs apply) and nothing flows back (NEXUS I44).
      const fiber = Effect.runFork(
        Effect.exit(running.dispatch(render, handler, payload)).pipe(
          Effect.tap((exit) => {
            // Kept: the most recent `bound`. The oldest is dropped as one more arrives, and a failure or defect that nothing else records is logged, once, now.
            dispatched.push(exit);

            const leaving = dispatched.length > bound ? dispatched.splice(0, dispatched.length - bound) : [];

            dropped += leaving.length;

            return Effect.forEach(
              leaving,
              (left) =>
                Exit.isFailure(left) && !Cause.isInterruptedOnly(left.cause)
                  ? Effect.logError("event command exit dropped from the ledger").pipe(Effect.annotateLogs({ failure: failureIdentity(left.cause) }))
                  : Effect.void,
              { discard: true },
            );
          }),
        ),
      );

      // A dispatch that has ended is settled: it leaves `pending` at once, so a long-lived mount whose host never calls `settled` doesn't hold every fiber.
      pending.push(fiber);
      fiber.addObserver(() => {
        const index = pending.indexOf(fiber);

        if (index >= 0) {
          pending.splice(index, 1);
        }
      });
    });

    // `running.values` is the render of the current state, then of the latest state after each wake-up (superseded intermediate states may be
    // skipped, never reordered): the first element is the first draw (or hydration), no commit can fall between. A later render of the SAME view is
    // the same program: update. One of ANOTHER view is another program, and only the composer knows that: draw afresh.
    // The follower is Valance's fiber, not NEXUS's (O15): the caller's scope owns it.
    // The `focusFirstInvalid` count of the render last applied: what a later one is compared with.
    let attention: number | undefined;
    const firstDone = yield* Deferred.make<A, Nexus.Mesh.MeshDiagnostics>();
    const follower = yield* Stream.runForEach(running.values, (viewed) =>
      Effect.suspend(() => {
        if (drawn.current !== undefined) {
          if (drawn.current.view === viewed.view) {
            if (viewed.patches !== undefined && target.patch !== undefined) {
              target.patch(viewed.patches);
            } else {
              target.update(viewed.render.tree);
            }
          } else {
            target.draw(viewed.render.tree);
          }

          // The module keeps the render an `update` makes until it is released (a render that is never released is only released when it is garbage collected, which can be late): without this,
          // the WebAssembly memory of a long-lived mount grows by a copy per update (about 2.3 KB per update for a counter; 1,000 updates took it from 2.3 MB to 4.6 MB, and 2.3 MB flat with the release).
          // The previous render is no longer the one drawn, and one made by `update` still dispatches after its release (it keeps its own inputs), so an event already reported on it is unaffected.
          const previous = drawn.current;

          drawn.current = viewed;
          options?.record?.presented({ view: viewed.view, snapshot: viewed.snapshot ?? {}, render: viewed.render });
          previous.render.release();

          // A rise in the application's count takes the person to the first field in error: after the render that shows it is applied, as a call on the target.
          if (viewed.attention !== undefined && attention !== undefined && viewed.attention > attention) {
            const found = firstInvalid(viewed.render.tree.root);

            if (found !== undefined) {
              target.focus?.(found);
            }
          }

          attention = viewed.attention ?? attention;

          return Effect.void;
        }

        // Draw or hydrate, and retain the render, in one synchronous step: no event can be reported in between.
        const result = first(target, viewed.render.tree);
        drawn.current = viewed;
        options?.record?.presented({ view: viewed.view, snapshot: viewed.snapshot ?? {}, render: viewed.render });
        attention = viewed.attention;

        return Deferred.succeed(firstDone, result);
      }),
    ).pipe(
      // Ending before the first render (a diagnostic, a failure of the target, an application that ended) is mount's failure.
      Effect.onExit((exit) =>
        Exit.match(exit, {
          onFailure: (cause) => Deferred.failCause(firstDone, cause),
          onSuccess: () => Deferred.die(firstDone, new ValanceError("application-ended", "the application ended before its first render")),
        }),
      ),
      Effect.forkIn(scope),
    );
    // The first render, or the follower's end. The follower's own `onExit` above completes `firstDone` when the follower ran; a follower that never got to run (its Scope
    // was already closed, or closed before it started) is interrupted without running anything, so its exit is the only signal left: `mount` ends with that interruption.
    const result = yield* Effect.raceFirst(
      Deferred.await(firstDone),
      Effect.flatMap(Fiber.await(follower), (exit) =>
        Exit.match(exit, {
          onFailure: (cause) => Effect.failCause(cause),
          onSuccess: () => Effect.die(new ValanceError("application-ended", "the application ended before its first render")),
        }),
      ),
    );

    // Scope finalizers run in reverse: this runs before the application ends.
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Fiber.interrupt(follower);
        // A command an event started is the APPLICATION's once admitted (C20): closing the mount ends the follower and the target, not the command.
        // The mount only lets go of the dispatch fibers it held; the application's registry still owns, drains and interrupts them (Stage 39).
        // That release is the mount's own bookkeeping and happens whether or not the target's `unmount` throws: a target defect is the target's, and propagates
        // out of the Scope's close, but it must not leave a closed mount holding dispatches (C26: `settled` on a closed mount returns at once).
        yield* Effect.sync(() => {
          target.unmount();
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              pending.splice(0);
            }),
          ),
        );
      }),
    );

    // Dispatches may start more dispatches' worth of work only through the target, so draining until empty terminates.
    const settled: Effect.Effect<void> = Effect.suspend(() =>
      pending.length === 0 ? Effect.void : Effect.forEach(pending.splice(0), Fiber.await, { discard: true }).pipe(Effect.andThen(settled)),
    );

    return {
      first: result,
      dispatched,
      get dispatchedDropped() {
        return dropped;
      },
      settled,
      followed: Fiber.await(follower),
    };
  });

/**
 * Draws the application's current render on a target, and keeps it current. Ends with the caller's Scope: the mount's lifetime is that Scope's,
 * whatever Scope it is. If the application ends first (its own Scope closed), the follower ends (`Mounted.followed` Success) but the target stays
 * drawn, inert, until this Scope closes.
 */
export const mount = <S, E>(
  application: ApplicationHandle<S, E>,
  create: TargetFactory<Target>,
  options?: MountOptions,
): Effect.Effect<Mounted<E>, Nexus.Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.map(
    connect(
      application,
      create,
      (target, tree) => {
        target.draw(tree);
      },
      options,
    ),
    (connected) => without(connected, "first"),
  );

/**
 * Takes over server output with the client's own render (never the server's), then keeps it current.
 * What adoption or mismatch means is PORT's: `hydration` is its result, unchanged.
 */
export const hydrate = <S, E, H>(
  application: ApplicationHandle<S, E>,
  create: TargetFactory<HydratableTarget<H>>,
  options?: MountOptions,
): Effect.Effect<Mounted<E> & { readonly hydration: H }, Nexus.Mesh.MeshDiagnostics, Scope.Scope> =>
  Effect.map(
    connect(application, create, (target, tree) => target.hydrate(tree), options),
    (connected) => Object.defineProperties({ hydration: connected.first }, Object.getOwnPropertyDescriptors(without(connected, "first"))) as Mounted<E> & { readonly hydration: H },
  );

export { redactedFields } from "./web-redacted.js";
