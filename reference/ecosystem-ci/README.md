# ecosystem-ci

Downstream CI for VALANCE (decision K16). A library's own build and tests, run against a version of `@valancex/*` that is not released yet, so a breaking change shows up here before it shows up for its users.

| | |
|---|---|
| `suites/<name>.json` | one suite per library: where it lives, how to install it, and the commands that must pass |
| `scripts/run.mjs` | fetches a suite, installs it, updates `@valancex/*` to a tag, runs its commands, prints a table |
| `.github/workflows/ecosystem-ci.yml` | runs every suite on `next`, on Monday, Wednesday and Friday, and by hand for any tag or version |
| `fixtures/acme-ui` | the workspace `vlx init library acme-ui` writes, unchanged |

Seeded with two suites, so it works with no outsiders: **components** (the reference library, `ValanceX/Components`) and **acme-ui** (the fixture).

## Run it

```
node scripts/run.mjs                              # every suite against `next`
node scripts/run.mjs --suite acme-ui --tag 0.16.0 # one suite against a version
```

Needs `pnpm`; the `components` suite needs Chromium (Playwright) and Java for its tests. `--no-update` runs a suite against the versions it asks for; `--source <dir>` runs one suite from a local directory.

## Enrol a library

Open a pull request that adds `suites/<your-library>.json`:

```json
{
  "name": "your-library",
  "description": "What it is, and what the tests need.",
  "repository": "you/your-library",
  "ref": "main",
  "directory": ".",
  "install": "pnpm install --no-frozen-lockfile",
  "commands": ["pnpm build", "vlx library check", "pnpm test"],
  "needs": []
}
```

`pnpm test` here checks the file (the keys, the name, a reason on anything disabled). A suite that fails belongs to a library that did not change: the table in the run says which command, with its last lines.

## When a suite breaks

A suite that fails because VALANCE broke it is VALANCE's to fix or to announce. One that fails because the library broke on its own is its author's. A suite that stays broken for four weeks is **disabled with a reason and a date** (`"disabled": { "reason": "…", "since": "YYYY-MM-DD" }`): it is skipped, shown in the table with the reason, and never fails the run. The file is never deleted, so the history stays.

## Unstable surfaces

An API with the "Developer Preview" label may change in a `next` release without notice; a suite that depends on one is told in the release notes, not by a failed run alone.

## Not claimed

This repository is the mechanism. It has no outside enrolment yet (decision X7 defers the outside parties), and so it does not show that anyone outside the project uses it.
