# Pending changes

Changes that are written and proved, and wait for something outside this repository.

## `port-web-constants.patch`: a shared item row, when PORT Web is released with constant attributes

**Waits for:** the publication of `@valancex/port-web` 0.5.0 (prepared in the PORT repository on 2026-10-14: version, changelog, release notes and a packed tarball are done; the `v0.5.0` tag on the default branch is what publishes it), with `@valancex/port-web` `attributes` (constant attributes), `controlledBoolean` and an event realized by one key (`key`), all in the PORT repository ([unreleased](https://github.com/ValanceX/Port/blob/main/CHANGELOG.md); tests in `packages/port-web/test/constants.test.ts`, `controlled-boolean.test.ts` and `key-events.test.ts`).

**What it does:** the web `textfield` gains `submit` (Enter, by `Web.event("keydown", undefined, { key: "Enter" })`), as the desktop's already has, so `todo-add` writes `on.submit={add()}` once for both targets; the web `checkbox` becomes an `<input type="checkbox">` with a live, server-renderable `checked`, with no `type` prop; and `examples/todo-multi` gets `src/shared/todo-item`, an item's row (checkbox, text, button) written once with the portable core and used by both targets, in place of the two copies.

**Proved** on 2026-10-14 against a local build of the PORT repository (`pnpm.overrides` linking `@valancex/port-web`): `vlx check` clean, and `todo-multi`'s browser test (hydration, ticking, Enter to add, the summary following) and window test pass with the shared row and the shared Enter.

**To apply on release:** raise the `@valancex/port-web` range in `packages/valance` and `packages/common` to `^0.5.0`, run `pnpm install`, then `git apply docs/application-model/pending/port-web-constants.patch`, `pnpm -r typecheck`, `pnpm test`, `pnpm test:examples`, and delete this directory.

**Why not now:** the patch uses `Web.controlledBoolean` and the table's `attributes`, which the published `0.4.x` types do not have, so CI would fail to typecheck.
