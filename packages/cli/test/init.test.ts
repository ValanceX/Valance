import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { INIT_HELP, parseInit } from "../src/args.js";
import { main } from "../src/cli.js";
import { detectPackageManager, directoryFor, directoryProblem, execute, nameProblem, packageName, plan, scaffold, titleOf } from "../src/init.js";
import type { Answers } from "../src/init.js";
import { canAsk, canDraw } from "../src/tty.js";
import { cleanup } from "./fixture.js";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const made: Array<string> = [];

const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "vlx-init-"));

  made.push(dir);

  return dir;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();

  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const answers = (dir: string, patch: Partial<Answers> = {}): Answers => ({
  name: "My Notes",
  dir,
  targets: ["web"],
  web: { base: "", url: "" },
  packageManager: "npm",
  install: false,
  git: false,
  ...patch,
});

/** Links the package into a scaffolded project, the way an install would. */
const linked = (dir: string): string => {
  mkdirSync(join(dir, "node_modules", "@valancex"), { recursive: true });
  symlinkSync(PACKAGE, join(dir, "node_modules", "@valancex", "cli"), process.platform === "win32" ? "junction" : "dir");
  symlinkSync(fileURLToPath(new URL("../../common", import.meta.url)), join(dir, "node_modules", "@valancex", "common"), process.platform === "win32" ? "junction" : "dir");
  symlinkSync(
    realpathSync(fileURLToPath(new URL("../node_modules/effect", import.meta.url))),
    join(dir, "node_modules", "effect"),
    process.platform === "win32" ? "junction" : "dir",
  );

  return dir;
};

const quiet = () => ({ out: vi.spyOn(console, "log").mockImplementation(() => undefined), err: vi.spyOn(console, "error").mockImplementation(() => undefined) });

describe("names", () => {
  it("makes a package name and a directory from what is typed, and refuses what cannot be a name", () => {
    expect(packageName("My Notes!")).toBe("my-notes");
    expect(packageName("***")).toBe("app");
    expect(titleOf("../x/My Notes")).toBe("My Notes");
    expect(directoryFor("My Notes", "/work")).toBe("/work/my-notes");
    expect(directoryFor("./site", "/work")).toBe("/work/site");
    expect(directoryFor("a/b", "/work")).toBe("/work/a/b");
    expect(nameProblem("")).toMatch(/needs a name/);
    expect(nameProblem('say "hi"')).toMatch(/quotes/);
    expect(nameProblem("Notes")).toBeUndefined();
  });

  it("refuses a directory with something in it, and takes an empty or absent one (a .git is not something)", () => {
    const dir = scratch();

    expect(directoryProblem(dir)).toBeUndefined();
    expect(directoryProblem(join(dir, "absent"))).toBeUndefined();
    mkdirSync(join(dir, ".git"));
    expect(directoryProblem(dir)).toBeUndefined();
    writeFileSync(join(dir, "x"), "");
    expect(directoryProblem(dir)).toMatch(/not empty/);
  });

  it("reads the package manager from the user agent", () => {
    expect(detectPackageManager({ npm_config_user_agent: "pnpm/10.28.0 npm/? node/v22" })).toBe("pnpm");
    expect(detectPackageManager({ npm_config_user_agent: "bun/1.2" })).toBe("bun");
    expect(detectPackageManager({})).toBe("npm");
  });
});

describe("the arguments", () => {
  it("reads a name, a target flag and the options", () => {
    expect(parseInit(["my-app", "--web", "--pm", "pnpm", "--no-install", "--no-git", "--base", "/docs/", "--url", "https://x.dev", "--cli", "^1.0.0", "-y", "--plain"])).toEqual({
      name: "my-app",
      targets: ["web"],
      yes: true,
      plain: true,
      packageManager: "pnpm",
      install: false,
      git: false,
      base: "/docs/",
      url: "https://x.dev",
      cli: "^1.0.0",
    });
    expect(parseInit([])).toEqual({ targets: [], yes: false, plain: false });
  });

  it("says what is wrong", () => {
    expect(parseInit(["a", "b"])).toMatch(/one name/);
    expect(parseInit(["--pm", "deno"])).toMatch(/--pm needs/);
    expect(parseInit(["--base"])).toMatch(/--base needs a value/);
    expect(parseInit(["--nope"])).toMatch(/unknown option/);
    expect(INIT_HELP).toContain("--web");
  });
});

