import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { componentProblem, generateComponent, generatePage, pageName, register } from "../src/add.js";
import { check } from "../src/check.js";
import { main } from "../src/cli.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const read = (root: string, file: string): string => readFileSync(join(root, file), "utf8");
const BASE = { "content/index.md": PAGE("Home") };
const MAIN = 'import { component, defineApp } from "@valancex/common";\nimport layout from "./layout.mprx";\n\nexport default defineApp({\n  layout: component(layout),\n});\n';
const LAYOUT = '<shell class="x" theme="light"><para class="p">hi</para></shell>';

describe("vlx generate page", () => {
  it("writes the page with its front matter, from whatever form of the path was typed", () => {
    const root = project(BASE);

    expect(pageName("/guide/getting-started.md")).toBe("guide/getting-started");
    expect(generatePage(root, "/guide/getting-started").created).toEqual(["content/guide/getting-started.md"]);
    expect(read(root, "content/guide/getting-started.md")).toBe("---\ntitle: Getting started\n---\n\n# Getting started\n\nWrite here.\n");
    expect(generatePage(root, "faq", "Questions").created).toEqual(["content/faq.md"]);
    expect(read(root, "content/faq.md")).toContain("title: Questions");
  });

  it("refuses an address that is not one, and a page that exists, and writes nothing", () => {
    const root = project(BASE);

    expect(() => generatePage(root, "")).toThrow(/needs a path/);
    expect(() => generatePage(root, "a b")).toThrow(/cannot be a page's address/);
    expect(() => generatePage(root, "../x")).toThrow(/cannot be a page's address/);
    expect(() => generatePage(root, "index")).toThrow(/already exists/);
    expect(read(root, "content/index.md")).toContain("Home");
  });

  it("makes a page that vlx check accepts", async () => {
    const root = project(BASE);

    generatePage(root, "guide/a");
    expect((await check(root)).diagnostics).toEqual([]);
  });
});

describe("vlx generate component", () => {
  it("writes the template and its definition, creates src/main.ts when there is none, and the result checks clean", async () => {
    const root = project(BASE);
    const made = generateComponent(root, "post-card");

    expect(made.created).toEqual(["src/post-card.mprx", "src/post-card.ts", "src/main.ts"]);
    expect(read(root, "src/main.ts")).toBe(
      'import { defineApp } from "@valancex/common";\nimport postCard from "./post-card.js";\n\nexport default defineApp({\n  components: [postCard],\n});\n',
    );
    expect(read(root, "src/post-card.ts")).toContain('import template from "./post-card.mprx";');
    expect((await check(root)).diagnostics).toEqual([]);
  });

  it("registers it in an existing main.ts: after the last import, in a new components list", async () => {
    const root = project({ ...BASE, "src/main.ts": MAIN, "src/layout.mprx": LAYOUT });
    const made = generateComponent(root, "callout");

    expect(made.changed).toEqual(["src/main.ts"]);
    expect(read(root, "src/main.ts")).toBe(
      'import { component, defineApp } from "@valancex/common";\nimport layout from "./layout.mprx";\nimport callout from "./callout.js";\n\nexport default defineApp({\n  components: [callout],\n  layout: component(layout),\n});\n',
    );
    expect((await check(root)).diagnostics).toEqual([]);
  });

  it("adds to a components list that is there, written on one line or many", () => {
    expect(register('import a from "./a.js";\nexport default defineApp({ components: [a] });\n', "b", "b")).toContain("components: [a, b]");
    expect(register('import a from "./a.js";\nexport default defineApp({ components: [] });\n', "b", "b")).toContain("components: [b]");
    expect(register('import a from "./a.js";\nexport default defineApp({\n  components: [\n    a,\n  ],\n});\n', "b", "b")).toContain("components: [\n    a,\n    b,\n  ]");
    expect(register("export default defineApp(definition);\n", "b", "b")).toBeUndefined();
    expect(register("const x = { components: [[a]] };\nexport default defineApp({ components: [[a]] });\n", "b", "b")).toBeUndefined();
  });

  it("leaves a main.ts it cannot edit alone, and says what to add", () => {
    const root = project({ ...BASE, "src/main.ts": "export default defineApp(definition);\n" });
    const made = generateComponent(root, "callout");

    expect(made.created).toEqual(["src/callout.mprx", "src/callout.ts"]);
    expect(made.changed).toEqual([]);
    expect(made.notes.join("\n")).toMatch(/add it to src\/main.ts yourself/);
    expect(read(root, "src/main.ts")).toBe("export default defineApp(definition);\n");
  });

  it("refuses a name that is not a tag, is taken, or is the framework's, and writes nothing", () => {
    const root = project({ ...BASE, "src/main.ts": MAIN, "src/layout.mprx": LAYOUT });

    expect(componentProblem("Callout")).toMatch(/cannot be a tag/);
    expect(componentProblem("layout")).toMatch(/page's shell/);
    expect(componentProblem("para")).toMatch(/already a tag/);
    expect(componentProblem("blocks")).toMatch(/built-in/);
    expect(() => generateComponent(root, "layout")).toThrow();
    generateComponent(root, "callout");
    expect(() => generateComponent(root, "callout")).toThrow(/already exists/);
    expect(existsSync(join(root, "src/blocks.mprx"))).toBe(false);
  });

  it("is used by writing its tag, and then it is part of the program", async () => {
    const root = project({ ...BASE, "src/main.ts": MAIN, "src/layout.mprx": LAYOUT });

    generateComponent(root, "callout");
    expect((await check(root)).components).not.toContain("callout");

    writeFileSync(join(root, "src/layout.mprx"), '<shell class="x" theme="light"><callout><para class="p">hi</para></callout></shell>');

    const checked = await check(root);

    expect(checked.diagnostics).toEqual([]);
    expect(checked.components).toContain("callout");
  });
});

describe("the command", () => {
  const quiet = () => ({ out: vi.spyOn(console, "log").mockImplementation(() => undefined), err: vi.spyOn(console, "error").mockImplementation(() => undefined) });

  it("generates, says what it made, and answers a mistake with 1 and a bad invocation with 2", async () => {
    const root = project(BASE);
    const { out, err } = quiet();

    expect(await main(["generate", "page", "guide/a"], root)).toBe(0);
    expect(out.mock.calls.flat().join("\n")).toContain("vlx generate: created content/guide/a.md");
    expect(await main(["g", "page", "guide/a"], root)).toBe(1);
    expect(err.mock.calls.flat().join("\n")).toContain("already exists");
    expect(await main(["generate", "widget", "x"], root)).toBe(2);
    expect(await main(["generate", "page"], root)).toBe(2);
    expect(await main(["generate", "page", "x", "--title", "An X"], root)).toBe(0);
    expect(read(root, "content/x.md")).toContain("title: An X");
  });

  it("answers help for each command, and for one that does not exist", async () => {
    const { out, err } = quiet();

    expect(await main(["help"], process.cwd())).toBe(0);
    expect(out.mock.calls.flat().join("\n")).toContain("generate page|component <name>");
    out.mockClear();
    expect(await main(["help", "generate"], process.cwd())).toBe(0);
    expect(out.mock.calls.flat().join("\n")).toContain("vlx generate component post-card");
    out.mockClear();
    expect(await main(["dev", "--help"], process.cwd())).toBe(0);
    expect(out.mock.calls.flat().join("\n")).toContain("Serve the project");
    expect(await main(["help", "nope"], process.cwd())).toBe(2);
    expect(err.mock.calls.flat().join("\n")).toContain('no command "nope"');
  });
});
