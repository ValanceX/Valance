// The router in a real page: NEXUS, MESH and PORT Web over a jsdom window with a real URL and history, through `Web.run` with the router's plugin as the URL policy. What the unit tests
// establish about matching and deciding is here shown to reach the address bar, the history entries and the screen.
import { compileProgram } from "@valancex/mesh-compiler";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect, Schema } from "effect";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import { createRouter, redirect, route } from "../src/index.js";
import type { RouteState } from "../src/index.js";

const SOURCE = `<page>
  <text>{name}</text>
  <link href="/inbox/1">one</link>
  <link href="/inbox/new">compose</link>
  <link href="/secret">secret</link>
  <button on.click={go("/inbox/2")}>two</button>
  <button on.click={go("/inbox?tab=unread")}>unread</button>
  <button on.click={replace("/inbox?tab=all")}>all</button>
</page>`;

const prop = { required: true, type: { kind: "string" } };
const MANIFEST = {
  version: 1,
  types: {},
  components: {
    page: { props: {}, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    link: { props: { href: prop }, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    screen: {
      props: {},
      events: {},
      commands: {
        go: { parameters: [{ name: "to", type: { kind: "string" } }] },
        replace: { parameters: [{ name: "to", type: { kind: "string" } }] },
      },
      scope: { name: { kind: "string" } },
    },
  },
};

interface App {
  readonly route: RouteState;
  readonly dirty: boolean;
  readonly user: "guest" | "member";
}

const routes = [
  route("/", { name: "home", title: "Home" }),
  route("/inbox", {
    name: "inbox",
    query: Schema.Struct({ tab: Schema.optional(Schema.Literal("all", "unread")) }),
    replaceQuery: true,
    title: ({ query }) => `Inbox ${query.tab ?? "all"}`,
  }),
  route("/inbox/new", { name: "compose", title: "Compose", canDeactivate: ({ state }: { state: App }) => !state.dirty }),
  route("/inbox/:id", {
    name: "message",
    params: Schema.Struct({ id: Schema.NumberFromString }),
    title: ({ params }) => `Message ${params.id}`,
    canDeactivate: ({ state }: { state: App }) => !state.dirty,
  }),
  route("/login", { name: "login", title: "Sign in" }),
  route("/secret", { name: "secret", title: "Secret", canActivate: ({ state }: { state: App }) => (state.user === "guest" ? redirect("login") : true) }),
];

const until = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const close of closers.splice(0)) {
    await close();
  }
});

