// The application the framework assembles from the three things an author supplies: the content (built from `content/`), the program (built from the templates), and optionally
// `defineApp`'s state and commands. This is one Valance application (`Valance.define`): the page is its state, going to a page is its `go` command, and the layout is its one view.
// The server renders it and the browser runs it, from the same function.
import * as Valance from "@valancex/valance";
import { waitingRun } from "@valancex/valance/internal";
import { History, permit } from "@valancex/router";
import * as Nexus from "@valancex/nexus";
import { Effect, Schema, Stream } from "effect";

import type { DefinedApp, PageState, TitleParts } from "./index.js";
import type { Content } from "./model.js";
import { documentTitle, frame, FrameScope, pageAt, RESERVED } from "./scope.js";
import { addressOf, tidy } from "./routes.js";
import { conflicts, RouteDeclarationError, routingFor, screenName } from "./routing-engine.js";
import type { Routing } from "./routing-engine.js";
import { derivedOf } from "./index.js";
import { Navigation } from "./navigation.js";
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

/** Which child is shown at each level of nested routes (`at.l0`, `at.l1`, …): one field per level, so a condition at a level reads only its own (ROUTES.md R-44). */
const AtSchema = (levels: number) => Schema.Struct(Object.fromEntries(Array.from({ length: levels }, (_, level) => [`l${level}`, Schema.String])));

const PageSchema = Schema.Struct({
  page: Schema.String,
  route: Schema.String,
  trail: Schema.Array(Schema.String),
  cursor: Schema.Number,
  viewport: Schema.Literal("compact", "medium", "expanded"),
  colorScheme: Schema.Literal("light", "dark"),
});

/** A mistake in `src/main.ts`, reported with what to change. */
export class AppDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppDefinitionError";
  }
}

const authorFields = (author: DefinedApp | undefined): ReadonlyArray<string> => [...Object.keys(stateOf(author)?.schema.fields ?? {}), ...Object.keys(derivedOf(author))];

/** What the author keeps between runs: state fields, and `"navigation"` (the list of pages visited, where the engine keeps it). */
const persisted = (author: DefinedApp | undefined): ReadonlyArray<string> => (author?.persist as ReadonlyArray<string> | undefined) ?? [];

/** The state fields among them. */
const persistedFields = (author: DefinedApp | undefined): ReadonlyArray<string> => persisted(author).filter((name) => name !== "navigation");

/** The key the persisted fields are stored under. */
const STORE_KEY = "state";

/** The derived values for a state, by name. */
const derivedValues = (author: DefinedApp | undefined, state: AppState): Readonly<Record<string, unknown>> =>
  Object.fromEntries(Object.entries(derivedOf(author)).map(([name, each]) => [name, each.from(state)]));