describe("the interface is for a terminal", () => {
  it("draws only on a TTY outside CI, and asks only when it can read keys too", () => {
    const tty = { isTTY: true };

    expect(canDraw({ stdout: tty, env: {} })).toBe(true);
    expect(canDraw({ stdout: tty, env: { CI: "true" } })).toBe(false);
    expect(canDraw({ stdout: tty, env: { TERM: "dumb" } })).toBe(false);
    expect(canDraw({ stdout: {}, env: {} })).toBe(false);
    expect(canAsk({ stdout: tty, stdin: tty, env: {} })).toBe(true);
    expect(canAsk({ stdout: tty, stdin: {}, env: {} })).toBe(false);
  });
});

describe("the scaffold", () => {
  it("writes the web template, the project files and a package.json that runs vlx", () => {
    const dir = scratch();
    const written = scaffold(answers(join(dir, "my-notes"), { cli: "^1.2.3" }));

    expect(written).toEqual(
      expect.arrayContaining([
        ".gitignore",
        "README.md",
        "content/index.md",
        "package.json",
        "public/logo.svg",
        "src/layout.mprx",
        "src/main.ts",
        "src/theme-toggle.ts",
        "valance.json",
      ]),
    );
    expect(written).not.toContain("valance.web.json");
    expect(JSON.parse(readFileSync(join(dir, "my-notes", "valance.json"), "utf8"))).toMatchObject({ version: 1, name: "My Notes" });
    expect(readFileSync(join(dir, "my-notes", "content/index.md"), "utf8")).toContain("title: My Notes");

    const manifest = JSON.parse(readFileSync(join(dir, "my-notes", "package.json"), "utf8")) as Record<string, any>;

    expect(manifest["name"]).toBe("my-notes");
    expect(manifest["scripts"]).toMatchObject({ dev: "vlx dev", build: "vlx build", check: "vlx check" });
    expect(manifest["dependencies"]).toMatchObject({ effect: expect.stringMatching(/^\^\d/) });
    expect(Object.keys(manifest["dependencies"]).sort()).toEqual(["@valancex/common", "effect"]);
    expect(manifest["devDependencies"]["@valancex/cli"]).toBe("^1.2.3");
    expect(manifest["devDependencies"]["@valancex/mesh-lsp"]).toMatch(/^\^\d/);
  });

  it("writes valance.web.json only when the web settings are not the defaults, and says so in the README", () => {
    const set = plan(answers("/x/site", { web: { base: "/docs/", url: "https://example.com" } })).files;

    expect(JSON.parse(set.get("valance.web.json")!)).toMatchObject({ version: 1, base: "/docs/", url: "https://example.com" });
    expect(set.get("README.md")).toContain("base /docs/");
    expect(plan(answers("/x/site", { web: { base: "/", url: "" } })).files.has("valance.web.json")).toBe(false);
    expect(plan(answers("/x/site", { web: { base: "/", url: "https://example.com" } })).files.get("valance.web.json")).not.toContain('"base"');
  });

  it("uses the run command of the package manager, and refuses a directory with something in it", () => {
    const dir = scratch();

    expect(plan(answers(join(dir, "a"), { packageManager: "pnpm" })).files.get("README.md")).toContain("$ pnpm dev");
    expect(plan(answers(join(dir, "a"), { packageManager: "npm" })).files.get("README.md")).toContain("$ npm run dev");
    writeFileSync(join(dir, "taken"), "");
    expect(() => scaffold(answers(dir))).toThrow(/not empty/);
  });

  it("makes a project that passes `vlx check` and builds a site", async () => {
    const dir = join(scratch(), "built");

    scaffold(answers(dir));
    linked(dir);
    quiet();

    expect(await main(["check"], dir)).toBe(0);
    expect(await main(["build"], dir)).toBe(0);
    expect(existsSync(join(dir, "dist", "index.html"))).toBe(true);
    expect(readFileSync(join(dir, "dist", "index.html"), "utf8")).toContain("My Notes");
  });

  it.skipIf(process.platform === "win32")("reports each step, and a failed install is a note, not a failure of the whole", async () => {
    const dir = join(scratch(), "steps");
    const bin = scratch();
    const seen: Array<string> = [];

    // An `npm` that fails: what a project that cannot be installed (an unpublished package) gets from the real one.
    writeFileSync(join(bin, "npm"), "#!/bin/sh\necho 'npm error 404 not found' >&2\nexit 1\n", { mode: 0o755 });
    vi.stubEnv("PATH", `${bin}:${process.env["PATH"] ?? ""}`);

    const outcome = await execute(answers(dir, { install: true, git: true, packageManager: "npm" }), (step, state) => {
      seen.push(`${step}:${state}`);
    });

    vi.unstubAllEnvs();
    expect(outcome.files.length).toBeGreaterThan(5);
    expect(seen.slice(0, 2)).toEqual(["files:start", "files:done"]);
    expect(seen).toContain("install:failed");
    expect(outcome.installed).toBe(false);
    expect(outcome.notes.join(" ")).toMatch(/not installed/);
    expect(existsSync(join(dir, "package.json"))).toBe(true);
  });
});

