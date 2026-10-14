import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

import type { InitArgs } from "../src/args.js";
import type { Answers, Outcome, Progress, Step } from "../src/init.js";
import type { execute as defaultExecute } from "../src/init.js";
import { Wizard } from "../src/ui/init.js";
import type { Result } from "../src/ui/init.js";
import { BuildProgress, CheckResult, DevScreen, Diagnostics } from "../src/ui/report.js";

const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const ENTER = "\r";
const DOWN = "\u001B[B";

const args = (patch: Partial<InitArgs> = {}): InitArgs => ({ targets: [], yes: false, plain: false, ...patch });

/** A wizard whose work is a recording, so the questions are the only thing under test. */
const wizard = (given: InitArgs) => {
  const ran: Array<Answers> = [];
  const finished: Array<Result> = [];
  const execute = vi.fn<typeof defaultExecute>(async (answers: Answers, report: (step: Step, state: Progress) => void = () => undefined): Promise<Outcome> => {
    ran.push(answers);
    report("files", "start");
    report("files", "done");
    report("install", answers.install ? "done" : "skipped");
    report("git", answers.git ? "done" : "skipped");

    return { files: ["a", "b"], installed: answers.install, git: answers.git, notes: [] };
  });
  const shown = render(<Wizard args={given} cwd="/work" detected="pnpm" version="1.2.3" execute={execute} onFinish={(result) => finished.push(result)} />);
  const type = async (text: string): Promise<void> => {
    for (const char of text) {
      shown.stdin.write(char);
      await tick(5);
    }
  };

  return {
    shown,
    ran,
    finished,
    type,
    key: async (sequence: string) => {
      shown.stdin.write(sequence);
      await tick();
    },
  };
};

describe("the wizard", () => {
  it("asks for the name, the targets, the web settings, the package manager, the install and git, then does the work", async () => {
    const { shown, ran, finished, type, key } = wizard(args());

    await tick();
    expect(shown.lastFrame()).toContain("What is the application called?");
    await type("my-site");
    await key(ENTER);
    expect(shown.lastFrame()).toContain("Which target is it for?");
    expect(shown.lastFrame()).toContain("❯ Web");
    await key(ENTER);
    expect(shown.lastFrame()).toContain("where is the site served?");
    await type("/docs/");
    await key(ENTER);
    expect(shown.lastFrame()).toContain("where is it published?");
    await type("https://example.com");
    await key(ENTER);
    expect(shown.lastFrame()).toContain("Which package manager?");
    expect(shown.lastFrame()).toContain("(running this)");
    await key(DOWN);
    await key(ENTER); // pnpm is the one running this (the second choice); one down from it is yarn
    expect(shown.lastFrame()).toContain("Install the dependencies now?");
    await key("n");
    expect(shown.lastFrame()).toContain("Make a git repository?");
    await key(ENTER);
    await tick(80);

    expect(ran).toHaveLength(1);
    expect(ran[0]).toMatchObject({
      name: "my-site",
      dir: "/work/my-site",
      targets: ["web"],
      web: { base: "/docs/", url: "https://example.com" },
      packageManager: "yarn",
      install: false,
      git: true,
    });
    expect(finished).toHaveLength(1);
    expect(finished[0]!.status).toBe("done");
    // The wizard leaves when it is done, and the testing terminal then blanks its last frame: read the frames.
    const last = [...shown.frames].reverse().find((frame) => frame.includes("Created my-site"))!;

    expect(last).toContain("cd my-site");
    expect(last).toContain("yarn install");
    expect(last).toContain("yarn dev");
  });

  it("takes the defaults on Enter: my-app, the web, /, no address, the package manager that is running", async () => {
    const { ran, key } = wizard(args());

    await tick();

    for (let asked = 0; asked < 7; asked += 1) {
      await key(ENTER);
    }

    await tick(80);
    expect(ran[0]).toMatchObject({ name: "my-app", targets: ["web"], web: { base: "/", url: "" }, packageManager: "pnpm", install: true, git: true });
  });

  it("does not ask what a flag already answered", async () => {
    const { shown, ran, key } = wizard(args({ name: "given", targets: ["web"], packageManager: "bun", install: false, git: false, base: "/", url: "" }));

    await tick(80);
    expect(shown.lastFrame()).not.toContain("?");
    expect(ran[0]).toMatchObject({ name: "given", targets: ["web"], packageManager: "bun", install: false, git: false });
    expect(key).toBeDefined();
  });

  it("with --yes asks nothing and takes every target", async () => {
    const { ran } = wizard(args({ yes: true, name: "quick" }));

    await tick(80);
    expect(ran[0]).toMatchObject({ name: "quick", targets: ["web"], install: true, git: true, packageManager: "pnpm" });
  });

  it("does not let a bad answer through: a base without slashes, an address with a trailing slash", async () => {
    const { shown, ran, type, key } = wizard(args({ name: "checked" }));

    await tick();
    expect(shown.lastFrame()).toContain("Which target is it for?");
    await key(ENTER); // the web, the one the list starts on
    await type("docs");
    await key(ENTER);
    expect(shown.lastFrame()).toContain("a path that starts and ends with /");
    expect(shown.lastFrame()).toContain("where is the site served?");
    for (let each = 0; each < 4; each += 1) {
      await key("\u007F");
    }
    await type("/ok/");
    await key(ENTER);
    await type("https://example.com/");
    await key(ENTER);
    expect(shown.lastFrame()).toContain("without a trailing slash");
    expect(ran).toHaveLength(0);
  });

  it("refuses a name whose directory has something in it", async () => {
    const { shown, type, key } = wizard(args());

    await tick();
    await type("../../../../../../../../../../tmp");
    await key(ENTER);
    expect(shown.lastFrame()).toMatch(/is not empty|already|not empty/);
    expect(shown.lastFrame()).toContain("What is the application called?");
  });
});

