// `vlx dev --record` and `vlx replay` (Bet 15): a page in a real browser is recorded as it is used; the log it leaves is replayed against the project by three routes; a changed log is found; and
// a production build contains none of the recorder.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { dev } from "../src/dev.js";
import { loadConfig } from "../src/config.js";
import { recordingNotice } from "../src/recording-guard.js";
import { replayFile } from "../src/replay.js";
import { cleanup, PAGE, project } from "./fixture.js";
import { browserAvailable } from "./forms-support.js";

afterEach(cleanup);

const MAIN = `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
export default defineApp({
  state: { n: field(Schema.Number, 0), name: field(Schema.String, "") },
  commands: (command) => ({
    add: command((state) => ({ ...state, n: state.n + 1 })),
    rename: command(Schema.Struct({ name: Schema.String }), ({ name }, state) => ({ ...state, name })),
  }),
  layout: component(layout),
});
`;
const LAYOUT = `<shell class="x" theme="light">
<button on.click={add()}>Add</button>
<textfield label="Name" value={name} on.change={rename($event)} />
<text>Count {n}</text>
</shell>
`;
const FILES: Record<string, string> = { "content/index.md": PAGE("Home", "Text."), "src/main.ts": MAIN, "src/layout.mprx": LAYOUT };
const port = (): number => 6200 + Math.floor(Math.random() * 600);

describe("vlx replay", () => {
  it("names what is wrong with its arguments without running anything", async () => {
    const root = project(FILES);

    expect(await replayFile(root, join(root, "nothing.jsonl"))).toMatchObject({ code: 2 });

    writeFileSync(join(root, "bad.jsonl"), '{"line":"header"}\nnot json\n');
    expect((await replayFile(root, join(root, "bad.jsonl"))).output).toContain("log line 2 is not JSON");
    expect((await replayFile(root, join(root, "bad.jsonl"), { routes: ["sideways"] })).output).toContain("--route is one or more of changes, update, render");
  });
});

describe("the guards of a recording (R16)", () => {
  it("warns when it starts: where it writes, that it holds what was typed, that nothing is redacted unless the project says, and that git would commit it", () => {
    const root = project(FILES);

    execFileSync("git", ["init", "-q"], { cwd: root });

    const notice = recordingNotice(root, join(root, "sessions", "a.jsonl"), loadConfig(root)).join("\n");

    expect(notice).toContain("WARNING");
    expect(notice).toContain(join("sessions", "a.jsonl"));
    expect(notice).toContain("what is typed and shown");
    expect(notice).toContain("Nothing is redacted");
    expect(notice).toContain("git does NOT ignore");
    // the default place is ignored by the scaffold's .gitignore, so no such line
    writeFileSync(join(root, ".gitignore"), ".valance/sessions/\n");
    expect(recordingNotice(root, join(root, ".valance", "sessions", "a.jsonl"), loadConfig(root)).join("\n")).not.toContain("git does NOT ignore");
  });

  it("names what the project redacts, and refuses a record setting it cannot read", () => {
    const root = project({ ...FILES, "valance.json": '{ "name": "Test", "record": { "redact": { "scope": [["name"]], "commands": ["layout/rename"] } } }' });

    expect(recordingNotice(root, join(root, "a.jsonl"), loadConfig(root)).join("\n")).toContain('Redacted (valance.json "record"): name, layout/rename');
    expect(() => loadConfig(project({ ...FILES, "valance.json": '{ "name": "Test", "record": { "redact": { "scope": ["name"] } } }' }))).toThrow(/redact.scope/);
    expect(() => loadConfig(project({ ...FILES, "valance.json": '{ "name": "Test", "record": { "redact": { "commands": ["rename"] } } }' }))).toThrow(/component\/name/);
    expect(() => loadConfig(project({ ...FILES, "valance.json": '{ "name": "Test", "record": { "mask": {} } }' }))).toThrow(/record/);
  });

  it("refuses to replay a log that says it holds user data until it is told, and says nothing else about it", async () => {
    const root = project(FILES);
    const log = join(root, "held.jsonl");

    writeFileSync(log, '{"line":"header","format":1,"containsUserData":true,"program":"0","manifest":"0","snapshot":{}}\n');
    expect(await replayFile(root, log)).toMatchObject({ code: 2, output: expect.stringMatching(/holds user data.*--allow-user-data/) });
    // with the flag it goes on to the program, which is not this project's
    expect((await replayFile(root, log, { allowUserData: true })).output).toContain("line 1, program");
  });
});

