// Runs the suites against a version of the `@valancex/*` packages.
//   node scripts/run.mjs [--suite <name>|all] [--tag next|latest|<version>] [--source <dir>] [--no-update] [--work <dir>]
// A suite is fetched (cloned, or copied from this repository), installed, updated to the tag, and its commands run in order. The first command that fails fails the suite; a disabled suite is skipped
// with its reason; the run fails when an enabled suite fails. The table is printed (and appended to $GITHUB_STEP_SUMMARY when there is one).
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { failed, isDisabled, readSuites, table } from "./suites.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..");

const shell = (command, cwd) => {
  const ran = spawnSync(command, { cwd, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CI: "true" } });

  return { ok: ran.status === 0, output: `${ran.stdout ?? ""}${ran.stderr ?? ""}` };
};

const tail = (text, lines = 6) => text.trim().split("\n").slice(-lines).join("\n");

/** One suite, in `work`. Returns { name, status, seconds, detail }. */
export const runSuite = (suite, { tag, work, source, update = true, sh = shell, log = () => undefined }) => {
  const started = Date.now();
  const done = (status, detail = "") => ({ name: suite.name, status, seconds: Math.round((Date.now() - started) / 1000), detail });

  if (isDisabled(suite)) {
    return { name: suite.name, status: "skipped", detail: `disabled since ${suite.disabled.since}: ${suite.disabled.reason}` };
  }

  const checkout = join(work, suite.name);

  rmSync(checkout, { recursive: true, force: true });
  mkdirSync(checkout, { recursive: true });

  if (source !== undefined) {
    cpSync(source, checkout, { recursive: true, filter: (from) => !/(^|\/)(node_modules|\.git|dist|\.valance)(\/|$)/.test(from.slice(source.length)) });
  } else if (suite.repository === ".") {
    cpSync(join(ROOT, suite.directory), checkout, { recursive: true, filter: (from) => !/(^|\/)(node_modules|dist|\.valance)(\/|$)/.test(from) });
  } else {
    const cloned = sh(`git clone --depth 1 --branch ${suite.ref} https://github.com/${suite.repository}.git ${checkout}`, work);

    if (!cloned.ok) return done("fail", `clone: ${tail(cloned.output)}`);
  }

  const cwd = source !== undefined || suite.repository === "." ? checkout : join(checkout, suite.directory);
  const steps = [["install", suite.install], ...(update ? [["update to " + tag, `pnpm update -r --no-save "@valancex/*@${tag}"`]] : []), ...suite.commands.map((each) => [each, each])];

  for (const [label, command] of steps) {
    log(`${suite.name}: ${label}`);

    const ran = sh(command, cwd);

    if (!ran.ok) return done("fail", `${label}: ${tail(ran.output)}`);
  }

  return done("pass");
};

const parse = (argv) => {
  const out = { suite: "all", tag: "next", update: true };

  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];

    if (arg === "--suite") out.suite = argv[++at];
    else if (arg === "--tag") out.tag = argv[++at];
    else if (arg === "--source") out.source = resolve(argv[++at]);
    else if (arg === "--work") out.work = resolve(argv[++at]);
    else if (arg === "--no-update") out.update = false;
    else throw new Error(`unknown argument ${arg}`);
  }

  return out;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parse(process.argv.slice(2));
  const all = readSuites(join(ROOT, "suites"));
  const invalid = all.flatMap((each) => each.problems);

  if (invalid.length > 0) {
    console.error(invalid.join("\n"));
    process.exit(2);
  }

  const chosen = all.map((each) => each.suite).filter((each) => options.suite === "all" || each.name === options.suite);

  if (chosen.length === 0) {
    console.error(`no suite named ${options.suite}`);
    process.exit(2);
  }

  if (options.source !== undefined && chosen.length !== 1) {
    console.error("--source needs one --suite");
    process.exit(2);
  }

  const work = options.work ?? mkdtempSync(join(tmpdir(), "ecosystem-ci-"));

  if (!existsSync(work)) mkdirSync(work, { recursive: true });

  const results = chosen.map((suite) => runSuite(suite, { ...options, work, log: (line) => console.error(line) }));
  const text = table(options.tag, results);

  console.log(text);

  if (process.env.GITHUB_STEP_SUMMARY !== undefined) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);

  process.exit(failed(results) ? 1 : 0);
}