describe("the views", () => {
  const diagnostics = [
    { file: "content/index.md", line: 7, column: 1, code: "link-broken", message: "/nowhere is not a page" },
    { file: "content/index.md", line: 9, column: 3, code: "image-missing", message: "no file logo.png" },
    { file: "valance.json", line: 0, column: 0, code: "config-name", message: "name is required" },
  ];

  it("groups mistakes by file with their line, code and message", () => {
    const frame = render(<Diagnostics diagnostics={diagnostics} />).lastFrame()!;

    expect(frame).toContain("content/index.md");
    expect(frame).toMatch(/7:1\s+link-broken \/nowhere is not a page/);
    expect(frame).toMatch(/9:3\s+image-missing/);
    expect(frame.indexOf("content/index.md")).toBe(frame.lastIndexOf("content/index.md"));
    expect(frame).toMatch(/valance\.json\n\s+config-name name is required/);
  });

  it("says no problems, or how many", () => {
    expect(render(<CheckResult result={{ diagnostics: [], pages: 3, components: ["a", "b"] }} />).lastFrame()).toContain("No problems · 3 pages, 2 components");
    expect(render(<CheckResult result={{ diagnostics, pages: 3, components: [] }} />).lastFrame()).toContain("3 problems");
    expect(render(<CheckResult result={{ diagnostics: diagnostics.slice(0, 1), pages: 1, components: [] }} />).lastFrame()).toContain("1 problem");
  });

  it("shows how far a build is", () => {
    const frame = render(<BuildProgress current="bundle" />).lastFrame()!;

    expect(frame).toMatch(/✔ Reading the configuration/);
    expect(frame).toMatch(/✔ Compiling the templates/);
    expect(frame).toMatch(/Bundling the browser code/);
    expect(frame).toMatch(/○ Writing the pages/);
  });

  it("shows the dev server's address, its mistakes and its latest reports", () => {
    const starting = render(<DevScreen state={{ open: [], lines: [], starting: true }} />).lastFrame()!;
    const running = render(
      <DevScreen state={{ url: "http://localhost:5173/", open: diagnostics.slice(0, 1), lines: ["vlx: content/index.md changed"], starting: false }} />,
    ).lastFrame()!;
    const sound = render(<DevScreen state={{ url: "http://localhost:5173/", open: [], lines: [], starting: false }} />).lastFrame()!;

    expect(starting).toContain("starting");
    expect(running).toContain("http://localhost:5173/");
    expect(running).toContain("link-broken");
    expect(running).toContain("the last good build keeps serving");
    expect(running).toContain("content/index.md changed");
    expect(sound).toContain("No problems");
    expect(sound).toContain("Ctrl+C to stop");
  });
});
