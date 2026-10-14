// What an application keeps between runs. NEXUS and VALANCE hold no storage (their rule): what an application needs from where it runs is a *capability*, a typed contract the application states
// and the platform supplies. This is that contract for a small keyed store, and the web's implementation of it (the page's `localStorage`). The desktop's, a file in the user's data directory,
// is `./store-file` (it needs Node, so the page never loads it).
//
//   const saved = yield* Store.get("items", Items);        // Effect<readonly Item[] | undefined, StoreError, the Store capability>
//   yield* Store.set("items", Items, next);
//
// A value goes in as JSON and comes out *decoded by the Schema the caller states*: what is stored by an older version of the application, or by anything else, and no longer fits, is not a
// value: it is `Decode`, and nothing wrong reaches state. A failure says what kind it was and never what it carried.
import * as Nexus from "@valancex/nexus";
import { Effect, Schema } from "effect";

/** Why a store did not do what was asked, by kind. */
export class StoreError extends Error {
  readonly _tag = "StoreError";

  constructor(
    readonly kind: "Unavailable" | "Full" | "Decode" | "Unsafe",
    message: string,
  ) {
    super(message);
    this.name = "StoreError";
  }
}

export interface StoreClient {
  /** The value stored under `key`, decoded by `schema`; `undefined` when nothing is stored. */
  readonly get: <A>(key: string, schema: Schema.Schema<A, any, never>) => Effect.Effect<A | undefined, StoreError>;
  /** Stores `value` under `key`, encoded by `schema`. */
  readonly set: <A>(key: string, schema: Schema.Schema<A, any, never>, value: A) => Effect.Effect<void, StoreError>;
  /** Forgets `key`. */
  readonly remove: (key: string) => Effect.Effect<void, StoreError>;
}

/** The capability: ask for it in a command (`Store.get`), and the platform says whether it has one. */
export const Store = Nexus.Capability.define<StoreClient>("valance/store");

type Needs = Nexus.Capability.EnvironmentShape;
type Failure = StoreError | Nexus.Capability.CapabilityUnavailableError;

const client = Nexus.Capability.require(Store) as Effect.Effect<StoreClient, Nexus.Capability.CapabilityUnavailableError, Needs>;

export const get = <A>(key: string, schema: Schema.Schema<A, any, never>): Effect.Effect<A | undefined, Failure, Needs> =>
  Effect.flatMap(client, (store) => store.get(key, schema));
export const set = <A>(key: string, schema: Schema.Schema<A, any, never>, value: A): Effect.Effect<void, Failure, Needs> =>
  Effect.flatMap(client, (store) => store.set(key, schema, value));
export const remove = (key: string): Effect.Effect<void, Failure, Needs> => Effect.flatMap(client, (store) => store.remove(key));

/** A key is a word: letters, digits, `.`, `_` and `-`, so it can never name anything but the entry it is. */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export const checkKey = (key: string): Effect.Effect<string, StoreError> =>
  SAFE_KEY.test(key) ? Effect.succeed(key) : Effect.fail(new StoreError("Unsafe", `"${key}" cannot be a store key: use letters, digits, . _ - (at most 80 characters)`));

/** Decodes stored text with `schema`: text that is not JSON, or does not fit, is `Decode`. */
export const decodeStored = <A>(text: string, schema: Schema.Schema<A, any, never>): Effect.Effect<A, StoreError> =>
  Effect.try({ try: () => JSON.parse(text) as unknown, catch: () => new StoreError("Decode", "what is stored is not JSON") }).pipe(
    Effect.flatMap((json) => Schema.decodeUnknown(schema)(json).pipe(Effect.mapError(() => new StoreError("Decode", "what is stored no longer fits its type")))),
  );

export const encodeStored = <A>(value: A, schema: Schema.Schema<A, any, never>): Effect.Effect<string, StoreError> =>
  Schema.encode(schema)(value).pipe(
    Effect.mapError(() => new StoreError("Decode", "the value does not fit its type")),
    Effect.map((encoded) => JSON.stringify(encoded)),
  );

// ---- the web's -------------------------------------------------------------------------------------------------------------------------------------

/** The part of `Storage` the web's store uses (so a test supplies its own). */
export interface TextStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
}

/** The longest value written, in characters: a page's storage is small and shared. */
export const MAX_STORED = 1_000_000;

/** The web's store: the page's `localStorage`, under `valance:<namespace>:<key>`. Where storage is off (a private window, blocked site data) every call is `Unavailable`, and the application runs without it. */
export const webStore = (namespace: string, storage?: TextStorage): StoreClient => {
  const prefix = `valance:${namespace}:`;
  const area = (): Effect.Effect<TextStorage, StoreError> =>
    Effect.try({
      try: () => {
        const found = storage ?? (globalThis as { readonly localStorage?: TextStorage }).localStorage;

        if (found === undefined) {
          throw new Error("no storage");
        }

        return found;
      },
      catch: () => new StoreError("Unavailable", "this page has no storage"),
    });
  const guarded = <A>(run: (area: TextStorage) => A): Effect.Effect<A, StoreError> =>
    Effect.flatMap(area(), (found) =>
      Effect.try({
        try: () => run(found),
        catch: (error) => new StoreError(error instanceof Error && error.name === "QuotaExceededError" ? "Full" : "Unavailable", "the page's storage refused"),
      }),
    );

  return {
    get: (key, schema) =>
      Effect.flatMap(checkKey(key), (safe) =>
        Effect.flatMap(
          guarded((found) => found.getItem(`${prefix}${safe}`)),
          (text) => (text === null ? Effect.succeed(undefined) : decodeStored(text, schema)),
        ),
      ),
    set: (key, schema, value) =>
      Effect.flatMap(checkKey(key), (safe) =>
        Effect.flatMap(encodeStored(value, schema), (text) =>
          text.length > MAX_STORED ? Effect.fail(new StoreError("Full", "the value is larger than a store holds")) : guarded((found) => found.setItem(`${prefix}${safe}`, text)),
        ),
      ),
    remove: (key) => Effect.flatMap(checkKey(key), (safe) => guarded((found) => found.removeItem(`${prefix}${safe}`))),
  };
};

/** The platform that supplies `store` as the `Store` capability. */
export const storePlatform = (store: StoreClient): Nexus.Application.Platform =>
  Nexus.Capability.EnvironmentLive(new Map([[Store.id, { _tag: "Available" as const, implementation: store }]]));