/** The application at `start`, with the router's plugin as its URL policy. */
const page = async (start: string, user: App["user"] = "member") => {
  const dom = new JSDOM(`<!doctype html><title>x</title><main></main>`, { url: `http://localhost${start}` });
  const win = dom.window as unknown as Window;
  const container = dom.window.document.querySelector("main")!;
  const router = createRouter<App>({ routes, notFound: { title: "Not found" } });
  const compiled = await compileProgram({
    model: { manifest: JSON.stringify(MANIFEST), path: "components.json" },
    root: "screen",
    components: [{ component: "screen", source: SOURCE, path: "screen.mprx" }],
  });

  if (compiled.program === undefined) {
    throw new Error(`does not compile: ${JSON.stringify(compiled.components)}`);
  }

  const State = Schema.Struct({ route: Schema.Unknown, dirty: Schema.Boolean, user: Schema.Literal("guest", "member") }) as unknown as Schema.Schema<App>;
  const app = Valance.define({
    name: "router-integration",
    state: { schema: State, initial: { route: router.match(start), dirty: false, user } },
    views: { screen: { program: compiled.program as never, scope: (state: App) => ({ name: state.route.name }) } },
    view: () => "screen" as const,
    commands: (state) => ({
      ...router.commands(state as never),
      edit: Nexus.Command.define("edit", Schema.Struct({ dirty: Schema.Boolean }), ({ dirty }) =>
        state.update((current) => Effect.succeed({ ...current, dirty })).pipe(Effect.asVoid),
      ),
    }),
  });
  const host = await Web.run(app, {
    container,
    primitives: {
      page: { element: "main" },
      text: { element: "p" },
      link: { element: "a", props: { href: Web.attribute("href") } },
      button: { element: "button", events: { click: { type: "click" } } },
    },
    present: "mount",
    plugins: [router.plugin as never],
  });

  closers.push(() => host.stop());
  await until(() => container.querySelector("p") !== null);

  const click = (target: Element) => target.dispatchEvent(new (win as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent("click", { bubbles: true, cancelable: true }));
  const link = (href: string) => container.querySelector(`a[href="${href}"]`)!;
  const button = (label: string) => Array.from(container.querySelectorAll("button")).find((each) => each.textContent === label)!;
  const here = () => win.location.pathname + win.location.search;
  const route_ = async () => ((await Effect.runPromise(host.handle.state)) as App).route;
  const edit = (dirty: boolean) => Effect.runPromise(host.handle.invoke("app/edit", [{ value: dirty }]));

  return { win, container, host, router, click, link, button, here, route: route_, edit, title: () => win.document.title, entries: () => win.history.length };
};

describe("the router in a page", () => {
  it("follows a link in place, keeps the address and the title in step with the route, and goes Back", async () => {
    const p = await page("/");

    await until(() => p.title() === "Home");
    expect(p.title()).toBe("Home");
    p.click(p.link("/inbox/1"));
    await until(() => p.here() === "/inbox/1");
    expect((await p.route()).params).toEqual({ id: 1 });
    expect(p.title()).toBe("Message 1");
    expect(p.container.querySelector("p")!.textContent).toBe("message");

    p.win.history.back();
    await until(() => p.here() === "/");
    expect((await p.route()).name).toBe("home");
    expect(p.title()).toBe("Home");
  });

  it("navigates from a template command, and a query-only change on a route that asks for it replaces the entry", async () => {
    const p = await page("/");
    const before = p.entries();

    p.click(p.button("two"));
    await until(() => p.here() === "/inbox/2");
    expect(p.entries()).toBe(before + 1);

    p.click(p.button("unread"));
    await until(() => p.here() === "/inbox?tab=unread");
    expect(p.entries()).toBe(before + 2);
    expect(p.title()).toBe("Inbox unread");

    p.click(p.button("all"));
    await until(() => p.here() === "/inbox?tab=all");
    expect(p.entries()).toBe(before + 2); // `replace(…)` rewrote the entry
    expect(p.title()).toBe("Inbox all");
  });

  it("refuses a link while the route being left says no, and takes it once it says yes", async () => {
    const p = await page("/inbox/new");

    await p.edit(true);
    p.click(p.link("/inbox/1"));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(p.here()).toBe("/inbox/new");
    expect((await p.route()).name).toBe("compose");

    await p.edit(false);
    p.click(p.link("/inbox/1"));
    await until(() => p.here() === "/inbox/1");
  });

  it("undoes a Back the route being left refuses: the address and the screen stay, and the entry count does not grow", async () => {
    const p = await page("/");

    p.click(p.link("/inbox/new"));
    await until(() => p.here() === "/inbox/new");
    await p.edit(true);

    const entries = p.entries();

    p.win.history.back();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(p.here()).toBe("/inbox/new");
    expect((await p.route()).name).toBe("compose");
    expect(p.entries()).toBe(entries);

    await p.edit(false);
    p.win.history.back();
    await until(() => p.here() === "/");
    expect((await p.route()).name).toBe("home");
  });

  it("sends a link to a guarded route to where its guard says: the sign-in page, as the address and the screen", async () => {
    const p = await page("/", "guest");

    p.click(p.link("/secret"));
    await until(() => p.here() === "/login");
    expect((await p.route()).name).toBe("login");
    expect(p.title()).toBe("Sign in");

    const member = await page("/", "member");

    member.click(member.link("/secret"));
    await until(() => member.here() === "/secret");
  });

  it("applies a guard to programmatic navigation too: refused while the route being left says no", async () => {
    const p = await page("/inbox/new");

    await p.edit(true);
    p.click(p.button("two"));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(p.here()).toBe("/inbox/new");
    await p.edit(false);
    p.click(p.button("two"));
    await until(() => p.here() === "/inbox/2");
  });

  it("shows the not-found route for an address nothing matches, with its title, and the address stays", async () => {
    const p = await page("/nowhere");

    expect((await p.route()).name).toBe("notFound");
    await until(() => p.title() === "Not found");
    expect(p.title()).toBe("Not found");
    expect(p.here()).toBe("/nowhere");
  });
});
