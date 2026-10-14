// The application the framework assembles from the three things an author supplies: the content (built from `content/`), the program (built from the templates), and optionally
// `defineApp`'s state and commands. This is one Valance application (`Valance.define`): the page is its state, going to a page is its `go` command, and the layout is its one view.
// The server renders it and the browser runs it, from the same function.
import * as Valance from "@valancex/valance";
import { Effect, Schema, Stream } from "effect";

import type { DefinedApp, PageState, TitleParts } from "./index.js";
import type { Content } from "./model.js";
import { documentTitle, frame, FrameScope, pageAt, RESERVED } from "./scope.js";
import { normalize } from "./routes.js";
import { derivedOf } from "./index.js";
import * as StoreOps from "./store.js";
import { badDefaults, stateOf } from "./state.js";

export type AppState = PageState & Record<string, unknown>;

/** What the browser needs to know about the built page to keep the document's head in step. */
export interface Built {
  /** The address of the page script. */
  readonly script: string;
  /** Stylesheet addresses, in order. Empty in development, where the script brings its styles. */
  readonly styles: ReadonlyArray<string>;
}

const PageSchema = Schema.Struct({ page: Schema.String, viewport: Schema.Literal("compact", "medium", "expanded"), colorScheme: Schema.Literal("light", "dark") });

/** A mistake in `src/main.ts`, reported with what to change. */
export class AppDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppDefinitionError";
  }
}

const authorFields = (author: DefinedApp | undefined): ReadonlyArray<string> => [...Object.keys(stateOf(author)?.schema.fields ?? {}), ...Object.keys(derivedOf(author))];

/** The state fields the author keeps between runs. */
const persisted = (author: DefinedApp | undefined): ReadonlyArray<string> => (author?.persist as ReadonlyArray<string> | undefined) ?? [];

/** The key the persisted fields are stored under. */
const STORE_KEY = "state";

/** The derived values for a state, by name. */
const derivedValues = (author: DefinedApp | undefined, state: AppState): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(derivedOf(author)).map(([name, each]) => [name, each.from(state)]));

/** Checks the author's definition against the names the framework owns. */
export const checkDefinition = (author: DefinedApp | undefined): void => {
  for (const name of authorFields(author)) {
    if (RESERVED.includes(name)) {
      throw new AppDefinitionError(`src/main.ts: the state field "${name}" is a name the layout already reads from the framework (${RESERVED.join(", ")}); choose another`);
    }
    if (name === "page") {
      throw new AppDefinitionError('src/main.ts: the state field "page" is the framework\'s (which page is shown); choose another');
    }
  }

  const fields = Object.keys(stateOf(author)?.schema.fields ?? {});

  for (const name of persisted(author)) {
    if (!fields.includes(name)) {
      throw new AppDefinitionError(
        `src/main.ts: \`persist\` names "${name}", which is not a state field${fields.length === 0 ? " (the state has none)" : ` (the fields: ${fields.join(", ")})`}`,
      );
    }
  }

  for (const name of Object.keys(derivedOf(author))) {
    if (fields.includes(name)) {
      throw new AppDefinitionError(`src/main.ts: "${name}" is both a state field and a derived value; a name is one or the other`);
    }
  }

  for (const name of badDefaults(author)) {
    throw new AppDefinitionError(`src/main.ts: the default of the state field "${name}" is not a value of its type`);
  }

  // Building the table reads no state (a command reads it when it runs), so it can be built here, with nothing, to see its names.
  const own = author?.commands?.(Valance.command({} as never) as never) ?? {};

  for (const [name, what] of [
    ["go", "shows a page"],
    ["resize", "tells the layout how much room the page has"],
    ["colorScheme", "tells the layout which colors the system asks for"],
    ["persist", "keeps the fields named in `persist` between runs"],
  ] as const) {
    if (name in own) {
      throw new AppDefinitionError(`src/main.ts: "${name}" is the framework's command (it ${what}); choose another name`);
    }
  }
};

/** The names `src/main.ts` adds: state fields (readable in the layout) and commands (runnable from it). */
export const ownNames = (author: DefinedApp | undefined): { readonly state: ReadonlyArray<string>; readonly commands: ReadonlyArray<string> } => ({
  state: authorFields(author),
  commands: Object.keys(author?.commands?.(Valance.command({} as never) as never) ?? {}),
});

/** The scope schema a layout is compiled against: the framework's names and the author's state fields. */
export const scopeSchema = (author: DefinedApp | undefined): Schema.Schema<any, any, never> => {
  const state = stateOf(author);
  const derived = Object.entries(derivedOf(author));
  const base = state === undefined ? FrameScope : (Schema.extend(FrameScope, state.schema) as unknown as Schema.Schema<any, any, never>);

  // A derived value is a name the layout reads, with the type it was given.
  return derived.length === 0
    ? base
    : (Schema.extend(base, Schema.Struct(Object.fromEntries(derived.map(([name, each]) => [name, each.schema])))) as unknown as Schema.Schema<any, any, never>);
};

export const stateSchema = (author: DefinedApp | undefined): Schema.Schema<any, any, never> => {
  const state = stateOf(author);

  return state === undefined ? PageSchema : (Schema.extend(PageSchema, state.schema) as unknown as Schema.Schema<any, any, never>);
};

