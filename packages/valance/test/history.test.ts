// The Web.history contract, at unit level. A real NEXUS application, state and runtime; a fake window that records
// history writes and fires popstate; a hand-built `running` whose `invoke` the test controls. The Chromium suite in
// examples/tracer-web stays the acceptance check.
//
//   start          the first state's urlOf is the baseline: no write
//   later state    urlOf(state) ≠ the last synchronized urlOf → pushState, which becomes the baseline; otherwise nothing
//   popstate       invoke(navigate, stateOf(location)), then the resulting state's urlOf is the baseline; never a write
//   never          compare the browser URL with urlOf(state)
import type { Mesh } from "@valancex/nexus";
import type { Running } from "../src/internal.js";
import type { GuardResult } from "../src/web-plugin.js";

import * as Nexus from "@valancex/nexus";
import { Effect, Layer, Schema, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { handleOf } from "../src/internal.js";
import { history } from "../src/web.js";

const App = Schema.Struct({ path: Schema.String, n: Schema.Number });
type App = Schema.Schema.Type<typeof App>;

// The application's mapping: /app + path. `n` is not in the URL; a query is ignored by stateOf, so `?x=1` is noncanonical.
const urlOf = ({ path }: App): string => `/app${path}`;
const stateOf = (url: URL): { path: string } => ({ path: url.pathname.slice("/app".length) || "/" });

/** A window that records history writes, keeps its entries as a browser does (a push drops the forward ones, `go` moves along them), and fires popstate. */
const fakeWindow = (initial: string) => {
  let current = new URL(initial, "http://localhost");
  const writes: Array<string> = [];
  const entries: Array<{ url: string; data: unknown }> = [{ url: initial, data: null }];
  let at = 0;
  const listeners = new Set<() => void>();
  const fire = (): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };
  const win = {
    document: { title: "" },
    location: {
      get origin() {
        return current.origin;
      },
      get pathname() {
        return current.pathname;
      },
      get search() {
        return current.search;
      },
      get href() {
        return current.href;
      },
    },
    history: {
      get state() {
        return entries[at]!.data;
      },
      pushState: (data: unknown, _unused: string, url: string) => {
        writes.push(`push ${url}`);
        current = new URL(url, current);
        entries.splice(at + 1);
        entries.push({ url, data });
        at += 1;
      },
      replaceState: (data: unknown, _unused: string, url: string) => {
        writes.push(`replace ${url}`);
        current = new URL(url, current);
        entries[at] = { url, data };
      },
      go: (delta: number) => {
        writes.push(`go ${delta}`);
        at += delta;
        current = new URL(entries[at]!.url, current);
        fire();
      },
    },
    addEventListener: (type: string, listener: () => void) => {
      if (type === "popstate") {
        listeners.add(listener);
      }
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === "popstate") {
        listeners.delete(listener);
      }
    },
  };

  return {
    window: win as unknown as Window,
    title: () => win.document.title,
    writes,
    listeners,
    location: () => current.pathname + current.search,
    /** The URLs of the entries, oldest first, and which one is current. */
    stack: () => ({ urls: entries.map((entry) => entry.url), at }),
    /** The browser moved to `url` (Back, Forward), and tells the page. */
    pop: (url: string) => {
      current = new URL(url, current);
      fire();
    },
    /** The user pressed Back or Forward: the browser moves along its own entries. */
    traverse: (delta: number) => {
      at += delta;
      current = new URL(entries[at]!.url, current);
      fire();
    },
  };
};

type Navigate = (path: string, state: Nexus.State.StateHandle<App>) => Effect.Effect<unknown, Mesh.UnmappedCommand>;

/** The exact binding key of the application's navigate command, passed through to `invoke` verbatim. (A bare name is a different form: see the last test.) */
const NAVIGATE = "app/navigate";

/** The normal navigate command: the state takes the path. */
const navigates: Navigate = (path, state) => state.update((current) => Effect.succeed({ ...current, path }));