describe.runIf(browserAvailable)("vlx dev --record", () => {
  it("records a page as it is used, replays by three routes, finds a changed log, and a build has no recorder", { timeout: 240_000 }, async () => {
    const root = project(FILES);
    const file = join(mkdtempSync(join(tmpdir(), "vlx-record-")), "session.jsonl");
    const running = await dev(root, { port: port(), log: () => undefined, record: file });
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await page.goto(running.url);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.click('button:text-is("Add")');
      await page.waitForSelector("text=Count 1");
      await page.getByLabel("Name").fill("Ada");
      await page.click('button:text-is("Add")');
      await page.waitForSelector("text=Count 2");
      // the page is hidden: the recorder writes the last tree
      await page.goto("about:blank");
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } finally {
      await browser.close();
      await running.close();
    }

    const text = readFileSync(file, "utf8");
    const kinds = text
      .trim()
      .split("\n")
      .map((line) => (JSON.parse(line) as { line: string }).line);

    expect(kinds[0]).toBe("header");
    expect(kinds.filter((kind) => kind === "event").length).toBeGreaterThanOrEqual(3);
    expect(kinds.filter((kind) => kind === "changes").length).toBeGreaterThanOrEqual(2);
    expect(text).not.toMatch(/"base"/);

    // a recording holds user data and says so: it is not replayed until the person says they mean to read it
    expect(JSON.parse(text.split("\n")[0]!)).toMatchObject({ line: "header", containsUserData: true });
    expect(await replayFile(root, file)).toMatchObject({ code: 2, output: expect.stringContaining("--allow-user-data") });

    const replayed = await replayFile(root, file, { allowUserData: true });

    expect(replayed.output).toContain("every route gave the recorded trees and the routes agree");
    expect(replayed.code).toBe(0);

    // a log whose tree hash was changed is found, at its line
    const lines = text.trim().split("\n");
    const at = lines.findIndex((line, index) => index > 1 && line.startsWith('{"line":"tree"'));
    const changed = join(root, "changed.jsonl");

    lines[at] = JSON.stringify({ ...JSON.parse(lines[at]!), sha256: "0".repeat(64) });
    writeFileSync(changed, `${lines.join("\n")}\n`);

    const found = await replayFile(root, changed, { allowUserData: true });

    expect(found.code).toBe(1);
    expect(found.output).toContain(`line ${at + 1}, tree`);

    // a log of another program is refused, by the hashes in its header
    const header = JSON.parse(lines[0]!) as Record<string, unknown>;
    const other = join(root, "other.jsonl");

    writeFileSync(other, [JSON.stringify({ ...header, program: "0".repeat(64) }), ...lines.slice(1)].join("\n"));
    expect((await replayFile(root, other, { allowUserData: true })).output).toContain("line 1, program");

    // the project's entry has the recorder only while recording; a check or a build writes it without
    expect(readFileSync(join(root, ".valance", "client.ts"), "utf8")).toContain("@valancex/common/record");
    await check(root);
    expect(readFileSync(join(root, ".valance", "client.ts"), "utf8")).not.toContain("record");

    const built = await build(root);
    const assets = readdirSync(built.dir, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".js"));
    const bundle = assets.map((name) => readFileSync(join(built.dir, name), "utf8")).join("\n");

    expect(assets.length).toBeGreaterThan(0);
    expect(bundle).not.toContain("__vlx/record");
    expect(bundle).not.toContain("recorderError");
  });

  it("never writes a value the project marks: typed text and the command that carries it are digests, and the log still replays", { timeout: 240_000 }, async () => {
    const secret = "Ada-secret-7";
    const root = project({ ...FILES, "valance.json": '{ "name": "Test", "record": { "redact": { "scope": [["name"]], "commands": ["layout/rename"] } } }' });
    const file = join(mkdtempSync(join(tmpdir(), "vlx-record-")), "session.jsonl");
    const running = await dev(root, { port: port(), log: () => undefined, record: file });
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();

      await page.goto(running.url);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.getByLabel("Name").fill(secret);
      await page.click('button:text-is("Add")');
      await page.waitForSelector("text=Count 1");
      await page.goto("about:blank");
      await new Promise((resolve) => setTimeout(resolve, 1200));
    } finally {
      await browser.close();
      await running.close();
    }

    const text = readFileSync(file, "utf8");

    expect(text).not.toContain(secret);
    expect(text).toMatch(/"redacted":\{[^}]*"commands":\["layout\/rename"\]/);
    expect(text).toMatch(/redacted:[0-9a-f]{16}/);

    const replayed = await replayFile(root, file, { allowUserData: true });

    expect(replayed.output).toContain("every route gave the recorded trees and the routes agree");
    expect(replayed.code).toBe(0);
  });
});
