import * as Nexus from "@valancex/nexus";
import { Effect, Ref, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import { createRouter, redirect, route, RouteDefinitionError } from "../src/index.js";
import type { RouteState } from "../src/index.js";

interface App {
  readonly route: RouteState;
  readonly dirty: boolean;
  readonly user: "guest" | "member" | "admin";
}

const home = route("/", { name: "home", title: "Home" });
const inbox = route("/inbox", {
  name: "inbox",
  query: Schema.Struct({ tab: Schema.optional(Schema.Literal("all", "unread")), q: Schema.optional(Schema.String), tag: Schema.optional(Schema.Array(Schema.String)) }),
  replaceQuery: true,
  title: ({ query }) => (query.tab === "unread" ? "Unread" : "Inbox"),
});
const message = route("/inbox/:id", {
  name: "message",
  params: Schema.Struct({ id: Schema.NumberFromString }),
  title: ({ params }) => `Message ${params.id}`,
  data: { sensitive: true },
});
const newest = route("/inbox/new", { name: "compose" });
const files = route("/files/*path", { name: "files" });
const login = route("/login", { name: "login" });
const admin = route("/admin", { name: "admin", canMatch: () => false });

const app = (overrides: Partial<App> = {}): App => ({ route: { name: "home", params: {}, query: {} }, dirty: false, user: "guest", ...overrides });

describe("defining routes", () => {
  it("refuses a name used twice, a clash with not found, two paths of one shape, a redirect to nowhere and a base that is not one", () => {
    expect(() => createRouter<App>({ routes: [route("/a", { name: "x" }), route("/b", { name: "x" })] })).toThrow(RouteDefinitionError);
    expect(() => createRouter<App>({ routes: [route("/a", { name: "notFound" })] })).toThrow(RouteDefinitionError);
    expect(() => createRouter<App>({ routes: [route("/a/:x", { name: "a" }), route("/a/:y", { name: "b" })] })).toThrow(/cannot be told apart/);
    expect(() => createRouter<App>({ routes: [route("/a", { name: "a", redirectTo: redirect("nowhere") })] })).toThrow(/not a route/);
    expect(() => createRouter<App>({ routes: [], base: "docs" })).toThrow(RouteDefinitionError);
  });
});

describe("matching", () => {
  const router = createRouter<App>({ routes: [files, message, newest, inbox, login, home, admin] });

  it("prefers a literal to a parameter to a rest, whatever the order they were declared in", () => {
    expect(router.match("/inbox/new").name).toBe("compose");
    expect(router.match("/inbox/42")).toEqual({ name: "message", params: { id: 42 }, query: {} });
    expect(router.match("/files/a/b").name).toBe("files");
  });

  it("decodes path parameters with the route's Schema, and a value that does not decode is not this route", () => {
    expect(router.match("/inbox/42").params).toEqual({ id: 42 });
    expect(router.match("/inbox/forty-two").name).toBe("notFound");
    expect(router.match("/inbox/1.5e3").params).toEqual({ id: 1500 });
  });

  it("decodes the query, an unknown key is ignored, a repeated key is an array, and an invalid value is not this route", () => {
    expect(router.match("/inbox?tab=unread&utm=x").query).toEqual({ tab: "unread" });
    expect(router.match("/inbox?tag=a&tag=b").query).toEqual({ tag: ["a", "b"] });
    expect(router.match("/inbox?tab=nope").name).toBe("notFound");
  });

  it("falls to not found, with the address, for what nothing matches, and reads no address it was not meant to", () => {
    expect(router.match("/nowhere")).toEqual({ name: "notFound", params: { path: "/nowhere" }, query: {} });
    expect(router.match(`/${"a".repeat(3000)}`).name).toBe("notFound");
    expect(router.match(`/inbox?${Array.from({ length: 70 }, (_, at) => `k${at}=1`).join("&")}`).name).toBe("notFound");
    expect(router.match(`/inbox?q=${"x".repeat(3000)}`).name).toBe("notFound");
  });

  it("drops query keys that would reach the prototype, and the object it hands back has none", () => {
    const state = router.match("/inbox?__proto__=x&constructor=y&q=ok");

    expect(state.query).toEqual({ q: "ok" });
    expect(Object.keys(state.query)).toEqual(["q"]);
    expect(({} as Record<string, unknown>)["x"]).toBeUndefined();
  });

  it("skips a route whose matching condition says it is not available, and falls to the next, then to not found", () => {
    expect(router.match("/admin").name).toBe("notFound");

    let role = "member";
    const gated = createRouter<App, { role: string }>({
      routes: [
        route("/admin", { name: "admin", canMatch: (context: { role: string }) => context.role === "admin" }),
        route("/:page", { name: "page", params: Schema.Struct({ page: Schema.String }) }),
      ],
      context: () => ({ role }),
    });

    expect(gated.match("/admin").name).toBe("page");
    role = "admin";
    expect(gated.match("/admin").name).toBe("admin");
  });

  it("follows a redirect declared on the route, and gives up on a loop", () => {
    const redirects = createRouter<App>({
      routes: [
        route("/old", { name: "old", redirectTo: redirect("new") }),
        route("/new", { name: "new" }),
        route("/a", { name: "a", redirectTo: redirect("b") }),
        route("/b", { name: "b", redirectTo: redirect("a") }),
      ],
    });

    expect(redirects.match("/old")).toEqual({ name: "new", params: {}, query: {} });
    expect(redirects.match("/a").name).toBe("notFound");
  });

  it("serves under a base and knows nothing outside it", () => {
    const under = createRouter<App>({ routes: [home, inbox], base: "/docs/" });

    expect(under.match("/docs/inbox").name).toBe("inbox");
    expect(under.match("/docs/").name).toBe("home");
    expect(under.match("/docs").name).toBe("home");
    expect(under.match("/inbox").name).toBe("notFound");
    expect(under.href(inbox, {}, { tab: "all" })).toBe("/docs/inbox?tab=all");
    expect(under.href(home)).toBe("/docs/");
  });
});

describe("building addresses", () => {
  const router = createRouter<App>({ routes: [home, inbox, message, files, login] });

  it("is the inverse of matching", () => {
    const url = router.href(message, { id: 42 });

    expect(url).toBe("/inbox/42");
    expect(router.match(url)).toEqual({ name: "message", params: { id: 42 }, query: {} });
    expect(router.hrefOf(router.match("/inbox?tag=a&tag=b&tab=unread"))).toBe("/inbox?tab=unread&tag=a&tag=b");
  });

  it("encodes values, sorts the query, and leaves out what is not there", () => {
    expect(router.href(files, { path: "a b/ü.txt" })).toBe("/files/a%20b/%C3%BC.txt");
    expect(router.href(inbox, {}, { q: "a&b=c", tab: undefined })).toBe("/inbox?q=a%26b%3Dc");
  });

  it("refuses what does not fit the route: a missing parameter, a value the Schema rejects, a route that is not there", () => {
    expect(() => router.href("message", {})).toThrow(RouteDefinitionError);
    expect(() => router.href(inbox, {}, { tab: "nope" })).toThrow(RouteDefinitionError);
    expect(() => router.href("nowhere")).toThrow(/no route named/);
  });
});

describe("addresses from outside", () => {
  const router = createRouter<App>({ routes: [home, inbox, message, login] });

  it("resolves a path on this application to its route, and nothing else", () => {
    expect(router.resolve("/inbox/42?x=1")?.name).toBe("message");
    expect(router.resolve("inbox/7")?.name).toBe("message");
    for (const bad of ["https://evil.example/inbox", "//evil.example/inbox", "javascript:alert(1)", "data:text/html,x", "\\\\evil"]) {
      expect(router.resolve(bad), bad).toBeUndefined();
    }
  });

  it("gives back a ?next= only when it is the address of a declared route on this application", () => {
    expect(router.safeNext("/inbox/42")).toBe("/inbox/42");
    expect(router.safeNext("/inbox?tab=unread")).toBe("/inbox?tab=unread");
    for (const bad of [undefined, null, "", "/nowhere", "//evil.example", "https://evil.example/", "javascript:alert(1)", "/inbox/NaN"]) {
      expect(router.safeNext(bad as string | null | undefined), String(bad)).toBeUndefined();
    }
  });
});

describe("titles and delivery", () => {
  const router = createRouter<App>({
    routes: [
      home,
      inbox,
      message,
      files,
      route("/about", { name: "about", delivery: "static" }),
      route("/app/:id", { name: "app", params: Schema.Struct({ id: Schema.String }), delivery: "client" }),
      route("/old", { name: "old", redirectTo: redirect("about") }),
      route("/post/:slug", { name: "post", params: Schema.Struct({ slug: Schema.String }), staticParams: () => [{ slug: "a" }, { slug: "b c" }] }),
    ],
    notFound: { title: "Not found" },
  });

  it("title a route from its parameters and query, and say nothing for a route that has none", () => {
    expect(router.titleOf(router.match("/inbox/42"))).toBe("Message 42");
    expect(router.titleOf(router.match("/inbox?tab=unread"))).toBe("Unread");
    expect(router.titleOf(router.match("/"))).toBe("Home");
    expect(router.titleOf(router.match("/about"))).toBeUndefined();
    expect(router.titleOf(router.match("/nowhere"))).toBe("Not found");
  });

  it("lists the pages a build writes: those without parameters, each of the declared sets, not client routes or redirects", () => {
    expect(router.paths()).toEqual(["/", "/inbox", "/about", "/post/a", "/post/b%20c"]);
  });

  it("says a client route is the server's to answer, and knows which addresses are pages", () => {
    expect(router.table.delivery?.("/app/9")).toBe("server");
    expect(router.table.delivery?.("/about")).toBe("static");
    expect(router.table.known("/inbox/42")).toBe(true);
    expect(router.table.known("/inbox/x")).toBe(false);
  });
});

describe("push or replace", () => {
  const router = createRouter<App>({ routes: [home, inbox, message] });
  const at = (state: RouteState): App => app({ route: state });

  it("replaces for a query-only change on a route that asks for it, pushes otherwise", () => {
    const mode = router.table.modeOf!;

    expect(mode(at(router.match("/inbox?q=a")), at(router.match("/inbox?q=ab")))).toBe("replace");
    expect(mode(at(router.match("/inbox")), at(router.match("/inbox/1")))).toBe("push");
    expect(mode(at(router.match("/inbox/1")), at(router.match("/inbox/2")))).toBe("push");
    expect(mode(at(router.match("/")), at(router.match("/inbox")))).toBe("push");
    expect(mode(at(router.match("/inbox")), at({ ...router.match("/inbox/1"), replace: true }))).toBe("replace");
  });
});

describe("deciding a navigation", () => {
  const trace: Array<string> = [];
  const log =
    (label: string, answer: boolean | ReturnType<typeof redirect> = true) =>
    () => {
      trace.push(label);

      return answer;
    };
  const decide = (router: ReturnType<typeof createRouter<App>>, from: string, to: string, state: App = app(), kind: "link" | "popstate" | "programmatic" = "link") =>
    Effect.runPromise(router.decide({ from: router.match(from), to: router.match(to), state, kind }));

  it("asks the route being left, then the router's, then the route being entered, in that order", async () => {
    trace.length = 0;

    const router = createRouter<App>({
      routes: [route("/a", { name: "a", canDeactivate: log("leave a") }), route("/b", { name: "b", canActivate: log("enter b") })],
      beforeEach: log("each"),
    });

    expect((await decide(router, "/a", "/b"))._tag).toBe("Allow");
    expect(trace).toEqual(["leave a", "each", "enter b"]);
  });

  it("stops at the first refusal and says which guard it was", async () => {
    const router = createRouter<App>({
      routes: [route("/a", { name: "a", canDeactivate: ({ state }) => !state.dirty }), route("/b", { name: "b", canActivate: () => false }), route("/c", { name: "c" })],
    });

    expect(await decide(router, "/a", "/c", app({ dirty: true }))).toEqual({ _tag: "Refuse", by: "canDeactivate", route: "a" });
    expect(await decide(router, "/a", "/c", app({ dirty: false }))).toMatchObject({ _tag: "Allow" });
    expect(await decide(router, "/c", "/b")).toEqual({ _tag: "Refuse", by: "canActivate", route: "b" });
  });

  it("asks nothing when the destination is where the application already is", async () => {
    const guard = vi.fn<() => boolean>(() => false);
    const router = createRouter<App>({ routes: [route("/a", { name: "a", canDeactivate: guard, canActivate: guard })], beforeEach: guard });

    expect((await decide(router, "/a", "/a"))._tag).toBe("Allow");
    expect(guard).not.toHaveBeenCalled();
  });

  it("does not ask the route being left about a change of query alone, and does for a change of parameters", async () => {
    const leave = vi.fn<() => boolean>(() => true);
    const router = createRouter<App>({
      routes: [
        route("/list", { name: "list", query: Schema.Struct({ q: Schema.optional(Schema.String) }), canDeactivate: leave }),
        route("/item/:id", { name: "item", params: Schema.Struct({ id: Schema.String }), canDeactivate: leave }),
      ],
    });

    await decide(router, "/list?q=a", "/list?q=b");
    expect(leave).not.toHaveBeenCalled();
    await decide(router, "/item/1", "/item/2");
    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("sends a redirect to its target and asks the target's guards, and a loop is a refusal", async () => {
    const router = createRouter<App>({
      routes: [
        route("/secret", { name: "secret", canActivate: ({ state }) => (state.user === "guest" ? redirect("login", {}, {}) : true) }),
        route("/login", { name: "login" }),
        route("/x", { name: "x", canActivate: () => redirect("y") }),
        route("/y", { name: "y", canActivate: () => redirect("x") }),
      ],
    });

    expect(await decide(router, "/login", "/secret")).toEqual({ _tag: "Redirect", to: { name: "login", params: {}, query: {} } });
    expect(await decide(router, "/login", "/secret", app({ user: "member" }))).toMatchObject({ _tag: "Allow" });
    expect(await decide(router, "/login", "/x")).toEqual({ _tag: "Refuse", by: "redirects", route: "y" });
  });

  it("refuses a redirect to a route that does not exist or whose parameters do not fit", async () => {
    const router = createRouter<App>({
      routes: [
        route("/a", { name: "a", canActivate: () => redirect("missing") }),
        route("/b", { name: "b", canActivate: () => redirect("p", {}, {}) }),
        route("/p/:id", { name: "p", params: Schema.Struct({ id: Schema.NumberFromString }) }),
      ],
    });

    expect(await decide(router, "/", "/a")).toMatchObject({ _tag: "Refuse", by: "canActivate" });
    expect(await decide(router, "/", "/b")).toMatchObject({ _tag: "Refuse", by: "canActivate" });
  });

  it("accepts a guard that answers now, later or as an Effect, and counts one that throws or rejects as no", async () => {
    const answers: ReadonlyArray<readonly [() => unknown, string]> = [
      [() => true, "Allow"],
      [() => Promise.resolve(true), "Allow"],
      [() => Effect.succeed(true), "Allow"],
      [() => Promise.resolve(false), "Refuse"],
      [() => Effect.succeed(false), "Refuse"],
      [
        () => {
          throw new Error("boom");
        },
        "Refuse",
      ],
      [() => Promise.reject(new Error("boom")), "Refuse"],
      [() => Effect.fail("boom"), "Refuse"],
    ];

    for (const [guard, expected] of answers) {
      const router = createRouter<App>({ routes: [route("/a", { name: "a", canActivate: guard as never })] });

      expect((await decide(router, "/", "/a"))._tag, String(guard)).toBe(expected);
    }
  });

  it("tells a guard where from and to, the state, how the navigation began, and the route's own data", async () => {
    let seen: unknown;
    const router = createRouter<App>({
      routes: [
        home,
        route("/m/:id", { name: "m", params: Schema.Struct({ id: Schema.String }), data: { requires: "member" }, canActivate: (context) => ((seen = context), true) }),
      ],
    });

    await decide(router, "/", "/m/9", app({ user: "member" }), "popstate");
    expect(seen).toMatchObject({ from: { name: "home" }, to: { name: "m", params: { id: "9" } }, state: { user: "member" }, kind: "popstate", data: { requires: "member" } });
  });
});

describe("the commands", () => {
  const harness = (router: ReturnType<typeof createRouter<App>>, initial: App) =>
    Effect.gen(function* () {
      const ref = yield* Ref.make(initial);
      const state = {
        get: Ref.get(ref),
        update: (f: (current: App) => Effect.Effect<App>) => Effect.flatMap(Ref.get(ref), (current) => Effect.tap(f(current), (next) => Ref.set(ref, next))),
      } as unknown as Nexus.State.StateHandle<App>;
      const commands = router.commands(state);

      return {
        read: Ref.get(ref),
        go: (to: string) => Nexus.Command.invoke(commands.go, { to }),
        replace: (to: string) => Nexus.Command.invoke(commands.replace, { to }),
        navigate: (next: RouteState) => Nexus.Command.invoke(commands.navigate, next),
      };
    });

  const router = createRouter<App>({
    routes: [
      home,
      inbox,
      message,
      login,
      route("/draft", { name: "draft", canDeactivate: ({ state }) => !state.dirty }),
      route("/secret", { name: "secret", canActivate: ({ state }) => (state.user === "guest" ? redirect("login") : true) }),
    ],
  });

  it("go sets the route, and replace sets it with the replace flag", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const h = yield* harness(router, app());

        yield* h.go("/inbox/42?x=1");
        const first = yield* h.read;

        yield* h.replace("/inbox?tab=unread");

        return { first: first.route, second: (yield* h.read).route };
      }),
    );

    expect(result.first).toEqual({ name: "message", params: { id: 42 }, query: {} });
    expect(result.second).toEqual({ name: "inbox", params: {}, query: { tab: "unread" }, replace: true });
  });

  it("go leaves the application where it is when a guard refuses, and follows a redirect as a replacement", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const h = yield* harness(router, app({ route: { name: "draft", params: {}, query: {} }, dirty: true }));

        yield* h.go("/");
        const refused = (yield* h.read).route.name;
        const guest = yield* harness(router, app());

        yield* guest.go("/secret");

        return { refused, redirected: (yield* guest.read).route };
      }),
    );

    expect(result.refused).toBe("draft");
    expect(result.redirected).toEqual({ name: "login", params: {}, query: {}, replace: true });
  });

  it("go ignores an address that is not on the application", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const h = yield* harness(router, app());

        yield* h.go("https://evil.example/inbox");
        yield* h.go("//evil.example/inbox");

        return (yield* h.read).route.name;
      }),
    );

    expect(result).toBe("home");
  });

  it("navigate sets the route it is given without the replace flag; it is what the browser's own moves invoke after the guard", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const h = yield* harness(router, app());

        yield* h.navigate({ name: "inbox", params: {}, query: {}, replace: true });

        return (yield* h.read).route;
      }),
    );

    expect(result).toEqual({ name: "inbox", params: {}, query: {} });
  });

  it("the table the browser uses: the url of a state, the state of a url, and the guard for Back and links", async () => {
    const state = app({ route: router.match("/inbox/42?x=1") });

    expect(router.table.urlOf(state)).toBe("/inbox/42");
    expect(router.table.stateOf(new URL("http://x/inbox?tab=unread"))).toEqual({ name: "inbox", params: {}, query: { tab: "unread" } });

    const dirty = app({ route: router.match("/draft"), dirty: true });

    expect(await router.table.guard!({ kind: "popstate", url: new URL("http://x/") }, dirty)).toBe(false);
    expect(await router.table.guard!({ kind: "link", url: new URL("http://x/secret") }, app())).toEqual({ redirect: "/login" });
    expect(await router.table.guard!({ kind: "link", url: new URL("http://x/inbox") }, app())).toBe(true);
  });

  it("the plugin gives Web.run the table and the title", () => {
    expect(router.plugin.name).toBe("router");
    expect(router.plugin.routes).toBe(router.table);
    expect(router.plugin.head?.(app({ route: router.match("/inbox/42") }))).toEqual({ title: "Message 42" });
    expect(router.plugin.head?.(app({ route: router.match("/login") }))).toEqual({});
  });
});

