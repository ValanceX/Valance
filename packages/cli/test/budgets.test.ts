// Budgets (Bet 3; WP8): the size report a production build prints, the project's budgets and the framework's defaults, `vlx dev` saying nothing about size, and the release check over the harness's
// measurements. Each gate is shown failing on a deliberate regression.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { loadConfig } from "../src/config.js";
import { dev } from "../src/dev.js";
import { budgetProblems, bytesOf, check, DEFAULT_BUDGETS, failure, lines } from "../src/size.js";
import type { SizeReport } from "../src/size.js";
import { cleanup, PAGE, project } from "./fixture.js";
// @ts-expect-error the release check is a script, not a module of this package
import { allowed, check as checkResults, ruleProblems } from "../../../scripts/check-budgets.mjs";

afterEach(cleanup);

const COUNTER = {
  "content/index.md": PAGE("Home", "Text."),
  "src/main.ts": `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
export default defineApp({
  state: { n: field(Schema.Number, 0) },
  commands: (command) => ({ add: command((state) => ({ ...state, n: state.n + 1 })) }),
  layout: component(layout),
});
`,
  "src/layout.mprx": `<shell class="x" theme="light"><button on.click={add()}>Add</button><text>Count {n}</text></shell>\n`,
};

const report = (startupJs: number, wasm: number, afterStart = 0): SizeReport => ({
  startup: {
    files: [
      { file: "assets/client.js", kind: "javascript", raw: startupJs * 4, brotli: startupJs },
      { file: "assets/client.css", kind: "css", raw: 100, brotli: 50 },
      { file: "assets/mesh-runtime.wasm", kind: "wasm", raw: wasm * 4, brotli: wasm },
    ],
    brotli: startupJs + 50 + wasm,
  },
  afterStart: { files: afterStart === 0 ? [] : [{ file: "assets/later.js", kind: "javascript", raw: afterStart * 4, brotli: afterStart }], brotli: afterStart },
});

describe("sizes", () => {
  it("reads a size in bytes, kB (1,000) or MB, and nothing else", () => {
    expect(bytesOf(500000)).toBe(500000);
    expect(bytesOf("500kB")).toBe(500000);
    expect(bytesOf("1.5MB")).toBe(1500000);
    expect(bytesOf("12 B")).toBe(12);
    expect(bytesOf("big")).toBeUndefined();
    expect(bytesOf(-1)).toBeUndefined();
  });

  it("says which budget a setting got wrong", () => {
    expect(budgetProblems("200kB")).toContain("must be a list");
    expect(budgetProblems([{ type: "bundle" }])).toContain('needs a "type" of initial, runtime, startup, afterStart, anyChunk');
    expect(budgetProblems([{ type: "initial", maximumError: "1MB" }])).toContain('unknown settings "maximumError"');
    expect(budgetProblems([{ type: "initial", warning: "lots" }])).toContain('"warning" must be a size');
    expect(budgetProblems([{ type: "initial", warning: "2MB", error: "1MB" }])).toContain("above the error");
    expect(budgetProblems([{ type: "initial", warning: "200kB", error: "400kB" }])).toBeUndefined();
  });

  it("holds a report to the budgets: ok, a warning above the warning, an error above the error", () => {
    const budgets = [
      { type: "initial" as const, warning: 1000, error: 2000 },
      { type: "runtime" as const, error: 5000 },
      { type: "afterStart" as const, warning: 100 },
    ];

    expect(check(report(900, 4000), budgets).map((each) => each.status)).toEqual(["ok", "ok", "ok"]);
    expect(check(report(1500, 4000, 500), budgets).map((each) => each.status)).toEqual(["warning", "ok", "warning"]);
    expect(check(report(1500, 6000), budgets).map((each) => each.status)).toEqual(["warning", "error", "ok"]);
    expect(failure(check(report(900, 6000), budgets))?.diagnostics[0]).toMatchObject({ code: "budget-exceeded", message: expect.stringContaining("WebAssembly runtime") });
    expect(failure(check(report(900, 4000), budgets))).toBeUndefined();
  });

  it("prints both sets with each file, and says when nothing loads after start", () => {
    const text = lines(report(900, 4000), check(report(900, 4000), DEFAULT_BUDGETS)).join("\n");

    expect(text).toContain("start-up (what the page cannot start without)");
    expect(text).toContain("assets/mesh-runtime.wasm");
    expect(text).toContain("after-start: nothing");
  });
});

