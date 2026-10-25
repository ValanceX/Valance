// The mechanism, tested without a network: the suites are valid, a disabled suite is skipped with its reason and never fails a run, a failing step fails the suite at that step, and the table says it all.
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error plain JavaScript modules
import { runSuite, ROOT } from "../scripts/run.mjs";
// @ts-expect-error plain JavaScript modules
import { failed, problemsOf, readSuites, table } from "../scripts/suites.mjs";

const suite = { name: "demo", repository: ".", ref: "", directory: "fixtures/acme-ui", install: "true", commands: ["true"], needs: [] };

describe("the suites of this repository", () => {
  const all = readSuites(join(ROOT, "suites")) as Array<{ file: string; suite: { name: string; repository: string }; problems: string[] }>;

  it("are valid, and the seeds are the reference library and acme-ui", () => {
    expect(all.flatMap((each) => each.problems)).toEqual([]);
    expect(all.map((each) => each.suite.name)).toEqual(["acme-ui", "components"]);
  });
});

describe("a suite document", () => {
  it("says what is wrong, one sentence each", () => {
    expect(problemsOf(suite)).toEqual([]);
    expect(problemsOf({ ...suite, name: "Demo" })).toHaveLength(1);
    expect(problemsOf({ ...suite, repository: "elsewhere", ref: "main" })).toHaveLength(1);
    expect(problemsOf({ ...suite, repository: "a/b", ref: "" })).toHaveLength(1);
    expect(problemsOf({ ...suite, directory: "../x" })).toHaveLength(1);
    expect(problemsOf({ ...suite, commands: [] })).toHaveLength(1);
    expect(problemsOf({ ...suite, needs: ["gpu"] })).toHaveLength(1);
    expect(problemsOf({ ...suite, extra: 1 })).toEqual(["suite: unknown key \"extra\""]);
  });

  it("is never disabled without a reason and a date", () => {
    expect(problemsOf({ ...suite, disabled: { reason: "", since: "2026-10-01" } })).toHaveLength(1);
    expect(problemsOf({ ...suite, disabled: { reason: "broken upstream", since: "yesterday" } })).toHaveLength(1);
    expect(problemsOf({ ...suite, disabled: { reason: "broken upstream", since: "2026-10-01" } })).toEqual([]);
  });

  it("is checked from a file: not JSON, or named for another suite", () => {
    const dir = mkdtempSync(join(tmpdir(), "suites-"));

    writeFileSync(join(dir, "a.json"), "{");
    writeFileSync(join(dir, "b.json"), JSON.stringify(suite));

    const [a, b] = readSuites(dir) as Array<{ problems: string[] }>;

    expect(a!.problems[0]).toContain("not JSON");
    expect(b!.problems[0]).toContain('named for the suite ("demo.json")');
  });
});

describe("running a suite", () => {
  const work = mkdtempSync(join(tmpdir(), "run-"));
  const calls: Array<[string, string]> = [];
  const sh = (fail?: string) => (command: string, cwd: string) => {
    calls.push([command, cwd]);

    return { ok: command !== fail, output: command === fail ? "line 1\nboom" : "" };
  };

  it("installs, updates to the tag, runs the commands in order, and stops at the first that fails", () => {
    calls.length = 0;

    const passed = runSuite({ ...suite, commands: ["one", "two"] }, { tag: "next", work, sh: sh() });

    expect(passed.status).toBe("pass");
    expect(calls.map(([command]) => command)).toEqual(["true", 'pnpm update -r --no-save "@valancex/*@next"', "one", "two"]);

    calls.length = 0;

    const broke = runSuite({ ...suite, commands: ["one", "two", "three"] }, { tag: "1.2.3", work, sh: sh("two") });

    expect(broke.status).toBe("fail");
    expect(broke.detail).toBe("two: line 1\nboom");
    expect(calls.map(([command]) => command)).toEqual(["true", 'pnpm update -r --no-save "@valancex/*@1.2.3"', "one", "two"]);
  });

  it("skips a disabled suite with its reason, and a run fails only for an enabled suite that fails", () => {
    const skipped = runSuite({ ...suite, disabled: { reason: "upstream broke", since: "2026-10-01" } }, { tag: "next", work, sh: sh("true") });

    expect(skipped).toMatchObject({ status: "skipped", detail: "disabled since 2026-10-01: upstream broke" });
    expect(failed([skipped, { name: "x", status: "pass" }])).toBe(false);
    expect(failed([skipped, { name: "y", status: "fail" }])).toBe(true);
  });

  it("reports in a table that names the tag", () => {
    expect(table("next", [{ name: "a", status: "pass", seconds: 3 }, { name: "b", status: "fail", seconds: 1, detail: "x | y\nz" }])).toBe(
      ["### ecosystem-ci: `@valancex/*@next`", "", "| Suite | Result | Seconds | Detail |", "|---|---|---|---|", "| a | pass | 3 |  |", "| b | FAIL | 1 | x \\| y z |"].join("\n"),
    );
  });
});