/** Runs `body` with Web.history started over a real application whose navigate command is `navigate`. */
const scenario = <A>(
  initial: {
    readonly browser: string;
    readonly state: App;
    readonly navigateOption?: string;
    readonly titleOf?: (state: App) => string;
    readonly modeOf?: (previous: App, next: App) => "push" | "replace";
    readonly guard?: (navigation: { readonly kind: "link" | "popstate"; readonly url: URL }, state: App) => GuardResult | Promise<GuardResult>;
  },
  navigate: Navigate,
  body: (context: {
    readonly browser: ReturnType<typeof fakeWindow>;
    readonly state: Nexus.State.StateHandle<App>;
    readonly invoked: Array<unknown>;
    readonly settle: Effect.Effect<void>;
  }) => Effect.Effect<A>,
): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const nexus = yield* Nexus.Application.start(Nexus.Application.define({ name: "history-unit", runtime: Layer.empty }));
        const state = yield* Nexus.Application.createState(nexus, App, initial.state);
        const browser = fakeWindow(initial.browser);
        const invoked: Array<unknown> = [];
        const running: Running<App, never> = {
          nexus,
          render: Effect.die("unused"),
          values: Stream.empty,
          dispatch: () => Effect.die("unused"),
          state: state.get,
          states: state.values,
          invoke: (key, args) => {
            const first = args[0];
            const value = first !== undefined && "value" in first ? first.value : undefined;
            invoked.push({ key, value });
            const path: unknown = typeof value === "object" && value !== null ? Reflect.get(value, "path") : undefined;

            return key === NAVIGATE && typeof path === "string" ? navigate(path, state) : Effect.fail<Mesh.UnmappedCommand>({ _tag: "UnmappedCommand", component: "", name: key });
          },
        };

        yield* history(handleOf(running), {
          window: browser.window,
          urlOf,
          stateOf,
          navigate: initial.navigateOption ?? NAVIGATE,
          ...(initial.titleOf === undefined ? {} : { titleOf: initial.titleOf }),
          ...(initial.modeOf === undefined ? {} : { modeOf: initial.modeOf }),
          ...(initial.guard === undefined ? {} : { guard: initial.guard }),
        });
        // The follower consumes in its own fiber; give it room to catch up before observing.
        const settle = Effect.sleep("30 millis");
        yield* settle;

        return yield* body({ browser, state, invoked, settle });
      }),
    ),
  );

const HOME: App = { path: "/home", n: 0 };
const go = (state: Nexus.State.StateHandle<App>, path: string) => state.update((current) => Effect.succeed({ ...current, path }));
const bump = (state: Nexus.State.StateHandle<App>) => state.update((current) => Effect.succeed({ ...current, n: current.n + 1 }));

describe("Web.history: the document's title follows the state like the URL", () => {
  const titleOf = ({ path }: App): string => `title of ${path}`;

  it("is set for the first state (no URL write), then follows every change", async () => {
    const result = await scenario({ browser: "/app/home", state: HOME, titleOf }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        const first = browser.title();

        yield* go(state, "/about");
        yield* settle;

        return { first, later: browser.title(), writes: browser.writes };
      }),
    );

    expect(result.first).toBe("title of /home");
    expect(result.later).toBe("title of /about");
    expect(result.writes).toEqual(["push /app/about"]);
  });

  it("follows a state a popstate produced (Back and Forward), without writing a URL", async () => {
    const result = await scenario({ browser: "/app/home", state: HOME, titleOf }, navigates, ({ browser, settle }) =>
      Effect.gen(function* () {
        browser.pop("/app/about");
        yield* settle;

        return { title: browser.title(), writes: browser.writes };
      }),
    );

    expect(result.title).toBe("title of /about");
    expect(result.writes).toEqual([]);
  });

  it("without `titleOf` the title is left alone", async () => {
    const title = await scenario({ browser: "/app/home", state: HOME }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        yield* go(state, "/about");
        yield* settle;

        return browser.title();
      }),
    );

    expect(title).toBe("");
  });

  it("a title function that throws is a failed synchronization step, logged, and cannot keep the URL from following the state", async () => {
    const result = await scenario(
      {
        browser: "/app/home",
        state: HOME,
        titleOf: ({ path }) => {
          if (path === "/about") {
            throw new Error("no title");
          }
          return path;
        },
      },
      navigates,
      ({ browser, state, settle }) =>
        Effect.gen(function* () {
          yield* go(state, "/about");
          yield* settle;
          yield* go(state, "/other");
          yield* settle;

          return { writes: browser.writes, title: browser.title() };
        }),
    );

    expect(result.writes).toEqual(["push /app/about", "push /app/other"]);
    expect(result.title).toBe("/other"); // the follower survived the defect and kept following
  });
});

