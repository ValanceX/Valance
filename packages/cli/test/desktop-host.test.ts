// The application behind a Desktop PORT window, as `@valancex/common/desktop` wires it (WP-20): the real application and the real host options, with a stand-in window on the far end of the protocol.
// What a window sends is what the Port's tests pin (`resize`, `closeRequested`, `navigate`, `link`); this is what the engine does with each, for an application with nested routes and a guard.
import { init } from "@valancex/mesh-runtime";
import { hostOptions } from "@valancex/common/desktop";
import { application, routingFor } from "@valancex/common/internal";
import { serve } from "@valancex/valance/native";
import type { Outbound } from "@valancex/valance/native";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import { loadAuthor } from "../src/author.js";
import { compileViews } from "../src/compile.js";
import { loadConfig } from "../src/config.js";
import { readContent } from "../src/content.js";
import { plan } from "../src/init.js";
import { createLoader } from "../src/vite.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;

const area = (): string => {
  const files: Record<string, string> = Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json"));

  files["src/main.ts"] = files["src/main.ts"]!.replace(
    'import { component, defineApp, field } from "@valancex/common";',
    'import { component, defineApp, field, route } from "@valancex/common";',
  )
    .replace('theme: field(Schema.Literal("light", "dark"), "light"),', 'theme: field(Schema.Literal("light", "dark"), "light"),\n    dirty: field(Schema.Boolean, false),')
    .replace(
      "export default defineApp({",
      `export default defineApp({
  routes: {
    account: route("/account", {
      children: {
        profile: route("/profile", { enter: (_input, state) => ({ ...state, dirty: true }), canDeactivate: ({ state }) => !state.dirty }),
        security: route("/security"),
      },
    }),
    home: route("/home"),
  },`,
    )
    .replace("commands: (command) => ({", "commands: (command) => ({\n    makeDirty: command((state) => ({ ...state, dirty: true })),");

  return project(files);
};

const wire = () => {
  const toEngine = new PassThrough();
  const fromEngine = new PassThrough();
  const seen: Array<Outbound> = [];

  createInterface({ input: fromEngine }).on("line", (line) => void seen.push(JSON.parse(line) as Outbound));

  return { toEngine, fromEngine, seen, send: (message: unknown) => void toEngine.write(`${JSON.stringify(message)}\n`) };
};

const until = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 600) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const started = async () => {
  const root = area();
  const config = loadConfig(root);
  const loader = await createLoader(root, config);

  try {
    const author = await loadAuthor(loader, root);
    const built = await compileViews(root, author);
    const content = readContent(root, config, routingFor(author));
    const w = wire();

    await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

    // the title messages carry the state we want to see: the window title is the page's
    // the window title is where this test reads the state from: viewport, page, route and whether the profile was edited
    const options = {
      ...hostOptions({ content, author }),
      titleOf: (state: Record<string, unknown>) => [state["viewport"], state["page"], state["route"], state["dirty"]].join("|"),
    };
    const served = Effect.runPromise(serve(application(content, built.program, author), { input: w.toEngine, output: w.fromEngine }, options as never));

    await until(() => w.seen.some((message) => message.op === "draw"));

    return {
      w,
      served,
      title: () => [...w.seen].reverse().find((message) => message.op === "title") as { title: string } | undefined,
      answers: () => w.seen.filter((message) => message.op === "closeAnswer").map((message) => (message as { allowed: boolean }).allowed),
    };
  } finally {
    await loader.close();
  }
};

describe("a window's messages, as the application receives them", () => {
  it("a width becomes the layout's room: compact, medium, expanded (WA-10)", async () => {
    const { w, served, title } = await started();
    const now = async (width: number, viewport: string) => {
      w.send({ op: "resize", width });
      await until(() => title()?.title.startsWith(`${viewport}|`) === true);
    };

    await now(500, "compact");
    await now(700, "medium");
    await now(1200, "expanded");
    w.send({ op: "close" });
    await served;
  }, 120_000);

  it("a close request on a page with nothing to ask is allowed, and the engine ends (R-64)", async () => {
    const { w, served, title, answers } = await started();

    w.send({ op: "link", href: "/home" });
    await until(() => title()?.title.includes("|/home|home|") === true);
    w.send({ op: "closeRequested" });
    await until(() => answers().length === 1);
    expect(answers()).toEqual([true]);
    await served; // an allowed answer ends the engine
  }, 120_000);

  it("a close request on a page with edits is refused and the window stays open; the guarded page cannot be left for a sibling (R-62, R-64)", async () => {
    const { w, served, title, answers } = await started();

    w.send({ op: "link", href: "/account/profile" });
    await until(() => title()?.title.includes("|/account/profile|account.profile|true") === true); // entering sets the edit flag
    w.send({ op: "closeRequested" });
    await until(() => answers().length === 1);
    expect(answers()).toEqual([false]);

    w.send({ op: "link", href: "/account/security" }); // the profile's own guard refuses leaving it
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(title()?.title).toContain("|/account/profile|account.profile|true");

    w.send({ op: "close" });
    await served;
  }, 120_000);
});
