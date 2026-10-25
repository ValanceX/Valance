// Reading and validating suites, and the table a run is reported in. No I/O beyond reading the suites directory; `run.mjs` does the work.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KEYS = new Set(["name", "description", "repository", "ref", "directory", "install", "commands", "needs", "disabled"]);
const NEEDS = new Set(["chromium", "java"]);

/** The problems of one suite document, as sentences; empty when it is valid. */
export const problemsOf = (suite, file = "suite") => {
  const out = [];
  const bad = (text) => out.push(`${file}: ${text}`);

  if (typeof suite !== "object" || suite === null || Array.isArray(suite)) {
    return [`${file}: a suite is a JSON object`];
  }

  for (const key of Object.keys(suite)) {
    if (!KEYS.has(key)) bad(`unknown key "${key}"`);
  }

  if (typeof suite.name !== "string" || !/^[a-z][a-z0-9-]*$/.test(suite.name)) bad('"name" is a lower-case name (letters, digits, hyphens)');
  if (typeof suite.repository !== "string" || !(suite.repository === "." || /^[\w.-]+\/[\w.-]+$/.test(suite.repository))) bad('"repository" is "owner/name", or "." for a directory of this repository');
  if (typeof suite.ref !== "string") bad('"ref" is a branch, tag or commit ("" for ".")');
  else if (suite.repository !== "." && suite.ref === "") bad('"ref" is needed for a repository other than "."');
  if (typeof suite.directory !== "string" || suite.directory.startsWith("/") || suite.directory.split("/").includes("..")) bad('"directory" is a relative path inside the repository');
  if (typeof suite.install !== "string" || suite.install === "") bad('"install" is a command');
  if (!Array.isArray(suite.commands) || suite.commands.length === 0 || suite.commands.some((each) => typeof each !== "string" || each === "")) bad('"commands" is a list of one or more commands');
  if (!Array.isArray(suite.needs) || suite.needs.some((each) => !NEEDS.has(each))) bad(`"needs" is a list of ${[...NEEDS].join(", ")}`);

  if (suite.disabled !== undefined) {
    const d = suite.disabled;

    if (typeof d !== "object" || d === null || typeof d.reason !== "string" || d.reason.trim() === "" || typeof d.since !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.since)) {
      bad('"disabled" says why and since when: { "reason": "…", "since": "YYYY-MM-DD" }; a suite is never disabled without a reason');
    }
  }

  return out;
};

/** Every suite of a directory, with its problems. */
export const readSuites = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const file = join(dir, name);
      let suite;

      try {
        suite = JSON.parse(readFileSync(file, "utf8"));
      } catch (error) {
        return { file: name, suite: undefined, problems: [`${name}: not JSON (${error.message})`] };
      }

      const problems = problemsOf(suite, name);

      if (problems.length === 0 && name !== `${suite.name}.json`) problems.push(`${name}: the file is named for the suite ("${suite.name}.json")`);

      return { file: name, suite, problems };
    });

/** A suite that is disabled is skipped, and the table says why. */
export const isDisabled = (suite) => suite.disabled !== undefined;

/** The Markdown table of a run. `results` are { name, status: "pass" | "fail" | "skipped", seconds, detail }. */
export const table = (tag, results) =>
  [
    `### ecosystem-ci: \`@valancex/*@${tag}\``,
    "",
    "| Suite | Result | Seconds | Detail |",
    "|---|---|---|---|",
    ...results.map((each) => `| ${each.name} | ${{ pass: "pass", fail: "FAIL", skipped: "skipped" }[each.status]} | ${each.seconds ?? ""} | ${String(each.detail ?? "").replaceAll("|", "\\|").replaceAll("\n", " ")} |`),
  ].join("\n");

/** A run fails when a suite that is enabled fails. Disabled suites never fail it. */
export const failed = (results) => results.some((each) => each.status === "fail");