describe("Web.history: application navigation", () => {
  it("the first state is a baseline: starting writes nothing, even at a browser URL that is not urlOf(state)", async () => {
    const writes = await scenario({ browser: "/app/home?served=odd", state: HOME }, navigates, ({ browser }) => Effect.succeed(browser.writes));

    expect(writes).toEqual([]);
  });

  it("a state change that leaves the application URL the same writes nothing", async () => {
    const writes = await scenario({ browser: "/app/home", state: HOME }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        yield* bump(state);
        yield* bump(state);
        yield* settle;

        return browser.writes;
      }),
    );

    expect(writes).toEqual([]);
  });

  it("a changed application URL is pushed exactly once, and unrelated state after it pushes nothing more", async () => {
    const result = await scenario({ browser: "/app/home", state: HOME }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        yield* go(state, "/about");
        yield* settle;
        const afterNavigation = [...browser.writes];
        yield* bump(state);
        yield* bump(state);
        yield* settle;

        return { afterNavigation, afterUnrelated: [...browser.writes], location: browser.location() };
      }),
    );

    expect(result.afterNavigation).toEqual(["push /app/about"]);
    expect(result.afterUnrelated).toEqual(["push /app/about"]);
    expect(result.location).toBe("/app/about");
  });

  it("the baseline follows every push: each distinct navigation pushes once, including back to an earlier URL", async () => {
    const writes = await scenario({ browser: "/app/home", state: HOME }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        for (const path of ["/about", "/home", "/about"]) {
          yield* go(state, path);
          yield* settle;
          yield* bump(state);
          yield* settle;
        }

        return browser.writes;
      }),
    );

    expect(writes).toEqual(["push /app/about", "push /app/home", "push /app/about"]);
  });

  it("does not decide navigation by comparing the browser URL with urlOf(state): at a noncanonical URL an unrelated change writes nothing", async () => {
    const writes = await scenario({ browser: "/app/about?x=1", state: { path: "/about", n: 0 } }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        yield* bump(state);
        yield* settle;

        return browser.writes;
      }),
    );

    expect(writes).toEqual([]);
  });
});

