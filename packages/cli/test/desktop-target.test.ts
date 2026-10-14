// A desktop project: what `vlx init --desktop` makes is checked, built to an engine, and the built engine is run behind the host protocol like the window would run it.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterEach, describe, expect, it } from "vitest";

import { parseInit } from "../src/args.js";
import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { plan } from "../src/init.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0" } as const;
const scaffolded = (): string =>
  project(Object.fromEntries([...plan({ ...answers, targets: ["desktop"] }).files].filter(([name]) => name !== "package.json" && name !== "valance.json")));

describe("vlx init --desktop", () => {
  it("makes a project with the desktop's marker file, its own layout and no web files, and one target only", () => {
    const { files } = plan({ ...answers, targets: ["desktop"] });

    expect([...files.keys()].sort()).toEqual([
      ".gitignore",
      "README.md",
      "content/404.md",
      "content/guide/getting-started.md",
      "content/index.md",
      "package.json",
      "src/layout.mprx",
      "src/main.ts",
      "tsconfig.json",
      "valance.desktop.json",
      "valance.json",
    ]);
    expect(() => plan({ ...answers, targets: ["web", "desktop"] })).toThrow(/one target/);
    expect(parseInit(["x", "--web", "--desktop"])).toMatch(/one target/);
    expect(parseInit(["x", "--desktop"])).toMatchObject({ targets: ["desktop"] });
  });
});

describe("a desktop project", () => {
  it("checks clean", async () => {
    const result = await check(scaffolded());

    expect(result.diagnostics).toEqual([]);
    expect(result.pages).toBe(2);
  }, 120_000);

  it("rejects a web tag in a template, against the desktop's vocabulary", async () => {
    const root = scaffolded();
    const { writeFileSync } = await import("node:fs");

    writeFileSync(join(root, "src/layout.mprx"), '<div class="x"><blocks items={blocks} /></div>');

    const result = await check(root);

    expect(result.diagnostics.length).toBeGreaterThan(0);
  }, 120_000);

  it("builds to an engine that says hello, draws the page and follows a link", async () => {
    const root = scaffolded();
    const built = await build(root);

    expect(built.files).toEqual(["engine.mjs", "mesh-runtime.wasm"]);
    expect(existsSync(join(built.dir, "engine.mjs"))).toBe(true);
    expect(readFileSync(join(built.dir, "engine.mjs"), "utf8")).not.toContain("port-web");

    const child = spawn(process.execPath, [join(built.dir, "engine.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
    const seen: Array<{ readonly op: string; readonly [key: string]: unknown }> = [];

    createInterface({ input: child.stdout }).on("line", (line) => void seen.push(JSON.parse(line)));

    const until = async (done: () => boolean): Promise<void> => {
      for (let tries = 0; !done(); tries += 1) {
        if (tries > 1000) {
          throw new Error(`timed out; saw ${JSON.stringify(seen).slice(0, 400)}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };

    await until(() => seen.some((message) => message.op === "draw"));
    expect(seen[0]).toMatchObject({ op: "hello", protocol: 1 });
    expect(seen.find((message) => message.op === "title")).toMatchObject({ title: "Notes · Test" });
    expect(JSON.stringify(seen.find((message) => message.op === "draw"))).toContain("Getting started");

    child.stdin.write(`${JSON.stringify({ op: "link", href: "/guide/getting-started" })}\n`);
    await until(() => seen.some((message) => message.op === "title" && String(message["title"]).startsWith("Getting started")));
    child.stdin.write(`${JSON.stringify({ op: "close" })}\n`);
    expect(await new Promise((resolve) => child.on("exit", resolve))).toBe(0);
  }, 180_000);
});
