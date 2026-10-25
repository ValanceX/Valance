# Friction log

Same rules as the reference library's (K17): a severity from 1 to 3, a resolution, and a 3 is fixed or recorded as a decision.

| # | Sev | What happened | Resolution |
|---|---|---|---|
| E1 | 2 | A suite that lives in this repository (the fixture) and one that lives in another have different paths to their files; the first design had two kinds of suite. | One shape: `repository: "."` means a directory of this repository. |
| E2 | 2 | `pnpm update "@valancex/*@next"` rewrites the suite's `package.json`; run in the real checkout of a library it would show up as a change. | The update runs in a throwaway copy, with `--no-save`. |
| E3 | 1 | The runner can only be tested against `next` once a `next` exists; until the 0.15 set is released there is nothing to install. | The runner is tested with an injected shell; a local run uses `--source` with local tarballs (as the reference library's branch does). |
| E4 | 3 | Nothing stopped a suite from being disabled with no reason, which is how a downstream CI turns into a list nobody reads. | Fixed: a disabled suite without a reason and a date is an invalid suite (a test). |
| E5 | 3 | Running the `acme-ui` suite found that `vlx init library` wrote workspace scripts (`build:library`, `check:library`, `playground`) that call `vlx`, which is installed in the packages that use it and not at the workspace root: `pnpm run build:library` failed with `vlx: not found`. The documented flow (`cd packages/acme-ui && vlx library build`) hid it. | Fixed in `@valancex/cli`: the root scripts go through the package scripts (`cd packages/acme-ui && pnpm build`); a test fails without the change. |