describe("Web.history: popstate", () => {
  it("a bare navigate name is invoked under the registry's whole-input key, with the same fact; an exact key is passed through verbatim", async () => {
    const result = await scenario({ browser: "/app/home", state: HOME, navigateOption: "go" }, navigates, ({ browser, invoked, settle }) =>
      Effect.gen(function* () {
        browser.pop("/app/about");
        yield* settle;

        return { invoked };
      }),
    );

    expect(result.invoked).toEqual([{ key: "navigation/go", value: { path: "/about" } }]);
  });

  it("invokes the navigate command with stateOf(location), and writes nothing itself", async () => {
    const result = await scenario({ browser: "/app/home", state: HOME }, navigates, ({ browser, state, invoked, settle }) =>
      Effect.gen(function* () {
        browser.pop("/app/about");
        yield* settle;

        return { invoked, writes: [...browser.writes], path: (yield* state.get).path };
      }),
    );

    expect(result.invoked).toEqual([{ key: NAVIGATE, value: { path: "/about" } }]);
    expect(result.writes).toEqual([]);
    expect(result.path).toBe("/about");
  });

  it("the resulting state is the new baseline: an unrelated change after popstate pushes nothing", async () => {
    const writes = await scenario({ browser: "/app/home", state: HOME }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        browser.pop("/app/about");
        yield* settle;
        yield* bump(state);
        yield* settle;

        return browser.writes;
      }),
    );

    expect(writes).toEqual([]);
  });

  it("popstate to a noncanonical entry is left where history put it, and an unrelated change still pushes nothing", async () => {
    const result = await scenario({ browser: "/app/home", state: HOME }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        browser.pop("/app/about?x=1"); // stateOf ignores the query: state /about, urlOf /app/about
        yield* settle;
        yield* bump(state);
        yield* settle;

        return { writes: browser.writes, location: browser.location(), path: (yield* state.get).path };
      }),
    );

    expect(result).toEqual({ writes: [], location: "/app/about?x=1", path: "/about" });
  });

  it("after a popstate, navigating to the URL it left still pushes", async () => {
    const writes = await scenario({ browser: "/app/home", state: HOME }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        browser.pop("/app/about");
        yield* settle;
        yield* go(state, "/home"); // an application navigation back to where it started
        yield* settle;

        return browser.writes;
      }),
    );

    expect(writes).toEqual(["push /app/home"]);
  });

  it("the listener exists while the scope is open and is gone after", async () => {
    const seen: Array<ReturnType<typeof fakeWindow>> = [];
    const during = await scenario({ browser: "/app/home", state: HOME }, navigates, ({ browser }) =>
      Effect.sync(() => {
        seen.push(browser);
        return browser.listeners.size;
      }),
    );

    expect(during).toBe(1);
    expect(seen[0]!.listeners.size).toBe(0);
  });
});

// A popstate whose navigation does not produce the application state the URL named. Observed, and (below) the
// smallest contract the current implementation supports; no rollback or resynchronization was added.
describe("Web.history: a popstate whose navigation fails or changes nothing", () => {
  const restricted = (name: string, navigate: Navigate) =>
    it(`${name}: no write, state unchanged, browser stays where history put it, and the next unrelated change pushes nothing`, async () => {
      const result = await scenario({ browser: "/app/home", state: HOME }, navigate, ({ browser, state, invoked, settle }) =>
        Effect.gen(function* () {
          browser.pop("/app/restricted"); // history: /home → /restricted
          yield* settle;
          const afterPop = { writes: [...browser.writes], location: browser.location(), path: (yield* state.get).path, invoked: invoked.length };
          yield* bump(state); // an unrelated application state change
          yield* settle;
          const afterUnrelated = { writes: [...browser.writes], location: browser.location(), path: (yield* state.get).path };
          yield* go(state, "/about"); // a real application navigation afterwards
          yield* settle;

          return { afterPop, afterUnrelated, afterNavigation: [...browser.writes] };
        }),
      );

      expect(result.afterPop).toEqual({ writes: [], location: "/app/restricted", path: "/home", invoked: 1 });
      expect(result.afterUnrelated).toEqual({ writes: [], location: "/app/restricted", path: "/home" });
      // Navigation still works afterwards: the baseline is the state's own URL (/app/home), so /about is a change.
      expect(result.afterNavigation).toEqual(["push /app/about"]);
    });

  restricted("the command fails", (path, state) =>
    path === "/restricted" ? Effect.fail<Mesh.UnmappedCommand>({ _tag: "UnmappedCommand", component: "app", name: "restricted" }) : navigates(path, state),
  );
  restricted("the command succeeds without changing state", (path, state) => (path === "/restricted" ? Effect.void : navigates(path, state)));
});

