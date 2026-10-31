# Effect v4 migration: implementation plan

Spec: `valance/docs/explanation/plans/2026-10-31-effect-v4-migration.md` (the "migration plan": its decisions, its "What v4 changes" table, and its S1–S9 items are binding). Upstream migration guides, already downloaded: `/home/jackmiller/.claude/jobs/197c48a6/tmp/effect4/migration/` (`v3-to-v4.md` is the rename map: one line per API, `` - `Old` -> `New`: note ``). The `effect@4.1.0` source can be read under any repo's `node_modules/effect/src/` once installed.

Workspace root: `/home/jackmiller/Projects/@Valance`, four git repos. `nexus/`, `valance/` and `port/` each work on branch `effect-v4` (already created from `main`). Mesh is not touched.

## Global constraints

- **Effect version:** `effect` `4.1.0` exactly as the dev/install version, and `^4.1.0` as every range. Not 4.1.1: pnpm's minimum release age refuses it until 2026-10-31T21:53Z, and the age gate is not to be bypassed for a third-party package.
- **Node floor:** every touched `package.json` with `engines.node` gets `">=22.19"`.
- **House style (Nexus, and Valance where it already does so):** `Effect.Do.pipe(...)` with `bind`/`let`/`andThen` over `Effect.gen`; keep any existing `Effect.gen` that is already there. Relative imports keep their `.js` extension. No `any`, no new `as unknown as` casts for inference convenience. Comments explain why, not what; a comment that explains a v3 reason which is now false must be updated to the true v4 reason or removed.
- **No behaviour change unless the migration plan names it.** Public names, signatures (other than Effect's own types), error codes, diagnostic texts and generated files stay the same.
- **Verification per repo** (run the ones the task touches; report the commands and their output):
  - nexus: `pnpm typecheck && pnpm test && pnpm build`
  - valance packages: `pnpm --filter "./packages/**" run typecheck && pnpm --filter "./packages/**" run test`; whole workspace (after Task 6): `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check && pnpm test:browser && pnpm test:examples`
  - port: `pnpm typecheck && pnpm test`
- **Generated output is the acceptance test for Valance's schema code:** the baseline `.valance/manifest*.json`, `wiring*.json` and `program*.json` of `examples/docs-app` and `examples/todo-multi`, captured on `main`, are in `/home/jackmiller/Projects/@Valance/valance/.superpowers/sdd/2026-10-31-effect-v4-implementation/baseline-manifests/` (named `<example>__<file>`). After any change to schema-reading code, run `node ../../packages/cli/bin/vlx.js check --json` in each of those two examples (after `pnpm --filter @valancex/cli run build`) and `cmp` every file against its baseline. Any difference is a failure unless the task says otherwise.
- **Unreleased Nexus:** Valance and Port consume the Nexus built on its `effect-v4` branch through a local pack and a pnpm override, in a commit whose subject starts `DO NOT MERGE BEFORE THE RELEASES:` (the convention in `valance`'s history, e.g. `git show c64a936`). Packs go in `<repo>/local-packs/`.
- **Commits:** on `effect-v4` only, in the repo's message style (an imperative subject, a body explaining why), ending with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, publish, merge or tag.
- **Workspace hygiene:** don't create scratch projects inside `valance/examples/` (that directory is a pnpm workspace glob and pollutes `pnpm-lock.yaml`). Use `/home/jackmiller/.claude/jobs/197c48a6/tmp/`.

---

### Task 1: Nexus on Effect v4

Repo: `nexus/`. Move Nexus to Effect 4 with the same public behaviour.

1. `package.json`: move `effect` from `dependencies` to `peerDependencies: "^4.1.0"`, and add `devDependencies.effect: "4.1.0"`. `engines.node` → `">=22.19"`. `pnpm install`.
2. Run `pnpm typecheck` and work through every error, in `src/` and `tests/`, using the rename map. Specifically (the migration plan's table names more):
   - `Context.GenericTag` (`service/index.ts`, `capability/index.ts`, `event/internal.ts`) → `Context.Service<Shape>(id)`.
   - `withFiberRuntime` in `runtime/internal.ts` `tracked` → `Effect.withFiber`; `Fiber.RuntimeFiber` → `Fiber.Fiber`; `Effect.fork` → `Effect.forkChild`; `Effect.forkDaemon` → `Effect.forkDetach`; `Effect.fiberIdWith` → read `Effect.fiberId`; `Fiber.poll` → `fiber.pollUnsafe()`.
   - `Scope.extend` → `Scope.provide`; `Layer.scoped` → `Layer.effect`; `Layer.setClock` → `Layer.succeed(Clock.Clock, …)`; `Duration.decode` → `Duration.fromInputUnsafe` (or the v4 equivalent the map names); `Stream.interruptWhenDeferred(d)` → `Stream.interruptWhen(Deferred.await(d))`; `Effect.makeSemaphore` → `Semaphore.make`; `PubSub.subscribe` returns `PubSub.Subscription` (not `Queue.Dequeue`).
   - **S6:** the runtime registry stores the built `Context` instead of a `Runtime`. `make` drops the `Effect.runtime().pipe(Effect.provide(context))` step; `run` uses `Effect.runPromiseWith(context)`, `runFork` uses `Effect.runForkWith(context)`. `application/index.ts` reads the environment from that `Context`.
   - **S7:** `refusalOf` drops its `FiberFailure` branch (v4's `runPromise` rejects with `Cause.squash(cause)`, the refusal itself) and keeps its `Cause` branch, using `Cause.findDefect` or `cause.reasons`. Update its doc comment.
   - `Cause.dieOption` → `Cause.findDefect` (returns a `Result`); other `Cause`/`Exit` predicates per the migration plan's table.
   - Tests: `FiberRef`s become `Context.Reference`s (`References.*`), `Layer.setClock` as above, `Effect.either` → `Effect.result`, yielded `Deferred`/`Fiber`/`Ref` values become `Deferred.await`/`Fiber.join`/`Ref.get`.
3. Keep `isolated` and every call site exactly as they are (Task 2 decides about them). Keep `runFork`'s wrapper handle, and replace the FiberRef reason in its comment with the v4 one: a v4 `Fiber` publicly exposes `context` and `setContext()`, so returning the application's own fiber would hand callers the application's services (N3).
4. Behaviour audits, each with a test where none exists:
   - Structural `Equal`: `settleWork` compares fiber ids; State `changes`/`values` must still emit a commit whose value is structurally equal to the previous one (a test commits `{ a: 1 }` then a new `{ a: 1 }` and sees two emissions on `changes`).
   - Keep-alive: the lifecycle and termination tests must finish without hanging; if a test relied on the process exiting with a suspended fiber, fix the test, not the runtime.
   - Typed recovery skipping defects (`catch`): check each recovery site; where a defect alongside a typed failure would previously have been recovered, keep the v3 result explicitly or note why the v4 one is right.
5. Docs: in `docs/reference/` update code samples that show v3-only API (`Context.GenericTag`, `Layer.setClock`, `Runtime`). Do not edit design records, specs or old plans.
6. Verify: `pnpm typecheck && pnpm test && pnpm build`, `dist/index.js` and `dist/index.d.ts` at the top level. Commit (one or more commits).

### Task 2: Nexus caller isolation without `isolated` (S5)

Repo: `nexus/`. Depends on Task 1.

1. Delete `isolated` from `src/runtime/internal.ts` and run its three call sites inline: the layer build in `runtime/index.ts` `makeFrom`, the scope close in `terminateLifecycle`, and `settleWork`'s wait (keep it interruptible inside the uninterruptible termination with `Effect.interruptible`, so its timeout can still end it).
2. Run `pnpm test`. The proof is `tests/platform-isolation.test.ts` and `tests/semantic-isolation.test.ts` (as ported in Task 1) passing unchanged in what they assert, plus the full suite.
3. If they pass: keep the deletion. Update `docs/explanation/architecture.md`'s caller-isolation entry (around "The mechanism, in one form, at three places") to say that in v4 the invariants I44–I47 hold by construction (no `FiberRef`; layers add to the context they build; `Fiber.join` imports nothing), that the helper was removed in 0.18, and that `runFork`'s handle remains for the N3 reason. Add a test if there is none that a layer providing `Clock.Clock` does not change the caller's clock after `make` returns.
4. If any isolation assertion fails without `isolated`: restore it, keep a test showing the failure (skipped, with a comment naming the failing invariant), and record in the report which invariant and why. That outcome is acceptable; don't weaken a test to make the deletion pass.
5. Verify (Nexus command set) and commit.

### Task 3: Nexus 0.18.0 release prep

Repo: `nexus/`. Depends on Task 2.

1. `package.json` `version` → `0.18.0`.
2. `CHANGELOG.md`: a `0.18.0` entry in the file's existing format. Breaking: `effect` is a peer dependency at `^4.1.0`; Node `>=22.19`; Effect's own types in the public surface follow v4 (list each public signature whose Effect types changed, e.g. `runFork`'s return type `Fiber.Fiber`). Changed: `refusalOf` no longer needs to unwrap a `FiberFailure` (a rejection from `Runtime.run` is the refusal itself); `isolated` removed if Task 2 removed it (internal, but the architecture doc changed). Name the north-star tier (none: no Nexus API added) and state that no scorecard audit moves.
3. `pnpm build`, then `pnpm pack` into `nexus/` (the tarball is not committed in Nexus; Tasks 4 and 9 copy it). Verify (Nexus command set) and commit.

### Task 4: Valance packages on Effect v4

Repo: `valance/`. Depends on Task 3. Scope: `packages/*` only; examples, templates and docs are Task 6.

1. `DO NOT MERGE BEFORE THE RELEASES:` commit: copy `nexus/valancex-nexus-0.18.0.tgz` into `valance/local-packs/`, add `"@valancex/nexus": file:./local-packs/valancex-nexus-0.18.0.tgz` under `overrides` in `pnpm-workspace.yaml`, raise each `@valancex/nexus` range in `packages/*/package.json` to `^0.18.0`. Commit this alone.
2. Effect: in `packages/{common,valance,router}` the `effect` peer → `^4.1.0` and the dev dependency → `4.1.0`. In `packages/cli`, move `effect` from `dependencies` to `peerDependencies: "^4.1.0"` plus `devDependencies: "4.1.0"` (it loads the project's `main.ts`, so it must use the project's copy). Every other `packages/*` that lists `effect` likewise. `engines.node` → `">=22.19"`. `pnpm install`.
3. Port `packages/*/src` and `packages/*/test` until `pnpm --filter "./packages/**" run typecheck` passes. Specifically:
   - `valance/src/web-manifest.ts` and `web-redacted.ts`, `common/src/form.ts`, `common/src/app.ts`, `cli/src/contract.ts`, `valance/src/index.ts` `fieldsOf`: port to the v4 AST (`String`/`Number`/`Boolean`, `Objects`, `Arrays`, `Null`/`Undefined`, checks on the node, `SchemaAST.toType`/`toEncoded`, `SchemaAST.isOptional`, `ParseResult` → `SchemaIssue`, `representation` ids on checks and on `Redacted`). A straight port is enough here; Task 5 consolidates.
   - `catchAll` → `catch`, `catchAllCause` → `catchCause`, `zipRight` → `andThen`, `Cause.failureOption` → `Cause.findErrorOption`, `Runtime.runFork`/`withFiberRuntime` in `valance/src/index.ts` per the map, `Scope.extend` → `Scope.provide`, and the Schema renames in package sources and tests (`Literal(a, b)` → `Literals([a, b])`, `Union(a, b)` → `Union([a, b])`, `Record({ key, value })` → `Record(k, v)`, `decodeUnknown` → `decodeUnknownEffect`, `decodeUnknownEither` → `decodeUnknownExit`, filters → `check(isX(...))`, `Redacted`/`RedactedFromValue` per the migration plan).
   - **S8:** `web.ts`'s startup failure becomes `Cause.squash(exit.cause)`; `failureIdentity` in `valance/src/index.ts` reads `cause.reasons` (first `Fail`, else first `Die`).
   - **S9:** `units.ts` `same` uses `Equal.equals`.
4. Run `pnpm --filter "./packages/**" run test`. Rebuild cli and common, then run the generated-output acceptance check (Global constraints) on `docs-app` and `todo-multi`. The examples' own `main.ts` still use v3 spellings at this point; if they fail to load, do this check after temporarily applying only the Schema renames to those two examples' `src/` and keep those edits (Task 6 does the rest).
5. Commit.

### Task 5: One schema view (S1–S4)

Repo: `valance/`. Depends on Task 4.

1. Add one internal module in `packages/valance/src/` (exported through `internal.ts` so `common` and `cli` can use it) that gives the four consumers the schema as `SchemaRepresentation.toRepresentation` sees it, for the type side and for the encoded side. It is the single place that knows the AST's shape.
2. Rewrite onto it: `web-manifest.ts` (`typeOf`, `fieldOf`, `structOf`), `form.ts` (`baseOf`, `unwrapOptional`, `literalsOf`, `describe`, `describeField`, `fieldMessagesOf`), `web-redacted.ts` (`isRedacted` by `representation.id === "effect/schema/Redacted"`, `contains`), `valance/src/index.ts` `fieldsOf`, `common/src/app.ts:73`. Recursion (`Suspend`) is followed through the representation's `references`.
3. **S2:** `form.ts` takes the code and params of a failed check from its `representation` (`id`, `payload`) and the constraints from the same payloads. The code string a form reports must stay what it is today for every built-in check; if v4's ids differ (`effect/schema/isMinLength` against today's `minLength`), map them in one table and test it.
4. **S3:** replace the `leaves` walk with v4's issue tree. Use `SchemaIssue.makeFormatterStandardSchemaV1({ leafHook, checkHook })` if it can supply the field-level message (the author's message on a field speaks for every check of that field); otherwise keep a small `leaves` over the v4 node set (`Pointer`, `Composite`, `Filter`, `Encoding`, leaves). Report which.
5. Acceptance: the generated-output check (byte-identical), plus `pnpm --filter "./packages/**" run test` with no test's assertion changed. Report the line counts removed and added.
6. Commit.

### Task 6: The author's surface

Repo: `valance/`. Depends on Task 5.

1. Every example (`examples/*`, including `docs-verifier`), the `init` templates (`packages/cli/templates/**`), the tutorials and how-tos under `docs/`, `packages/cli/README.md`, other package READMEs, and `reference/**`: apply the Schema renames and any other v4 change their code needs. `reference/**` and examples pin `effect` to `">=3.10.0 <4"` or `^3.10.0`: change to `^4.1.0` (dev `4.1.0` where there is a dev entry). Tutorial **File:** blocks must still match the example files they quote (a test checks it).
2. `pnpm install`, then the whole-workspace verification set from Global constraints, and the generated-output check (now on the examples as fully migrated: byte-identical still).
3. Commit.

### Task 7: `vlx check` guards against v3 code

Repo: `valance/`. Depends on Task 6.

1. A diagnostic `effect-version`: when the project's installed `effect` (resolved from the project root) is not `4.x`, `vlx check` reports it once at `package.json` (line of the `effect` entry, else line 1): `effect <installed> is installed; Valance needs effect ^4.1.0`. Missing `effect` is not this diagnostic's concern (loading `main.ts` already fails with `entry-load`).
2. A diagnostic `effect-v3-schema`: for each `.ts` file under `src/`, a call `Schema.Literal(` with more than one top-level argument, or `Schema.Union(` / `Schema.Tuple(` whose first argument is not an array literal, is reported at its file, line and column: for `Literal`, `Schema.Literal takes one value in effect 4: write Schema.Literals([...])`; for `Union`/`Tuple`, `Schema.<Name> takes an array in effect 4: write Schema.<Name>([...])`. Use the TypeScript compiler API already available to the CLI if there is one in its dependencies; otherwise a scanner that tracks parentheses, brackets, braces, strings and comments. It must not flag `Schema.Literal("a")` or `Schema.Union([a, b])`.
3. Both appear in `vlx check --json` and in the dev overlay like every other diagnostic, and are documented where the CLI documents its diagnostic codes.
4. Tests in `packages/cli/test/`: each diagnostic fires on its case and stays silent on the v4 spelling and on a project with no such call.
5. Verify (valance packages set, plus `pnpm lint && pnpm format:check`) and commit.

### Task 8: Valance measurements and 0.17.0 release prep

Repo: `valance/`. Depends on Task 7.

1. Budgets: run the size budget test (`packages/cli/test/budgets.test.ts` and `examples/docs-verifier` `test:budget`) and read the measured sizes. Tighten the budgets in `packages/cli/src/budgets.json` (and docs-verifier's, if it has its own) to the new measured values, rounded up to the next whole KiB, only where the measurement went down; report before and after.
2. Render dedupe (`valance/src/index.ts`, the `Stream.changesWith` with `Equal.equals(left[0], right[0])`): add a test that two commits of structurally equal state render once (now the v4 behaviour) and that a commit changing one nested field renders. Time a commit of the largest state in an existing test or benchmark before and after the migration (checkout `main` for before); if it is more than 2× slower, switch the comparison to reference equality and say so.
3. Keep-alive: confirm `vlx dev`'s `close()` and the CLI test suite end without hanging (the suite ran in Task 6; add a test that `dev(...).close()` resolves within 5 s if there is none).
4. Versions: every published package in `packages/*` → `0.17.0` (match how the repo bumped them for 0.16.0: `git log -p -1 --grep "0.16.0" -- packages/*/package.json` shows it). `CHANGELOG.md`: a `0.17.0` entry in the existing format: Effect `^4.1.0` peer (cli included), Nexus `^0.18`, Node `>=22.19`, the author-facing Schema renames with before/after examples, the two new diagnostics, the budgets. North-star: name the tier of the two diagnostics (mechanism improving diagnostics; no public API) and state which scorecard audits are touched with before and after (none expected to move).
5. Verify (whole-workspace set) and commit.

### Task 9: Port integration on Effect v4

Repo: `port/`. Depends on Task 3. Independent of Tasks 4–8.

1. `DO NOT MERGE BEFORE THE RELEASES:` commit: copy the Nexus 0.18.0 pack into `port/local-packs/`, add a pnpm override for `@valancex/nexus` to it in `port/pnpm-workspace.yaml`, raise `integration/package.json`'s `@valancex/nexus` to `^0.18.0`.
2. `integration/package.json`: `effect` dev dependency → `4.1.0`. Port `integration/test/slice.test.ts` and `integration/browser/slice.browser.test.ts` (`Runtime.runFork` and any other v3 API). `port-web` and the other packages are not changed.
3. Verify (Port command set, plus the browser test if the integration package has one) and commit.