describe("starting on an address", () => {
  const guarded = createRouter<App>({
    routes: [
      home,
      login,
      route("/secret", { name: "secret", canActivate: ({ state, kind }) => (kind === "initial" && state.user === "guest" ? redirect("login") : true) }),
      route("/closed", { name: "closed", canActivate: () => false }),
    ],
  });
  const start = (address: string, state: App) => Effect.runPromise(guarded.enter(address, state));

  it("asks the entering guards, which `match` alone does not, and follows a redirect", async () => {
    expect(guarded.match("/secret").name).toBe("secret");
    expect((await start("/secret", app({ user: "guest" }))).name).toBe("login");
    expect((await start("/secret", app({ user: "member" }))).name).toBe("secret");
  });

  it("starts on not found when the entering guard refuses, and for an address that is not the application's", async () => {
    expect((await start("/closed", app())).name).toBe("notFound");
    expect((await start("https://evil.example/x", app())).name).toBe("notFound");
  });
});

describe("moving from inside a command, and leaving altogether", () => {
  const guarded = createRouter<App>({
    routes: [home, inbox, route("/edit", { name: "edit", canDeactivate: ({ state }) => !state.dirty })],
  });
  const run = async (initial: App, work: (handle: Nexus.State.StateHandle<App>) => Effect.Effect<unknown>) => {
    const state = await Effect.runPromise(Ref.make(initial));
    const handle: Nexus.State.StateHandle<App> = {
      get: Ref.get(state),
      update: (change: (current: App) => Effect.Effect<App>) => Effect.flatMap(Ref.get(state), (current) => Effect.flatMap(change(current), (next) => Ref.set(state, next))),
    } as never;
    const result = await Effect.runPromise(work(handle));

    return { result, state: await Effect.runPromise(Ref.get(state)) };
  };

  it("moves, and says it did; a refusal by the leaving guard leaves the application where it was and says so", async () => {
    const allowed = await run(app({ route: { name: "edit", params: {}, query: {} } }), (handle) => guarded.moveTo(handle, "/inbox"));

    expect(allowed.result).toBe(true);
    expect(allowed.state.route.name).toBe("inbox");

    const refused = await run(app({ route: { name: "edit", params: {}, query: {} }, dirty: true }), (handle) => guarded.moveTo(handle, "/inbox"));

    expect(refused.result).toBe(false);
    expect(refused.state.route.name).toBe("edit");
  });

  it("answers false for an address that is not the application's, and for where it already is", async () => {
    expect((await run(app(), (handle) => guarded.moveTo(handle, "https://evil.example/x"))).result).toBe(false);
    expect((await run(app(), (handle) => guarded.moveTo(handle, "/"))).result).toBe(false);
  });

  it("may be left when the current route has no leaving guard or its guard allows, and not otherwise", async () => {
    const may = (state: App) => Effect.runPromise(guarded.mayLeave(state));

    expect(await may(app())).toBe(true);
    expect(await may(app({ route: { name: "edit", params: {}, query: {} } }))).toBe(true);
    expect(await may(app({ route: { name: "edit", params: {}, query: {} }, dirty: true }))).toBe(false);
  });

  it("tells a leaving guard that the application is closing", async () => {
    const seen: Array<string> = [];
    const spy = createRouter<App>({ routes: [route("/", { name: "home", canDeactivate: ({ kind }) => (seen.push(kind), true) })] });

    await Effect.runPromise(spy.mayLeave(app()));
    expect(seen).toEqual(["close"]);
  });
});