/**
 * The command the application starts with when the author names fields in `persist`: load them from the platform's store, then save them whenever they change. A platform with no store
 * ends it at once (the application runs without persistence); stored data that no longer fits is ignored, and the next change replaces it. It never ends otherwise: it belongs to the
 * application and ends with it.
 */
const keepBetweenRuns = (author: DefinedApp | undefined, state: Parameters<typeof Valance.command>[0], command: Valance.CommandMaker<AppState>) => {
  const names = persisted(author);
  const fields = stateOf(author)?.schema.fields ?? {};
  const schema = Schema.Struct(Object.fromEntries(names.map((name) => [name, fields[name]!]))) as unknown as Schema.Schema<Record<string, unknown>, any, never>;
  const pick = (current: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(names.map((name) => [name, current[name]]));

  return command.effect(() =>
    Effect.gen(function* () {
      // what a previous run kept, if the platform has a store and what is kept still fits
      const stored = yield* StoreOps.get(STORE_KEY, schema).pipe(
        Effect.map((value) => ({ store: true as const, value })),
        Effect.catchTag("CapabilityUnavailableError", () => Effect.succeed({ store: false as const, value: undefined })),
        Effect.catchAll(() => Effect.succeed({ store: true as const, value: undefined })),
      );

      if (!stored.store) {
        return;
      }
      if (stored.value !== undefined) {
        const kept = stored.value;

        yield* (state as unknown as { readonly update: (f: (current: any) => Effect.Effect<any>) => Effect.Effect<any> }).update((current) =>
          Effect.succeed({ ...current, ...kept }),
        );
      }

      let last = JSON.stringify(pick((yield* state.get) as Record<string, unknown>));

      yield* Stream.runForEach(state.values, (current) => {
        const picked = pick(current as Record<string, unknown>);
        const text = JSON.stringify(picked);

        if (text === last) {
          return Effect.void;
        }

        last = text;

        return StoreOps.set(STORE_KEY, schema, picked).pipe(Effect.ignore);
      });
    }),
  );
};

/** The command table: the framework's `go`, then the author's. */
export const commandTable =
  (author: DefinedApp | undefined) =>
  (state: Parameters<typeof Valance.command>[0]): Valance.CommandTable<any, Valance.Ambient> => {
    const command = Valance.command(state as never) as Valance.CommandMaker<AppState>;
    const own = author?.commands?.(command as never) ?? {};

    for (const name of ["go", "resize", "colorScheme", "persist"]) {
      if (name in own) {
        throw new AppDefinitionError(`src/main.ts: "${name}" is the framework's command; choose another name`);
      }
    }

    return {
      ...(persisted(author).length === 0 ? {} : { persist: keepBetweenRuns(author, state, command) }),
      go: command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id })),
      // The window changed size: the browser tells the application, which tells the layout (`viewport`).
      resize: command(Schema.Struct({ viewport: Schema.Literal("compact", "medium", "expanded") }), ({ viewport }, current) => ({ ...current, viewport })),
      // The person's system changed colors: the page or the window tells the application, which tells the layout (`colorScheme`).
      colorScheme: command(Schema.Struct({ scheme: Schema.Literal("light", "dark") }), ({ scheme }, current) => ({ ...current, colorScheme: scheme })),
      ...own,
    };
  };

export const initialState = (author: DefinedApp | undefined): AppState => ({ page: "/", viewport: "expanded", colorScheme: "light", ...stateOf(author)?.initial });

export const application = (content: Content, program: Valance.Program, author?: DefinedApp) => {
  checkDefinition(author);

  return Valance.define({
    name: content.site.name,
    state: { schema: stateSchema(author) as Schema.Schema<AppState>, initial: initialState(author) },
    views: {
      layout: {
        program,
        scope: (state: AppState) => {
          const { page, ...own } = state;

          return { ...frame(content, page, state.viewport, state.colorScheme), ...own, ...derivedValues(author, state) };
        },
      },
    },
    view: () => "layout" as const,
    commands: commandTable(author) as never,
    ...(persisted(author).length === 0 ? {} : { start: "persist" }),
  });
};

/** The state a request for `pathname` starts from. */
export const stateFor = (content: Content, pathname: string, author?: DefinedApp): AppState => ({ ...initialState(author), page: normalize(pathname, content.site.base) });

/**
 * The title for a state: the page's and the site's name, or what the author's `title` function says. A function that throws falls back to the default (a title is never worth a failed render),
 * and the failure is reported by its name only.
 */
export const titleFor = (content: Content, page: ReturnType<typeof pageAt>, state: AppState, author: DefinedApp | undefined): string => {
  let parts: TitleParts = {};

  try {
    const made = author?.title?.(state as never, { path: state.page, title: page?.title ?? "" });

    parts = made === undefined ? {} : typeof made === "string" ? { page: made } : made;
  } catch (error) {
    console.error(`the title function in src/main.ts failed (${error instanceof Error ? error.name : "error"}); the default title is used`);
  }

  return documentTitle(content, page, parts);
};