describe("a production build", () => {
  it("measures the start-up set (the entry, its styles and the WebAssembly runtime) and prints the report; with no budgets set, the framework's apply", async () => {
    const root = project(COUNTER);
    const reported: string[][] = [];
    const built = await build(root, { onReport: (each) => void reported.push([...each]) });

    expect(built.size!.startup.files.map((each) => each.kind).sort()).toEqual(["css", "javascript", "wasm"]);
    expect(built.size!.startup.files.find((each) => each.kind === "wasm")!.file).toMatch(/mesh-runtime-.*\.wasm$/);
    expect(built.budgets!.map((each) => each.type)).toEqual(DEFAULT_BUDGETS.map((each) => each.type));
    expect(built.budgets!.every((each) => each.status === "ok")).toBe(true);
    expect(reported).toHaveLength(1);
    expect(built.report!.join("\n")).toContain("Size report (brotli, what travels):");
  });

  it("fails when a budget's error is exceeded, after saying by how much, and the same build with a looser budget passes (the gate fails on a deliberate regression)", async () => {
    const strict = project({ ...COUNTER, "valance.json": '{ "name": "Test", "budgets": [{ "type": "initial", "error": "10kB" }] }' });
    const reported: string[][] = [];

    await expect(build(strict, { onReport: (each) => void reported.push([...each]) })).rejects.toThrow(
      /budget-exceeded: the start-up JavaScript and CSS is .* kB, over the error budget of 10\.0 kB/,
    );
    expect(reported[0]!.join("\n")).toContain("ERROR");

    const loose = project({ ...COUNTER, "valance.json": '{ "name": "Test", "budgets": [{ "type": "initial", "error": "10MB", "warning": "10kB" }] }' });
    const built = await build(loose);

    expect(built.budgets![0]!.status).toBe("warning");
    expect(built.report!.join("\n")).toContain("WARNING");
  });

  it("is told its budgets are wrong by the file and the line, before it builds anything", () => {
    const root = project({ ...COUNTER, "valance.json": '{ "name": "Test",\n "budgets": [{ "type": "bundle" }] }' });

    expect(() => loadConfig(root)).toThrow(/valance\.json:2 config-value: "budgets" \[0\] needs a "type"/);
  });

  it("raises no chunk-size limit: the warning is a budget now (W14), for the web and for the desktop engine", () => {
    const sources = ["vite.ts", "build.ts", "package.ts"].map((file) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8")).join("\n");

    expect(sources).not.toContain("chunkSizeWarningLimit");
  });
});

describe("vlx dev", () => {
  it("says nothing about size, and checks no budget (W9)", async () => {
    const root = project({ ...COUNTER, "valance.json": '{ "name": "Test", "budgets": [{ "type": "initial", "error": 1 }] }' });
    const logged: string[] = [];
    const running = await dev(root, { port: 6900 + Math.floor(Math.random() * 90), log: (line) => void logged.push(line) });

    try {
      const html = await (await fetch(running.url)).text();

      expect(html).toContain("<script>");
      expect(html).not.toContain('rel="modulepreload"');
      expect(html).not.toContain('id="vlx-wasm"');
    } finally {
      await running.close();
    }

    expect(logged.join("\n")).not.toMatch(/brotli|Size report|budget/i);
  });
});

describe("the release check", () => {
  const budgets = JSON.parse(readFileSync(new URL("../src/budgets.json", import.meta.url), "utf8"));
  // The measurements of 2026-10-24, before WP8: the baseline the ceilings were set from.
  const results = {
    counter: { deduped: { js: { brotli: 93722 }, css: { brotli: 1053 }, wasm: { brotli: 183629 } } },
    docsApp: { js: { brotli: 98520 }, css: { brotli: 1542 }, perAddedPage: { jsRawPerPage: 2471.5 } },
    browser: {
      deduped: {
        noThrottling: { interactiveAtMs: 321.9, firstPaintMs: 68, bytesTransferredBrotli: 279594, afterUpdates: { jsHeapUsedBytes: 4575160, wasmMemoryBytes: 1310720 } },
        cpu4x: { interactiveAtMs: 1346.7 },
      },
      docsApp: { noThrottling: { afterUpdates: { wasmMemoryBytes: 2293760 } } },
    },
    update: { 10000: { updateMs: 100, updateFromChangesMs: 46.7 } },
    wire: { 1000: { wholeTreeBytes: 185924, patchBytes: 202 } },
    newestInstallsTogether: { installs: false },
  };
  const over = (outcome: { rows: Array<{ id: string; status: string }> }): string[] => outcome.rows.filter((row) => row.status === "over").map((row) => row.id);

  it("passes the baseline's own numbers, reports the known reds and does not fail on them", () => {
    const outcome = checkResults(budgets, results);

    expect(over(outcome)).toEqual([]);
    expect(outcome.rows.filter((row: { status: string }) => row.status === "known red").map((row: { id: string }) => row.id)).toEqual(["wire.wholeTree", "installability"]);
    expect(outcome.ok).toBe(true);
  });

  it("fails each gate on a deliberate regression: a dependency added (JavaScript), a runtime that grew (WebAssembly), a stray 'known' fixed, a patch that got bigger", () => {
    const grown = structuredClone(results);

    grown.counter.deduped.js.brotli = 99000; // a new dependency of about 5 kB brotli
    grown.counter.deduped.wasm.brotli = 193000;
    grown.wire[1000].patchBytes = 203;
    grown.browser.deduped.noThrottling.afterUpdates.wasmMemoryBytes = 5000000; // the leak of W18 back

    expect(over(checkResults(budgets, grown)).sort()).toEqual(["counter.javascript", "counter.wasmMemory", "runtime.wasm", "wire.patch"]);
    expect(checkResults(budgets, grown).ok).toBe(false);
  });

  it("gates a wall-clock number only as a ratio against an earlier run on the same machine (W4)", () => {
    const slower = structuredClone(results);

    slower.browser.deduped.noThrottling.interactiveAtMs = 321.9 * 2.1;
    slower.update[10000].updateMs = 100 * 1.4;

    expect(checkResults(budgets, slower).rows.find((row: { id: string }) => row.id === "counter.interactiveAt").status).toBe("reported");
    expect(over(checkResults(budgets, slower, { against: results }))).toEqual(["counter.interactiveAt"]);
  });

  it("fails a known red under --strict-known (the release dry run, once the fixes are published)", () => {
    // the whole-tree wire bytes have no limit yet, so they are only ever reported; the installability has one
    expect(over(checkResults(budgets, results, { strictKnown: true }))).toEqual(["installability"]);
    expect(over(checkResults(budgets, { ...results, newestInstallsTogether: { installs: true } }, { strictKnown: true }))).toEqual([]);
  });

  it("does not fail a browser row it was told was not measured, and fails one that is missing", () => {
    const { browser: _browser, ...without } = results;

    expect(checkResults(budgets, without, { withoutBrowser: true }).ok).toBe(true);
    expect(checkResults(budgets, without).ok).toBe(false);
  });

  it("refuses a raised ceiling that has no size analysis, and a ceiling above the baseline plus 5 percent (W3, W23a)", () => {
    expect(ruleProblems(budgets)).toEqual([]);
    expect(allowed(87918)).toBe(92400);
    expect(allowed(80)).toBe(90);

    const raised = structuredClone(budgets);
    const entry = raised.framework.ceilings.find((each: { id: string }) => each.id === "runtime.wasm");

    delete entry.analysis;
    expect(ruleProblems(raised).join("\n")).toContain("runtime.wasm: the ceiling is raised from 179400 to 192900 and no size analysis");

    const loose = structuredClone(budgets);

    loose.framework.ceilings.find((each: { id: string }) => each.id === "counter.css").ceiling = 5000;
    expect(ruleProblems(loose).join("\n")).toContain("counter.css: the ceiling 5000 is above the baseline plus 5 percent (1200)");

    const missing = structuredClone(budgets);

    missing.framework.ceilings.find((each: { id: string }) => each.id === "runtime.wasm").analysis = "docs/does-not-exist.md";
    expect(ruleProblems(missing).join("\n")).toContain("runtime.wasm");
  });

  it("runs as a script: exit 0 on the baseline, 1 on a regression, 2 without results", () => {
    const directory = mkdtempSync(join(tmpdir(), "budgets-"));
    const script = new URL("../../../scripts/check-budgets.mjs", import.meta.url).pathname;
    const good = join(directory, "good.json");
    const bad = join(directory, "bad.json");

    writeFileSync(good, JSON.stringify(results));
    writeFileSync(bad, JSON.stringify({ ...results, counter: { deduped: { ...results.counter.deduped, wasm: { brotli: 200000 } } } }));
    expect(spawnSync("node", [script, "--results", good], { encoding: "utf8" }).status).toBe(0);

    const failed = spawnSync("node", [script, "--results", bad], { encoding: "utf8" });

    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain("over      runtime.wasm");
    expect(spawnSync("node", [script], { encoding: "utf8" }).status).toBe(2);
    expect(execFileSync("node", [script, "--rule"], { encoding: "utf8" })).toContain("the rule holds");
    expect(readdirSync(directory)).toHaveLength(2);
  });
});

describe("the workflows", () => {
  const workflows = new URL("../../../.github/workflows/", import.meta.url);
  const release = readFileSync(new URL("release.yml", workflows), "utf8");

  it("the release holds the tree to its budgets before it packs: the job runs the check, and `pack` waits for it", () => {
    expect(release).toMatch(/\n {2}budgets:\n {4}needs: ci\n/);
    expect(release).toContain("node scripts/check-budgets.mjs --rule");
    expect(release).toContain("node scripts/check-budgets.mjs --results budgets-results.json --against budgets-previous.json");
    expect(release).toMatch(/\n {2}pack:\n {4}needs: \[ci, conformance, budgets\]\n/);
    // a real release (a tag push) also needs the known reds that have an expected value to be green; a dry run reports them
    expect(release).toContain("github.event_name == 'push' && '--strict-known'");
  });

  it("measures weekly, keeps the results as an artifact, and is not a gate on a push", () => {
    const weekly = readFileSync(new URL("budgets.yml", workflows), "utf8");

    expect(weekly).toMatch(/schedule:\n\s+- cron: "\d+ \d+ \* \* 1"/);
    expect(weekly).toContain("upload-artifact");
    expect(weekly).not.toMatch(/\n {2}push:/);
  });
});