describe("push or replace", () => {
  const go = (path: string, state: Nexus.State.StateHandle<App>) => state.update((current) => Effect.succeed({ ...current, path }));
  const HOME: App = { path: "/", n: 0 };

  it("pushes by default and replaces the current entry when the application says so, so Back skips it", async () => {
    const result = await scenario(
      { browser: "/app/", state: HOME, modeOf: (previous, next) => (previous.path.startsWith("/search") && next.path.startsWith("/search") ? "replace" : "push") },
      navigates,
      ({ browser, state, settle }) =>
        Effect.gen(function* () {
          yield* go("/search?q=a", state);
          yield* settle;
          yield* go("/search?q=ab", state);
          yield* settle;
          yield* go("/about", state);
          yield* settle;

          return { writes: [...browser.writes], stack: browser.stack() };
        }),
    );

    // The first search is a push from home; the second, still a search, rewrites it; /about pushes again.
    expect(result.writes).toEqual(["push /app/search?q=a", "replace /app/search?q=ab", "push /app/about"]);
    expect(result.stack).toEqual({ urls: ["/app/", "/app/search?q=ab", "/app/about"], at: 2 });
  });

  it("is told the state before and after", async () => {
    const seen: Array<string> = [];

    await scenario({ browser: "/app/", state: HOME, modeOf: (previous, next) => (seen.push(`${previous.path}>${next.path}`), "push") }, navigates, ({ state, settle }) =>
      Effect.gen(function* () {
        yield* go("/a", state);
        yield* settle;
        yield* go("/b", state);
        yield* settle;
      }),
    );
    expect(seen).toEqual(["/>/a", "/a>/b"]);
  });
});

