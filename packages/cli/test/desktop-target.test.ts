// A desktop project: what `vlx init --desktop` makes is checked, built to an engine, and the built engine is run behind the host protocol like the window would run it.
import { execFileSync, spawn } from "node:child_process";
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

describe("the built engine", () => {
  it("is minified (W10) and keeps its names: half the bytes of the unminified bundle, and the errors it throws are still called what they are", async () => {
    const root = scaffolded();

    await build(root);

    const engine = readFileSync(join(root, "dist/desktop/engine.mjs"), "utf8");

    // The unminified engine of this project was 753 kB; a minified one is under 450 kB in under 200 lines.
    expect(engine.length).toBeLessThan(450_000);
    // an unminified engine is some twenty thousand lines
    expect(engine.split("\n").length).toBeLessThan(200);
    expect(engine).toContain("ValanceError");
  });
});

describe("vlx init --desktop", () => {
  it("makes a project with the desktop's marker file, its own layout and no web files", () => {
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
    expect(parseInit(["x", "--web", "--desktop"])).toMatchObject({ targets: ["web", "desktop"] });
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

    expect(built.files).toEqual(["desktop/engine.mjs", "desktop/mesh-runtime.wasm"]);
    expect(existsSync(join(built.dir, "desktop", "engine.mjs"))).toBe(true);
    expect(readFileSync(join(built.dir, "desktop", "engine.mjs"), "utf8")).not.toContain("port-web");

    const child = spawn(process.execPath, [join(built.dir, "desktop", "engine.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
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

describe.skipIf(process.platform !== "linux")("vlx package --desktop", () => {
  it("packs the engine into one executable beside the window, and the executable runs the application over the wire", async () => {
    const { packageDesktop } = await import("../src/package.js");
    const { chmodSync, mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const root = scaffolded();
    const window = join(mkdtempSync(join(tmpdir(), "vlx-win-")), "vlx-window");

    writeFileSync(window, "#!/bin/sh\nexit 0\n");
    chmodSync(window, 0o755);

    const packaged = await packageDesktop(root, { window, archive: true });

    expect([...packaged.files].sort()).toEqual(["../Test-linux-x64.tar.gz", "../Test-linux-x64.tar.gz.sha256", "Test", "vlx-engine"]);
    expect(packaged.notes.join(" ")).toMatch(/unsigned/);

    // the archive is the package as one file, and its checksum is of that file
    const { createHash } = await import("node:crypto");
    const archive = readFileSync(join(packaged.dir, "..", "Test-linux-x64.tar.gz"));

    expect(readFileSync(join(packaged.dir, "..", "Test-linux-x64.tar.gz.sha256"), "utf8")).toBe(`${createHash("sha256").update(archive).digest("hex")}  Test-linux-x64.tar.gz\n`);
    expect(
      execFileSync("tar", ["-tzf", join(packaged.dir, "..", "Test-linux-x64.tar.gz")])
        .toString()
        .split("\n"),
    ).toEqual(expect.arrayContaining(["Test-linux-x64/Test", "Test-linux-x64/vlx-engine"]));

    const child = spawn(join(packaged.dir, "vlx-engine"), [], { stdio: ["pipe", "pipe", "inherit"] });
    const seen: Array<{ readonly op: string; readonly [key: string]: unknown }> = [];

    createInterface({ input: child.stdout }).on("line", (line) => void seen.push(JSON.parse(line)));

    for (let tries = 0; !seen.some((message) => message.op === "draw"); tries += 1) {
      if (tries > 1500) {
        throw new Error(`timed out; saw ${JSON.stringify(seen).slice(0, 300)}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    expect(seen[0]).toMatchObject({ op: "hello", protocol: 1 });
    expect(JSON.stringify(seen.find((message) => message.op === "draw"))).toContain("Getting started");
    child.stdin.write('{"op":"close"}\n');
    expect(await new Promise((resolve) => child.on("exit", resolve))).toBe(0);
  }, 240_000);

  it("says what is missing: no window program, no desktop target", async () => {
    const { packageDesktop } = await import("../src/package.js");
    const { AppError } = await import("../src/diagnostics.js");
    const root = scaffolded();

    process.env["VLX_WINDOW"] = "/nonexistent/vlx-window";
    await expect(packageDesktop(root, {})).rejects.toBeInstanceOf(AppError);
    delete process.env["VLX_WINDOW"];
    await expect(packageDesktop(project({ "content/index.md": "---\ntitle: H\n---\n\n# H\n" }))).rejects.toThrow(/no desktop target|window/);
  }, 120_000);
});
