// What is the web's in the application model, and what is not? The project `vlx init` makes is compiled and run on a target that is not the web (a text one, test/text-target.ts), and compiled
// against a vocabulary without the web's styling hooks. What runs unchanged is portable; what the second vocabulary rejects is the web leaking into the templates. The findings are
// recorded in docs/application-model/PLATFORMS-HTTP-TITLES.md ("The second target").
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { application, routes, type Vocabulary, webVocabulary } from "@valancex/common/internal";
import { readContent } from "../src/content.js";
import { loadConfig } from "../src/config.js";
import { loadAuthor } from "../src/author.js";
import { compileViews } from "../src/compile.js";
import { plan } from "../src/init.js";
import { createLoader } from "../src/vite.js";
import { init } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { Effect, Scope } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { AppError } from "../src/diagnostics.js";
import { cleanup, project } from "./fixture.js";
import { textTarget } from "./text-target.js";

afterEach(cleanup);

/** The project `vlx init` makes, on disk, ready to build. */
const scaffolded = (): string => {
  const { files } = plan({ name: "Notes", dir: "/unused", targets: ["web"], web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0" });

  return project(Object.fromEntries([...files].filter(([name]) => name !== "package.json" && name !== "valance.json")));
};

const compiled = async (root: string, vocabulary: Vocabulary = webVocabulary) => {
  const config = loadConfig(root);
  const loader = await createLoader(root, config);

  try {
    const author = await loadAuthor(loader, root);

    return { config, author, built: await compileViews(root, author, vocabulary) };
  } finally {
    await loader.close();
  }
};

describe("the application model on a target that is not the web", () => {
  it("runs the scaffolded project unchanged: its content, its layout, its component, its state and its command", async () => {
    const root = scaffolded();
    const { config, author, built } = await compiled(root);
    const content = readContent(root, config);

    await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

    const scope = await Effect.runPromise(Scope.make());
    const app = application(content, built.program, author);
    const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
    const factory = textTarget();
    let target: ReturnType<typeof factory> | undefined;

    await Effect.runPromise(Valance.mount(handle, (report) => (target = factory(report))).pipe(Scope.extend(scope)));

    const first = target!.screen();

    expect(first).toContain("Notes");
    expect(first).toContain("Dark"); // the theme toggle's label while the theme is light
    expect(first).toContain("{click}");

    target!.activate("Dark");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await Effect.runPromise(handle.state)).toMatchObject({ theme: "dark" });
    expect(target!.screen()).toContain("Light");
    await Effect.runPromise(Scope.close(scope, (await import("effect")).Exit.void));
  }, 120_000);
});

describe("navigation on a target that is not the web", () => {
  it("has links that carry an address and no event, and the application's own `go` command is what moves between pages", async () => {
    const root = scaffolded();
    const { config, author, built } = await compiled(root);
    const content = readContent(root, config);

    await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(application(content, built.program, author)).pipe(Scope.extend(scope)));
    const factory = textTarget();
    let target: ReturnType<typeof factory> | undefined;

    await Effect.runPromise(Valance.mount(handle, (report) => (target = factory(report))).pipe(Scope.extend(scope)));

    // On the web a click on `<a href>` is taken by the history listener, not by a template event: the render tree has the address and no handler. A target has nothing to report for a link.
    const links = target!
      .screen()
      .split("\n")
      .filter((line) => /^\s*<(link|a)>/.test(line));

    expect(links.length).toBeGreaterThan(0);
    expect(links.every((line) => !line.includes("{"))).toBe(true);

    // What `Web.history` does for a link, by hand: the address → the route table's navigation fact → the application's own navigate command.
    const table = routes(content);
    const other = content.pages.find((page) => page.path !== "/");

    expect(other).toBeDefined();
    await Effect.runPromise(handle.invoke("app/go", [{ value: table.stateOf(new URL(other!.path, "http://app.invalid/")).id }] as never));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await Effect.runPromise(handle.state)).toMatchObject({ page: other!.path });
    expect(target!.screen()).toContain(other!.title);
    await Effect.runPromise(Scope.close(scope, (await import("effect")).Exit.void));
  }, 120_000);
});

describe("a vocabulary without the web's styling and accessibility hooks", () => {
  /** The web's tags with the props that are the web's own (styling hooks, focus, ARIA, loading hints) removed. */
  const WEB_ONLY = ["class", "theme", "id", "tabindex", "label", "current", "pressed", "loading"];
  const neutral: Vocabulary = {
    target: "neutral",
    tags: Object.fromEntries(
      Object.entries(webVocabulary.tags).map(([tag, each]) => [
        tag,
        { ...each, props: Object.fromEntries(Object.entries(each.props ?? {}).filter(([name]) => !WEB_ONLY.includes(name))) },
      ]),
    ) as Vocabulary["tags"],
  };

  it("rejects the built-in views and the scaffolded layout where they use those hooks, and nowhere else", async () => {
    const root = scaffolded();
    const found: Array<string> = [];

    try {
      await compiled(root, neutral);
    } catch (error) {
      if (!(error instanceof AppError)) {
        throw error;
      }

      found.push(...error.diagnostics.map((each) => `${each.code}: ${each.message}`));
    }

    const leaks = new Set(found.flatMap((line) => [...line.matchAll(/no prop "(\w+)"/g)].map((match) => match[1]!)));
    expect(found.length).toBeGreaterThan(0);
    // Every complaint is one of the web's own hooks: nothing about state, commands, slots, content or the component model.
    expect([...leaks].every((name) => WEB_ONLY.includes(name))).toBe(true);
    expect(found.every((line) => line.startsWith("unknown-prop:"))).toBe(true);
    // Measured: eight props, all hooks for styling (`class`, `theme`), focus (`tabindex`), accessibility (`label`, `current`, `pressed`, `id`) or loading (`loading`).
    expect([...leaks].sort()).toEqual(["class", "current", "id", "label", "loading", "pressed", "tabindex", "theme"]);
  }, 120_000);

  it("rejects even a layout written without them, while the built-in views still use them: a built-in is part of the target's side", async () => {
    const root = project({
      "content/index.md": "---\ntitle: Home\n---\n\n# Home\n",
      "src/layout.mprx": "<div><para>{site}</para><blocks items={blocks} /></div>",
    });
    const files = readdirSync(join(root, "src")).map((name) => relative(root, join(root, "src", name)));

    expect(files).toContain("src/layout.mprx");
    expect(readFileSync(join(root, "src/layout.mprx"), "utf8")).toContain("{site}");
    await expect(compiled(root, neutral)).rejects.toBeInstanceOf(AppError);
  }, 120_000);
});