describe("a guard on Back and Forward", () => {
  const go = (path: string, state: Nexus.State.StateHandle<App>) => state.update((current) => Effect.succeed({ ...current, path }));
  const HOME: App = { path: "/", n: 0 };
  const visit = (pages: ReadonlyArray<string>, state: Nexus.State.StateHandle<App>, settle: Effect.Effect<void>) =>
    Effect.gen(function* () {
      for (const page of pages) {
        yield* go(page, state);
        yield* settle;
      }
    });

  it("lets a navigation run when it says yes: the navigate command is invoked as always", async () => {
    const asked: Array<string> = [];
    const result = await scenario(
      { browser: "/app/", state: HOME, guard: (navigation, state) => (asked.push(`${navigation.kind} ${navigation.url.pathname} from ${state.path}`), true) },
      navigates,
      ({ browser, state, invoked, settle }) =>
        Effect.gen(function* () {
          yield* visit(["/a", "/b"], state, settle);
          browser.traverse(-1);
          yield* settle;

          return { path: (yield* state.get).path, invoked, location: browser.location() };
        }),
    );

    expect(asked).toEqual(["popstate /app/a from /b"]);
    expect(result.path).toBe("/a");
    expect(result.location).toBe("/app/a");
    expect(result.invoked).toHaveLength(1);
  });

  it("undoes a Back it refuses: the browser goes forward by the same distance, the state stays, the command is not invoked", async () => {
    const result = await scenario({ browser: "/app/", state: HOME, guard: () => false }, navigates, ({ browser, state, invoked, settle }) =>
      Effect.gen(function* () {
        yield* visit(["/a", "/b"], state, settle);
        browser.traverse(-1);
        yield* settle;

        return { path: (yield* state.get).path, invoked, location: browser.location(), writes: [...browser.writes], stack: browser.stack() };
      }),
    );

    expect(result.path).toBe("/b");
    expect(result.location).toBe("/app/b");
    expect(result.invoked).toEqual([]);
    expect(result.writes.slice(-1)).toEqual(["go 1"]);
    expect(result.stack).toEqual({ urls: ["/app/", "/app/a", "/app/b"], at: 2 });
  });

  it("undoes a refused Back across several entries by their distance, and a refused Forward the other way", async () => {
    let open = true;
    const result = await scenario({ browser: "/app/", state: HOME, guard: () => open }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        yield* visit(["/a", "/b", "/c"], state, settle);
        browser.traverse(-1);
        yield* settle; // allowed: now at /b
        open = false;
        browser.traverse(-1);
        yield* settle; // refused: undone
        const afterBack = { path: (yield* state.get).path, at: browser.stack().at };
        browser.traverse(+1);
        yield* settle; // refused Forward: undone
        const afterForward = { path: (yield* state.get).path, at: browser.stack().at };

        return { afterBack, afterForward };
      }),
    );

    expect(result.afterBack).toEqual({ path: "/b", at: 2 });
    expect(result.afterForward).toEqual({ path: "/b", at: 2 });
  });

  it("keeps the application's URL when the refused entry is one the page did not write", async () => {
    const result = await scenario({ browser: "/app/", state: HOME, guard: () => false }, navigates, ({ browser, state, settle }) =>
      Effect.gen(function* () {
        yield* visit(["/a"], state, settle);
        browser.pop("/elsewhere");
        yield* settle;

        return { path: (yield* state.get).path, writes: [...browser.writes], location: browser.location() };
      }),
    );

    expect(result.path).toBe("/a");
    expect(result.location).toBe("/app/a");
    expect(result.writes.slice(-1)).toEqual(["push /app/a"]);
  });

  it("does not ask when the move stays on the application's own address (a #fragment entry)", async () => {
    const asked: Array<string> = [];

    await scenario({ browser: "/app/a", state: { path: "/a", n: 0 }, guard: (navigation) => (asked.push(navigation.url.pathname), false) }, navigates, ({ browser, settle }) =>
      Effect.gen(function* () {
        browser.pop("/app/a#heading");
        yield* settle;
      }),
    );
    expect(asked).toEqual([]);
  });

  it("sends a Back it redirects to another address of the origin: the entry is rewritten and the application navigates there", async () => {
    const result = await scenario(
      { browser: "/app/", state: HOME, guard: (navigation) => (navigation.url.pathname === "/app/a" ? { redirect: "/app/login?next=%2Fa" } : true) },
      navigates,
      ({ browser, state, invoked, settle }) =>
        Effect.gen(function* () {
          yield* visit(["/a", "/b"], state, settle);
          browser.traverse(-1);
          yield* settle;

          return { path: (yield* state.get).path, invoked, writes: [...browser.writes], stack: browser.stack() };
        }),
    );

    expect(result.writes.at(-1)).toBe("replace /app/login?next=%2Fa");
    expect(result.stack.urls[1]).toBe("/app/login?next=%2Fa");
    expect(result.invoked).toEqual([{ key: "app/navigate", value: { path: "/login" } }]);
    expect(result.path).toBe("/login");
  });

  it("refuses a redirect to another origin as a no", async () => {
    const result = await scenario({ browser: "/app/", state: HOME, guard: () => ({ redirect: "https://evil.example/app/x" }) }, navigates, ({ browser, state, invoked, settle }) =>
      Effect.gen(function* () {
        yield* visit(["/a"], state, settle);
        browser.traverse(-1);
        yield* settle;

        return { path: (yield* state.get).path, invoked, location: browser.location() };
      }),
    );

    expect(result).toEqual({ path: "/a", invoked: [], location: "/app/a" });
  });

  it("counts a guard that throws or rejects as no, and logs it", async () => {
    for (const guard of [
      () => Promise.reject(new Error("boom")),
      () => {
        throw new Error("boom");
      },
    ] as const) {
      const result = await scenario({ browser: "/app/", state: HOME, guard }, navigates, ({ browser, state, invoked, settle }) =>
        Effect.gen(function* () {
          yield* visit(["/a"], state, settle);
          browser.traverse(-1);
          yield* settle;

          return { path: (yield* state.get).path, invoked };
        }),
      );

      expect(result).toEqual({ path: "/a", invoked: [] });
    }
  });
});
