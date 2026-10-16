// `vlx info`: the project, read from its files. Run against what `vlx init` makes, so the answers are the ones a new project's author gets.
import { afterEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";
import { info, render } from "../src/info.js";
import { plan } from "../src/init.js";
import { cleanup, project } from "./fixture.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0" } as const;
const scaffolded = (targets: ReadonlyArray<"web" | "desktop"> = ["web"]): string =>
  project(Object.fromEntries([...plan({ ...answers, targets }).files].filter(([name]) => name !== "package.json" && name !== "valance.json")));

const printed = async (args: ReadonlyArray<string>, cwd: string): Promise<{ readonly code: number; readonly out: string }> => {
  const lines: Array<string> = [];

  vi.spyOn(console, "log").mockImplementation((line: unknown) => {
    lines.push(String(line));
  });

  const code = await main(args, cwd);

  return { code, out: lines.join("\n") };
};

describe("vlx info", () => {
  it("says what a new web project is: how pages are delivered, its routes and the file for each, its styles and components", async () => {
    const found = await info(scaffolded());

    expect(found.targets).toEqual(["web"]);
    expect(found.web).toMatchObject({ base: "/", rendering: "static", headers: true, announce: true });
    expect(found.routes.map((each) => [each.address, each.file, each.delivery])).toEqual([
      ["/", "content/index.md", "static"],
      ["/guide/getting-started", "content/guide/getting-started.md", "static"],
      ["/guide/writing-pages", "content/guide/writing-pages.md", "static"],
    ]);
    expect(found.notFound).toBe("content/404.md");
    expect(found.stylesheets).toEqual([{ file: "src/styles.css" }, { file: "src/theme-toggle.css", scope: "theme-toggle" }]); // the toggle owns its look
    expect(found.components.map((each) => each.name)).toEqual(["layout", "theme-toggle"]);
    expect(found.tags["web"]).toBeGreaterThan(20);
    expect(found.problems).toEqual([]);
  }, 60_000);

  it("writes addresses under the base, and lists only the web's stylesheets in a project of two targets", async () => {
    const root = scaffolded(["web", "desktop"]);
    const found = await info(root);

    expect(found.targets).toEqual(["web", "desktop"]);
    expect(found.stylesheets).toEqual([{ file: "src/web/styles.css" }, { file: "src/web/theme-toggle.css", scope: "theme-toggle" }]);
    expect(found.components.map((each) => `${each.target}:${each.name}`)).toEqual(expect.arrayContaining(["web:layout", "desktop:layout"]));
  }, 60_000);

  it("is a report, as text and as JSON, and --tags is the vocabulary tables", async () => {
    const root = scaffolded();
    const text = await printed(["info"], root);

    expect(text.code).toBe(0);
    expect(text.out).toContain("pages are static");
    expect(text.out).toContain("/guide/getting-started  content/guide/getting-started.md");
    expect(text.out).toContain("src/styles.css");
    expect(text.out).toContain("theme-toggle (");

    const json = await printed(["info", "--json"], root);

    expect(JSON.parse(json.out)).toMatchObject({ name: "Test", web: { rendering: "static" } });

    const tags = await printed(["info", "--tags"], root);

    expect(tags.out).toContain("| `textfield` |");
    expect(tags.out).toContain("**Desktop**");
  }, 120_000);

  it("keeps reporting when a file is wrong, and says it is a problem for vlx check", async () => {
    const root = project({ "content/index.md": "---\ntitle: Home\n---\n\n# Home\n\n[x](/nowhere)\n" });
    const found = await info(root);

    expect(found.routes).toEqual([]);
    expect(found.problems.map((each) => each.code)).toEqual(["link-broken"]);
    expect(render(found)).toContain("vlx check lists them");
    expect((await printed(["info"], root)).code).toBe(1);
  }, 60_000);
});
