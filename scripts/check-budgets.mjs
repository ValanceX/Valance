// The release check for the ecosystem's budgets (Bet 3; decisions W1 to W24): reads the output of scripts/measure-footprint.mjs and the budgets as data (packages/cli/src/budgets.json), prints every measurement against
// its limit, and exits 1 when one is over. It checks the data too: a ceiling raised above its previous value, or above the baseline plus 5 percent, needs a size analysis that exists (W3, W23a).
//
//   node scripts/check-budgets.mjs --results results.json [--budgets file] [--against previous.json] [--without-browser] [--strict-known] [--json out.json]
//   node scripts/check-budgets.mjs --rule            check the budgets file itself and nothing else
//
// --against        a measurement taken earlier on the same machine, for the ratio gates (wall-clock numbers are only ever compared with ones from the same machine, W4). Without it they are reported, not gated.
// --without-browser  the results were taken with --skip-browser: the browser rows are not measured and are not failures.
// --strict-known   a known red (wire bytes of a whole tree, installability) fails the check too. The release dry run passes it once the fixes are published.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/** The value at a dotted path of the results, or undefined. */
export const at = (results, path) => path.split(".").reduce((value, key) => (value === undefined || value === null ? undefined : value[key]), results);

/** The ceiling the rule of W3 allows for a baseline: plus 5 percent, rounded up to the next 100 (the next 10 under 1,000). */
export const allowed = (baseline) => {
  const step = baseline < 1000 ? 10 : 100;

  return Math.ceil((baseline * 1.05) / step) * step;
};

/** What is wrong with the budgets file itself: a raised ceiling with no size analysis (W23a), a ceiling under its baseline. */
export const ruleProblems = (budgets, base = root) => {
  const problems = [];

  for (const each of budgets.framework?.ceilings ?? []) {
    const analysed = typeof each.analysis === "string" && existsSync(join(base, each.analysis));

    if (each.ceiling < each.baseline) {
      problems.push(`${each.id}: the ceiling ${each.ceiling} is under its baseline ${each.baseline}`);
    }

    if (each.previousCeiling !== undefined && each.ceiling > each.previousCeiling && !analysed) {
      problems.push(`${each.id}: the ceiling is raised from ${each.previousCeiling} to ${each.ceiling} and no size analysis (analysis: a file that exists) says why (W23a)`);
    }

    if (each.ceiling > allowed(each.baseline) && !analysed) {
      problems.push(`${each.id}: the ceiling ${each.ceiling} is above the baseline plus 5 percent (${allowed(each.baseline)}) and no size analysis says why (W3)`);
    }
  }

  return problems;
};

/** Holds `results` to `budgets`. Returns the rows and whether the check passed. */
export const check = (budgets, results, options = {}) => {
  const rows = [];
  const without = options.withoutBrowser === true;
  const row = (kind, id, what, measured, limit, status, note) => rows.push({ kind, id, what, measured, limit, status, ...(note === undefined ? {} : { note }) });
  const skipped = (path) => without && path.startsWith("browser.");

  for (const each of budgets.framework?.ceilings ?? []) {
    const measured = at(results, each.path);

    if (measured === undefined) {
      row("ceiling", each.id, each.what, undefined, each.ceiling, skipped(each.path) ? "skipped" : "missing", skipped(each.path) ? "browser rows are not measured" : `no ${each.path} in the results`);
    } else {
      row("ceiling", each.id, each.what, measured, each.ceiling, measured <= each.ceiling ? "ok" : "over");
    }
  }

  for (const each of budgets.framework?.exact ?? []) {
    const measured = at(results, each.path);

    row("exact", each.id, each.what, measured, each.max, measured === undefined ? "missing" : measured <= each.max ? "ok" : "over");
  }

  for (const each of budgets.framework?.ratios ?? []) {
    const measured = at(results, each.path);
    const earlier = options.against === undefined ? undefined : at(options.against, each.path);

    if (measured === undefined || earlier === undefined) {
      row("ratio", each.id, each.what, measured, each.max, skipped(each.path) ? "skipped" : options.against === undefined ? "reported" : "missing", options.against === undefined ? "no --against: reported, not gated (W4)" : undefined);
    } else {
      const ratio = measured / earlier;

      row("ratio", each.id, each.what, Number(ratio.toFixed(3)), each.max, ratio <= each.max ? "ok" : "over", `${measured} against ${earlier}`);
    }
  }

  for (const each of budgets.framework?.known ?? []) {
    const measured = at(results, each.path);
    const red = each.expect === undefined ? true : measured !== each.expect;

    row("known", each.id, each.what, measured, each.expect ?? "no limit yet", red ? (options.strictKnown === true ? "over" : "known red") : "ok", each.reason);
  }

  const problems = ruleProblems(budgets);

  return { rows, problems, ok: problems.length === 0 && rows.every((each) => ["ok", "skipped", "reported", "known red"].includes(each.status)) };
};

const render = ({ rows, problems, ok }) =>
  [
    ...rows.map((each) => `${each.status.padEnd(9)} ${each.id.padEnd(26)} ${String(each.measured ?? "-").padStart(12)}  ${each.kind === "ratio" ? "at most " : each.kind === "known" ? "" : "<= "}${each.limit}  ${each.what}${each.note === undefined ? "" : `  (${each.note})`}`),
    ...problems.map((each) => `RULE      ${each}`),
    ok ? "budgets: ok" : "budgets: OVER",
  ].join("\n");

const main = () => {
  const args = process.argv.slice(2);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const budgets = JSON.parse(readFileSync(resolve(option("--budgets") ?? join(root, "packages", "cli", "src", "budgets.json")), "utf8"));

  if (args.includes("--rule")) {
    const problems = ruleProblems(budgets);

    console.log(problems.length === 0 ? "budgets: the rule holds (every raised ceiling has its size analysis)" : problems.join("\n"));
    process.exit(problems.length === 0 ? 0 : 1);
  }

  const resultsFile = option("--results");

  if (resultsFile === undefined) {
    console.error("check-budgets: say what was measured: --results results.json (from scripts/measure-footprint.mjs --json), or --rule");
    process.exit(2);
  }

  const against = option("--against");
  const outcome = check(budgets, JSON.parse(readFileSync(resolve(resultsFile), "utf8")), {
    ...(against === undefined ? {} : { against: JSON.parse(readFileSync(resolve(against), "utf8")) }),
    withoutBrowser: args.includes("--without-browser"),
    strictKnown: args.includes("--strict-known"),
  });

  console.log(render(outcome));

  if (option("--json") !== undefined) {
    writeFileSync(resolve(option("--json")), `${JSON.stringify(outcome, null, 2)}\n`);
  }

  process.exit(outcome.ok ? 0 : 1);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