describe("vlx init, without a terminal", () => {
  it("needs a name and a target, since it cannot ask", async () => {
    const { err } = quiet();
    const dir = scratch();

    expect(await main(["init"], dir)).toBe(2);
    expect(err.mock.calls.flat().join("\n")).toMatch(/needs a name/);
    expect(await main(["init", "x"], dir)).toBe(2);
    expect(err.mock.calls.flat().join("\n")).toMatch(/choose a target/);
    expect(await main(["init", "x", "--pm", "deno"], dir)).toBe(2);
    expect(await main(["init", "--help"], dir)).toBe(0);
  });

  it("makes the application from flags, in the directory its name says, and refuses one that exists", async () => {
    const { out, err } = quiet();
    const dir = scratch();

    expect(await main(["init", "site", "--web", "--no-install", "--no-git"], dir)).toBe(0);
    expect(existsSync(join(dir, "site", "src", "main.ts"))).toBe(true);
    expect(out.mock.calls.flat().join("\n")).toMatch(/created site in .*site \(\d+ files\)/);
    expect(await main(["init", "site", "--web", "--no-install", "--no-git"], dir)).toBe(1);
    expect(err.mock.calls.flat().join("\n")).toMatch(/not empty/);
  });

  it("--yes takes every target and every default", async () => {
    quiet();

    const dir = scratch();

    expect(await main(["init", "everything", "--yes", "--no-install", "--no-git"], dir)).toBe(0);
    expect(existsSync(join(dir, "everything", "valance.json"))).toBe(true);
  });
});

describe("a global vlx", () => {
  it("hands dev, build and check to the cli installed in the project, and runs itself when that is itself", async () => {
    const { out } = quiet();
    const root = scratch();

    writeFileSync(join(root, "valance.json"), '{ "name": "T" }');

    const local = join(root, "node_modules", "@valancex", "cli");

    mkdirSync(join(local, "dist"), { recursive: true });
    writeFileSync(join(local, "package.json"), JSON.stringify({ name: "@valancex/cli", version: "9.9.9", type: "module", exports: { "./package.json": "./package.json" } }));
    writeFileSync(join(local, "dist", "cli.js"), "export const main = async (args, cwd) => { console.log(`local ${args.join(' ')}`); return 7; };\n");

    expect(await main(["check", "--json"], root)).toBe(7);
    expect(out.mock.calls.flat().join("\n")).toContain("local check --json");
    // `init` and `--version` are the global command's own.
    expect(await main(["--version"], root)).toBe(0);

    // Linked to this very package: nothing to hand over.
    const own = scratch();

    writeFileSync(join(own, "valance.json"), '{ "name": "T" }');
    linked(own);
    out.mockClear();
    expect(await main(["check", "--json"], own)).not.toBe(7);
  }, 60_000);
});