/** Checks the author's definition against the names the framework owns. */
export const checkDefinition = (author: DefinedApp | undefined): void => {
  try {
    const routing = routingFor(author);
    const whole = [author, ...Object.values(author?.targets ?? {})];
    const registered = new Set(whole.flatMap((parts) => [...(parts?.components ?? []), ...(parts?.override ?? [])]).map((each) => each.template.mprx));

    for (const { route, component } of [...routing.screens, ...routing.indexes]) {
      if (!registered.has(component.template.mprx)) {
        throw new RouteDeclarationError(
          `src/main.ts: the route "${route}" shows <${screenName(component)}>, which is not listed in \`components\`: list it there so its template is part of the application`,
        );
      }
    }
  } catch (error) {
    throw error instanceof RouteDeclarationError ? new AppDefinitionError(error.message) : error;
  }

  for (const name of authorFields(author)) {
    if (RESERVED.includes(name)) {
      throw new AppDefinitionError(`src/main.ts: the state field "${name}" is a name the layout already reads from the framework (${RESERVED.join(", ")}); choose another`);
    }
    if (name === "at" && routingFor(author).levels > 0) {
      throw new AppDefinitionError(`src/main.ts: the state field "at" is the framework's when routes have children (which child is shown at each level); choose another`);
    }
    if (name === "page" || name === "route" || name === "trail" || name === "cursor") {
      throw new AppDefinitionError(`src/main.ts: the state field "${name}" is the framework's (which page is shown, and the pages visited); choose another`);
    }
  }

  const fields = Object.keys(stateOf(author)?.schema.fields ?? {});

  for (const name of persistedFields(author)) {
    if (!fields.includes(name)) {
      throw new AppDefinitionError(
        `src/main.ts: \`persist\` names "${name}", which is not a state field${fields.length === 0 ? " (the state has none)" : ` (the fields: ${fields.join(", ")}; "navigation" keeps the pages visited)`}`,
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
    ["back", "goes to the page before this one in the trail"],
    ["forward", "goes to the page after this one in the trail"],
    ["resize", "tells the layout how much room the page has"],
    ["colorScheme", "tells the layout which colors the system asks for"],
    ["persist", "keeps the fields named in `persist` between runs"],
    ["routeStart", "starts the loads of the route the application opens on"],
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
  const levels = routingFor(author).levels;
  const frame_ = levels === 0 ? FrameScope : Schema.extend(FrameScope, Schema.Struct({ at: AtSchema(levels) }));
  const base = state === undefined ? frame_ : (Schema.extend(frame_, state.schema) as unknown as Schema.Schema<any, any, never>);

  // A derived value is a name the layout reads, with the type it was given.
  return derived.length === 0
    ? base
    : (Schema.extend(base, Schema.Struct(Object.fromEntries(derived.map(([name, each]) => [name, each.schema])))) as unknown as Schema.Schema<any, any, never>);
};

export const stateSchema = (author: DefinedApp | undefined): Schema.Schema<any, any, never> => {
  const state = stateOf(author);
  const levels = routingFor(author).levels;
  const page = levels === 0 ? PageSchema : Schema.extend(PageSchema, Schema.Struct({ at: AtSchema(levels) }));

  return state === undefined ? (page as never) : (Schema.extend(page, state.schema) as unknown as Schema.Schema<any, any, never>);
};

/**
 * The loads of the routes (ROUTES.md R-50 to R-55): `run(address)` starts those of the route that `address` is, together, each as a waiting run that commits only while the application is still
 * at that address and that a newer entry of the same route supersedes. Made once per started application, since the supersession is counted here.
 */
const routeLoading = (routing: Routing, state: Parameters<typeof Valance.command>[0]) => {
  const serials = new Map<string, { latest: number }>();
  // A render on the server starts the application too, and must start no work (R-51). A host that runs one supplies the platform's store (the browser, the shell, a window); a render supplies nothing.
  const running = (Nexus.Capability.require(StoreOps.Store) as Effect.Effect<unknown, Nexus.Capability.CapabilityUnavailableError, Nexus.Capability.EnvironmentShape>).pipe(
    Effect.as(true),
    Effect.catchAll(() => Effect.succeed(false)),
  );
  const handle = state as unknown as Parameters<typeof waitingRun<AppState, any, any>>[0];

  const run = (address: string): Effect.Effect<void> =>
    Effect.forEach(
      routing.loads(address),
      ({ route, input, load }) => {
        const serial = serials.get(route) ?? { latest: 0 };

        serials.set(route, serial);

        return waitingRun<AppState, Record<string, unknown>, unknown, never>(
          handle,
          {
            work: (given, signal) => load.work(given as never, signal) as never,
            wanted: (_given, current) => current.page === address,
            settle: (outcome, given, current) => load.settle(outcome, given as never, current),
          },
          serial,
        )(input);
      },
      { concurrency: "unbounded", discard: true },
    );

  return {
    run,
    /** The loads of the page shown now: what an application does as it starts. */
    current: Effect.flatMap(running, (yes) =>
      yes ? Effect.flatMap((state as unknown as { readonly get: Effect.Effect<AppState> }).get, (current) => run(current.page)) : Effect.void,
    ),
  };
};

/**
 * The command the application starts with when the author names fields in `persist`: load them from the platform's store, then save them whenever they change. A platform with no store
 * ends it at once (the application runs without persistence); stored data that no longer fits is ignored, and the next change replaces it. It never ends otherwise: it belongs to the
 * application and ends with it.
 */
const keepBetweenRuns = (
  author: DefinedApp | undefined,
  state: Parameters<typeof Valance.command>[0],
  command: Valance.CommandMaker<AppState>,
  known: (page: string) => boolean,
  routing: Routing,
  starting: Effect.Effect<void, never, Nexus.Capability.EnvironmentShape>,
) => {
  const names = persistedFields(author);
  const navigation = persisted(author).includes("navigation");
  const fields = stateOf(author)?.schema.fields ?? {};
  const schema = Schema.Struct({
    ...Object.fromEntries(names.map((name) => [name, fields[name]!])),
    ...(navigation ? { navigation: Schema.Unknown } : {}),
  }) as unknown as Schema.Schema<Record<string, unknown>, any, never>;
  const update = (f: (current: any) => Effect.Effect<any>) => (state as unknown as { readonly update: (f: (current: any) => Effect.Effect<any>) => Effect.Effect<any> }).update(f);
  const pick = (current: Record<string, unknown>, keepList: boolean): Record<string, unknown> => ({
    ...Object.fromEntries(names.map((name) => [name, current[name]])),
    ...(keepList ? { navigation: { entries: current["trail"], index: current["cursor"] } } : {}),
  });

  return command.effect(() =>
    Effect.gen(function* () {
      // does this platform leave the list to the engine? (a page's is the browser's, and the address is the truth there)
      const engineKeepsList = navigation
        ? yield* (Nexus.Capability.require(Navigation) as Effect.Effect<unknown, Nexus.Capability.CapabilityUnavailableError, Nexus.Capability.EnvironmentShape>).pipe(
            Effect.as(true),
            Effect.catchAll(() => Effect.succeed(false)),
          )
        : false;

      // what a previous run kept, if the platform has a store and what is kept still fits
      const stored = yield* StoreOps.get(STORE_KEY, schema).pipe(
        Effect.map((value) => ({ store: true as const, value })),
        Effect.catchTag("CapabilityUnavailableError", () => Effect.succeed({ store: false as const, value: undefined })),
        Effect.catchAll(() => Effect.succeed({ store: true as const, value: undefined })),
      );

      if (!stored.store) {
        return yield* starting; // no store: nothing to restore, and the page shown loads what it needs
      }
      if (stored.value !== undefined) {
        const { navigation: list, ...kept } = stored.value;

        yield* update((current) => {
          const next = { ...current, ...kept };

          if (!engineKeepsList) {
            return Effect.succeed(next);
          }

          // the pages visited: those that are still pages of the site, and the first page when none is
          const restored = History.restore(list, (entry): entry is string => typeof entry === "string" && known(entry), "/");

          return Effect.succeed(routing.arrive({ ...next, trail: restored.entries, cursor: restored.index, page: History.current(restored) }) as AppState);
        });
      }

      let last = JSON.stringify(pick((yield* state.get) as Record<string, unknown>, engineKeepsList));

      // the page shown (restored, perhaps) loads what it needs while the changes are kept
      yield* Effect.all(
        [
          starting,
          Stream.runForEach(state.values, (current) => {
            const picked = pick(current as Record<string, unknown>, engineKeepsList);
            const text = JSON.stringify(picked);

            if (text === last) {
              return Effect.void;
            }

            last = text;

            return StoreOps.set(STORE_KEY, schema, picked).pipe(Effect.ignore);
          }),
        ],
        { concurrency: 2, discard: true },
      );
    }),
  );
};

const listOf = (current: AppState): History.History<string> => ({ entries: current.trail, index: current.cursor });
const withList = (current: AppState, list: History.History<string>): AppState => ({ ...current, trail: [...list.entries], cursor: list.index, page: History.current(list) });
const routeOf = (page: string) => ({ name: page, params: {}, query: {} });

/**
 * `go`, `back` and `forward`: moves along the list of pages (`History`, from the router), each first asking the author's `guard` if there is one. Going to a page puts it after the one shown
 * and drops the pages that were ahead; Back and Forward move along the list, for a target with no browser history of its own. Without a guard they are plain transitions.
 */
const navigationCommands = (
  author: DefinedApp | undefined,
  state: Parameters<typeof Valance.command>[0],
  command: Valance.CommandMaker<AppState>,
  loading: ReturnType<typeof routeLoading>,
) => {
  const guard = author?.guard;
  const routing = routingFor(author);
  /** The address `go` is given, as the application knows it: a declared route's canonical address, else the content page's tidied path. */
  const addressOf = (raw: string): string => {
    const cut = raw.indexOf("?");
    const path = tidy(cut < 0 ? raw : raw.slice(0, cut));

    return (routing.any ? routing.match(`${path}${cut < 0 ? "" : raw.slice(cut)}`)?.address : undefined) ?? tidy(raw);
  };
  const go = (current: AppState, address: string): AppState => {
    const id = addressOf(address);

    return id === current.page ? current : (routing.arrive(withList(current, History.push(listOf(current), id))) as AppState);
  };
  const traverse = (current: AppState, distance: number): AppState => routing.arrive(withList(current, History.go(listOf(current), distance))) as AppState;
  const handle = state as unknown as { readonly get: Effect.Effect<AppState>; readonly update: (f: (current: AppState) => Effect.Effect<AppState>) => Effect.Effect<unknown> };
  /** Asks the guard about a move to `to`; the page to go to instead when it redirects, `undefined` when it stops the move. */
  const askedGuard = (current: AppState, to: string, kind: "programmatic" | "history"): Effect.Effect<string | undefined> =>
    guard === undefined || to === current.page
      ? Effect.succeed(to)
      : permit(guard as never, { from: routeOf(current.page), to: routeOf(to), state: current, kind, data: {} } as never).pipe(
          Effect.map((answer) => (answer === true ? to : answer === false ? undefined : (answer as { readonly name: string }).name)),
        );
  /** The application-wide guard first (R-18), then the routes' (R-61): the address to go to, or `undefined` when something refuses. */
  const asked = (current: AppState, to: string, kind: "programmatic" | "history"): Effect.Effect<string | undefined> =>
    Effect.flatMap(askedGuard(current, to, kind), (allowed) =>
      allowed === undefined || !routing.hasGuards || allowed === current.page ? Effect.succeed(allowed) : routing.decide(current.page, allowed, current, kind),
    );
  const guarded = (target: (current: AppState) => string | undefined, kind: "programmatic" | "history", apply: (current: AppState, to: string) => AppState) =>
    Effect.gen(function* () {
      const current = yield* handle.get;
      const to = target(current);
      const allowed = to === undefined ? undefined : yield* asked(current, to, kind);

      if (allowed !== undefined) {
        // a redirect is a page to go to, not a place in the list: it is added after the page shown
        yield* handle.update((latest) => Effect.succeed(allowed === to ? apply(latest, allowed) : go(latest, allowed)));

        // an entry loads what the route needs (R-52); a move to where the application already was is not an entry (R-55)
        const now = yield* handle.get;

        if (now.page !== current.page) {
          yield* loading.run(now.page);
        }
      }
    });

  if (guard === undefined && !routing.hasGuards && !routing.hasLoad) {
    return {
      go: command(Schema.Struct({ id: Schema.String }), ({ id }, current) => go(current, id)),
      back: command((current) => traverse(current, -1)),
      forward: command((current) => traverse(current, 1)),
    };
  }

  return {
    go: command.effect(Schema.Struct({ id: Schema.String }), ({ id }) =>
      guarded(
        () => addressOf(id),
        "programmatic",
        (latest, to) => go(latest, to),
      ),
    ),
    back: command.effect(() =>
      guarded(
        (current) => (History.canGo(listOf(current), -1) ? current.trail[current.cursor - 1] : undefined),
        "history",
        (latest) => traverse(latest, -1),
      ),
    ),
    forward: command.effect(() =>
      guarded(
        (current) => (History.canGo(listOf(current), 1) ? current.trail[current.cursor + 1] : undefined),
        "history",
        (latest) => traverse(latest, 1),
      ),
    ),
  };
};

/** The command table: the framework's `go`, then the author's. */
export const commandTable =
  (author: DefinedApp | undefined, known: (page: string) => boolean = () => true) =>
  (state: Parameters<typeof Valance.command>[0]): Valance.CommandTable<any, Valance.Ambient> => {
    const command = Valance.command(state as never) as Valance.CommandMaker<AppState>;
    const own = author?.commands?.(command as never) ?? {};
    const loading = routeLoading(routingFor(author), state);

    for (const name of ["go", "back", "forward", "resize", "colorScheme", "persist", "routeStart"]) {
      if (name in own) {
        throw new AppDefinitionError(`src/main.ts: "${name}" is the framework's command; choose another name`);
      }
    }

    return {
      ...(persisted(author).length === 0 ? {} : { persist: keepBetweenRuns(author, state, command, known, routingFor(author), loading.current) }),
      ...(persisted(author).length === 0 && routingFor(author).hasLoad ? { routeStart: command.effect(() => loading.current) } : {}),
      ...navigationCommands(author, state, command, loading),
      // The window changed size: the browser tells the application, which tells the layout (`viewport`).
      resize: command(Schema.Struct({ viewport: Schema.Literal("compact", "medium", "expanded") }), ({ viewport }, current) => ({ ...current, viewport })),
      // The person's system changed colors: the page or the window tells the application, which tells the layout (`colorScheme`).
      colorScheme: command(Schema.Struct({ scheme: Schema.Literal("light", "dark") }), ({ scheme }, current) => ({ ...current, colorScheme: scheme })),
      ...own,
    };
  };

export const initialState = (author: DefinedApp | undefined): AppState => ({
  page: "/",
  route: "",
  trail: ["/"],
  cursor: 0,
  viewport: "expanded",
  colorScheme: "light",
  ...stateOf(author)?.initial,
});

export const application = (content: Content, program: Valance.Program, author?: DefinedApp) => {
  checkDefinition(author);

  const routing = routingFor(author);

  for (const message of conflicts(
    routing,
    content.pages.map((each) => each.path),
  )) {
    throw new AppDefinitionError(`src/main.ts: ${message}`);
  }

  return Valance.define({
    name: content.site.name,
    state: { schema: stateSchema(author) as Schema.Schema<AppState>, initial: routing.arrive(initialState(author)) as AppState },
    views: {
      layout: {
        program,
        scope: (state: AppState) => {
          const { page, route, at, ...own } = state as AppState & { readonly at?: unknown };
          const declared = route === "" ? undefined : { name: route, title: routing.titleOf(page) ?? "" };

          return {
            ...frame(content, page, state.viewport, state.colorScheme, { canGoBack: state.cursor > 0, canGoForward: state.cursor < state.trail.length - 1 }, declared),
            ...(at === undefined ? {} : { at }),
            ...own,
            ...derivedValues(author, state),
          };
        },
      },
    },
    view: () => "layout" as const,
    commands: commandTable(author, (page) => pageAt(content, page) !== undefined || routing.match(page) !== undefined) as never,
    ...(persisted(author).length > 0 ? { start: "persist" } : routing.hasLoad ? { start: "routeStart" } : {}),
  });
};

/** The state a request for `pathname` starts from. */
export const stateFor = (content: Content, pathname: string, author?: DefinedApp, search = ""): AppState => {
  const routing = routingFor(author);
  const page = addressOf(content, routing, { pathname, search });

  return routing.arrive({ ...initialState(author), page, trail: [page], cursor: 0 }) as AppState;
};

/**
 * The title for a state: the page's and the site's name, or what the author's `title` function says. A function that throws falls back to the default (a title is never worth a failed render),
 * and the failure is reported by its name only.
 */
export const titleFor = (content: Content, page: ReturnType<typeof pageAt>, state: AppState, author: DefinedApp | undefined): string => {
  let parts: TitleParts = {};
  const routed = page === undefined ? routingFor(author).titleOf(state.page) : undefined;

  if (routed !== undefined) {
    parts = { page: routed };
  }

  try {
    const made = author?.title?.(state as never, { path: state.page, title: page?.title ?? routed ?? "" });

    parts = made === undefined ? parts : typeof made === "string" ? { ...parts, page: made } : { ...parts, ...made };
  } catch (error) {
    console.error(`the title function in src/main.ts failed (${error instanceof Error ? error.name : "error"}); the default title is used`);
  }

  return documentTitle(content, page, parts);
};
