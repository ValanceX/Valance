# Effect v4 migration: plan

Written 2026-10-31. Effect `4.1.1` is `latest` on npm (`3.22.4` is `prev`). Every Valance repo that uses Effect is on `^3.10.0` (installed `3.22.2`). This plan moves the ecosystem to `^4.1` in one cut.

Sources read: the upstream guide [`MIGRATION.md`](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md) and every page under `migration/` (services, cause, error-handling, forking, yieldable, fiber-keep-alive, layer-memoization, fiberref, runtime, scope, equality, schema), plus the rename map `migration/v3-to-v4.md`. Each API this ecosystem uses was looked up in that map. The `effect@4.1.1` tarball's `src/` was checked where the map was unclear.

## What v4 changes, as it touches us

| Area | v3 → v4 | Where we are hit |
|---|---|---|
| Packaging | One version line for all `@effect/*`; platform, rpc and cluster folded into `effect`. Unstable modules drop the `unstable/` path segment. Requires TS ≥ 5.9 and Node ≥ 22.19. | We use only `effect` (no `@effect/*`). TS is already `^7`. `engines.node` is `>=22` everywhere: raise to `>=22.19`. |
| Services | `Context.GenericTag`/`Tag`/`Effect.Tag`/`Effect.Service` → `Context.Service`. No accessors, no auto `.Default` layer. | Nexus: 3 `Context.GenericTag` (`service/index.ts`, `capability/index.ts`, `event/internal.ts`). |
| Runtime | `Runtime<R>` is gone. `Runtime.make` → `Context.make`; `Runtime.runFork(rt)` → `Effect.runForkWith(ctx)`; `Effect.runtime` → `Effect.context`. | Nexus `runtime/`, `application/`, `event/internal.ts`; Valance `valance/src/index.ts`; Port integration tests. |
| Fibers | `fork` → `forkChild`, `forkDaemon` → `forkDetach`; `RuntimeFiber` merged into `Fiber`; `Fiber.poll` → `fiber.pollUnsafe()`; `withFiberRuntime` → `Effect.withFiber` (stable, `@since 4.0.0`; the map's "none" is out of date). | Nexus `runtime/internal.ts:264` tracks work by fiber. That code moves to `Effect.withFiber` and `Fiber.Fiber`. |
| Yieldables | `Ref`, `Deferred`, `Fiber`, `Option`, `Either` are no longer Effects. Use `Ref.get`, `Deferred.await`, `Fiber.join`, `Effect.fromOption`. `Either` → `Result`. | Anywhere a `Deferred` or `Fiber` is yielded directly. `tsc` finds every one. |
| Errors | `catchAll` → `catch`, `catchAllCause` → `catchCause`, `catchSome` → `catchFilter`. Typed recovery now skips causes that hold a defect. | Valance: 12 `catchAll`. Check each one: a defect next to a typed error no longer reaches the handler. |
| Cause | Flat `reasons` array (`Fail | Die | Interrupt`). `failureOption` → `findErrorOption`, `dieOption` → `findDefect` (returns a `Result`), `isInterruptedOnly` → `hasInterruptsOnly`, `*Exception` → `*Error`. | Valance: 3 `failureOption`. Nexus: the exit and termination paths. |
| Scope / Layer | `Scope.extend` → `Scope.provide`; `Layer.scoped` → `Layer.effect`; `Layer.setClock` → `Layer.succeed(Clock.Clock, …)` (Nexus `runtime/index.ts`). Nested `Effect.provide` now reuses layers that are already built. | Nexus runtime. |
| FiberRef | Removed; replaced by `Context.Reference` and `References.*`. | Tests only (log level). |
| Equality | `Equal.equals` compares plain objects, arrays, maps and sets by structure. `NaN` equals `NaN`. | Audit Nexus's `changes`/`changesWith` and any dedupe that relied on reference identity. A structurally equal commit could now be dropped. |
| Keep-alive | The core runtime keeps Node alive while a fiber is suspended. | Nexus `terminate`/lifecycle: a test that relied on the process exiting with a fiber still suspended will now hang. |
| **Schema** | `Literal("a","b")` → `Literals(["a","b"])`; `Union(A,B)` → `Union([A,B])`; `Record({key,value})` → `Record(k,v)`; `extend` → `fieldsAssign`; `decodeUnknown` → `decodeUnknownEffect`, `decodeUnknownEither` → `decodeUnknownExit`; `ParseResult` → `SchemaIssue`; `Redacted` ↔ `RedactedFromValue` swap meanings; filters → `check(isX())`. | **The author-facing API.** `field(Schema.Literal("light","dark"), …)` is in the `init` template, all three tutorials and most examples. |
| **SchemaAST** | New node set: `String`/`Number`/`Boolean` (not `*Keyword`), `Objects` (was `TypeLiteral`), `Arrays` (was `TupleType`), `Null`/`Undefined` nodes. No `Refinement` wrapper (checks sit on the node). Optional keys are marked through `context.isOptional`. `typeAST` → `toType`. | `valance/src/web-manifest.ts` (the Schema → MESH type walker), `web-redacted.ts`, `common/src/form.ts`, `common/src/app.ts`, `cli/src/contract.ts`. |

### A silent break to guard against

Checked against `effect@4.1.1`: `Schema.Literal("light", "dark")` drops the second argument at runtime, with no error:

```
Literal "light"        // s.ast._tag, s.ast.literal
false                  // Schema.is(s)("dark")
```

`tsc` rejects the call, but `vlx check` loads `src/main.ts` without type-checking it. A v3-style project would load cleanly, the manifest would say `theme: enum ["light"]`, and every template comparing `theme == "dark"` would fail with a confusing type error. Phase 3 adds a diagnostic for this.

## Decisions

1. **One cut, no dual support.** Supporting v3 and v4 side by side would mean two AST walkers, two `Cause` shapes and two fiber models behind one API. Every package moves to `effect ^4.1`.
2. **Nexus takes `effect` as a peer dependency.** Today Nexus has `effect` in `dependencies` while Valance's packages take it as a peer. An application on v4 and a Nexus that still brings its own copy would load two Effect runtimes: services, fibers and schemas from one are foreign to the other. `@valancex/cli` likewise loads the author's `main.ts`, so it uses the project's `effect` (a peer, with a dev copy for its own tests).
3. **Keep the house style.** `Effect.Do`, `bind`, `let` and `andThen` all exist in v4 (`let` has a revised signature). `Effect.zipRight` becomes `Effect.andThen`. The Do-notation convention stands.
4. **The type-checker is the inventory.** The rename map has 8,950 lines. Bump the dependency, run `pnpm typecheck` and work through the errors. Use the table above for behaviour changes that type-check but act differently (catch rules, structural `Equal`, keep-alive, `Redacted`, the silent `Literal`).
5. **Mesh is unaffected.** No Mesh package imports `effect`. `port-web` doesn't either; only `port/integration` (devDependency) does.

## What v4 lets us delete

Investigated 2026-10-31, after the plan above was written. Each item was checked against the code and against `effect@4.1.1`; the probes are noted. They are deletions that the migration makes possible, not new features, so they belong in the phase that already rewrites the file.

### Collapse

| # | What | Why v4 allows it | Size | Phase |
|---|---|---|---|---|
| S1 | **Not pursued.** Tried in Task 5 and dropped: the consolidation was net +68 lines, `form.ts` stays on the AST (it needs both sides and issue checks the representation drops), and it changed behaviour (`web-redacted` and `fieldsOf` moved to the type side, which differs for encoding-side checks). The four files keep their own small AST readers. Original idea: **One schema view for four walkers.** `web-manifest.ts` (`typeOf`/`fieldOf`), `form.ts` (`baseOf`, `unwrapOptional`, `literalsOf`, `describe`), `web-redacted.ts` (`isRedacted`, `contains`), `valance/src/index.ts:322` (`fieldsOf`) and `common/src/app.ts:73` each strip `Refinement`/`Transformation`/`Suspend` wrappers and `UndefinedKeyword` union members themselves. | v4 has no wrapper nodes: checks sit on the node, and the side is chosen with `SchemaAST.toType`/`toEncoded`. `SchemaRepresentation.toRepresentation(ast)` returns a plain-JSON tree with an explicit `isOptional` and inline checks. Probed on a struct of `Literals`, a checked string, an array, an `optionalKey` and a `Redacted`: all five read directly. | The ~46-line `baseOf`/`unwrapOptional` block in `form.ts`; every "filter out `UndefinedKeyword`" branch; the `Refinement`/`Transformation`/`Suspend` cases in all four files. | 0 (decide), 2 |
| S2 | **Done by Task 4** (codes from the representation ids). **Form error codes from the check, not from a symbol.** `form.ts` `codeOf` turns the `SchemaIdAnnotationId` symbol's description into a code by stripping `effect/SchemaId/`, and reads the parameters from the JSON Schema annotation. | Every v4 check carries `representation: { id, payload }`, e.g. `{ id: "effect/schema/isMinLength", payload: { minLength: 2 } }`. That is the form's `{ code, params }` as is. Constraints (`minLength`, `maximum`, …) come from the same payload. | `codeOf`, and the constraints merge at `form.ts:297`. | 2 |
| S3 | **Not pursued.** Left with S1: `form.ts` keeps its `leaves` walker over the issue tree. Original idea: **Flattening a decode failure.** `form.ts` `leaves` walks v3's `Pointer`/`Composite`/`Refinement`/`Transformation` issue tree to get `(path, issue)` leaves. | v4's issue tree has no `Refinement`/`Transformation` nodes (`Pointer`, `Composite`, `Filter`, `Encoding` and leaves). `SchemaIssue.makeFormatterStandardSchemaV1({ leafHook, checkHook })` already flattens to `{ path, message }` and hands each leaf and check to a hook. Field-level messages still need the path, so check in Phase 0 whether the hooks cover them or a small `leaves` remains. | Most of `leaves` (~20 lines). | 2 |
| S4 | **Done by Task 4** (`Redacted` by representation id). **`Redacted` by a documented id.** `isRedacted` matches a private v3 annotation (`Symbol.for("effect/annotation/TypeConstructor")`). | v4's `Schema.Redacted` declares `representation.id: "effect/schema/Redacted"` (in `Schema.ts`, and visible in the S1 probe). | A one-line check instead of a private symbol. | 2 |
| S5 | **Nexus caller isolation (`isolated`) at `make` and termination.** It runs the layer build (C29) and the closing of the runtime scope (C30) in a child fiber and never `join`s it, so that FiberRef writes (`Layer.setClock`, …) cannot reach the caller (P1, I44–I47). | v4 removes `FiberRef`. Clock, log level and the rest are `Context.Reference`s that a layer *adds* to the context it builds; nothing writes into the calling fiber, and `Fiber.join` imports nothing. The invariants should hold with the build run inline. **Proof required:** keep `platform-isolation.test.ts` and `semantic-isolation.test.ts` (ported to `Context.Reference`) and delete `isolated` only if they pass without it. `settleWork` also uses it to wait interruptibly; an inline `Effect.interruptible` region does the same. | The helper (7 lines), 3 call sites, and the I44–I47 machinery described in `architecture.md`. | 1 |
| S6 | **Runtime capture.** `make` builds a `Context` and then turns it into a `Runtime` (`Effect.runtime().pipe(Effect.provide(context))`) to store it in the registry. | `Runtime<R>` is gone; `Effect.runPromiseWith(context)`/`runForkWith(context)` run against the `Context`. Store the `Context`. | One step in `make`; `runtimeFor`'s type. | 1 |
| S7 | **Unwrapping `FiberFailure`.** `refusalOf` (public) unwraps `Runtime.run`'s `FiberFailure` to find the refusal. | v4's `runPromise` rejects with `Cause.squash(cause)`, the first failure or else the first defect, with no wrapper. A refusal from `Nexus.Runtime.run` *is* the rejection value, so `isRefusal(error)` is enough. `refusalOf` keeps its `Cause` branch; its doc no longer needs to explain `FiberFailure`. | The `FiberFailure` branch. | 1 |
| S8 | **Startup failure value.** `web.ts:537` throws `Option.getOrElse(Cause.failureOption(cause), () => Cause.squash(cause))`. | That is exactly v4's `Cause.squash` (failure first, then defect). `failureIdentity` (`index.ts:421`) simplifies the same way, reading `cause.reasons`. | One line each. | 2 |
| S9 | **Comparing values by JSON.** `units.ts:118` `same` compares `JSON.stringify` output, which depends on key order. | v4 `Equal.equals` compares plain objects, arrays, maps and sets by structure. | One line, and correct for key order. | 2 |

### Checked, and staying

- **`runFork`'s execution handle (C32).** v4 removes the FiberRef reason for it, but v4's `Fiber` exposes `context` and `setContext()` publicly. Returning the application's own fiber would hand callers every application service and a way to replace them (entity trap, N3). The wrapper stays; its comment should give that reason.
- **The event bus's lock and live-queue set.** v4's `PubSub.shutdown` makes subscribers *interrupt*; Nexus promises that each subscription "ends normally" when the bus closes. Only the types change (`PubSub.Subscription` for `Queue.Dequeue`).
- **`Stream.drop(1)` in State `changes`.** v4's `SubscriptionRef` is still a `PubSub` with `replay: 1`, so the current value is still replayed on subscribe.
- **The lifecycle's `work` set.** `withFiberRuntime` becomes `Effect.withFiber`, one for one. A `FiberSet` cannot skip the fiber that terminates (a command may shut down its own application), so the set stays.
- **`field(schema, default)`.** v4 has schema-level defaults (`withConstructorDefault`, `withDecodingDefault`), but `field` is the public, tier-1 shape and gains nothing from moving.

### Behaviour that changes on its own (test, don't simplify)

- `valance/src/index.ts:709` dedupes renders with `Equal.equals(left[0], right[0])` on the state. In v3 that compares references; in v4 it compares structure, so a commit that rebuilds an equal state no longer renders. `UI = f(state)` makes that correct, but the comparison now costs time proportional to the state's size on every commit. Measure with the existing render tests, and use reference comparison if it shows up.
- Keep-alive: a fiber suspended in the CLI or the desktop engine now holds Node open. The desktop entry already ends with `process.exit(0)`; check `vlx dev` shutdown and the CLI tests for hangs.

## Phases

Each repo works on branch `effect-v4`. Verification per repo is as in the north-star plan (Valance `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check` plus the browser tests; Nexus `typecheck && test && build`; Port `typecheck && test`).

### Phase 0: spike (half a day, thrown away)

- In Nexus, bump to `effect@4.1.1` and run `pnpm typecheck`. Count the errors per file to confirm the scale (12 source files, 31 test files import Effect).
- In Valance, bump and port `web-manifest.ts` alone on top of `SchemaRepresentation.toRepresentation` (S1). If it reproduces today's manifests, the same view serves `form.ts`, `web-redacted.ts` and `fieldsOf`. Also settle S3: do the formatter hooks cover field-level messages?
- In Nexus, delete `isolated` (S5) and run the two isolation test files. This decides S5 before Phase 1 starts.

### Phase 1: Nexus 0.18

- `effect` → `peerDependencies: "^4.1.0"`, `devDependencies: "^4.1.1"`. `engines.node` → `>=22.19`.
- Services: 3 × `Context.GenericTag` → `Context.Service`.
- Runtime: `Runtime.make`/`Runtime.runFork` → `Context` + `Effect.runForkWith`. `NexusRuntime` keeps its public shape; only its internals change.
- Fibers: `tracked` → `Effect.withFiber`; `Fiber.RuntimeFiber` → `Fiber.Fiber`; `fork` → `forkChild`; `forkDaemon` → `forkDetach`; `Fiber.poll` → `pollUnsafe`.
- `Scope.extend` → `Scope.provide`, `Layer.scoped` → `Layer.effect`, `Stream.interruptWhenDeferred(d)` → `Stream.interruptWhen(Deferred.await(d))`, `Cause`/`Exit` predicates as in the table.
- Audit and test: structural `Equal` in `changes`/`changesWith`; keep-alive in `terminate` and the lifecycle tests; error recovery that now skips defects.
- Public types that mention v3-only names (`Fiber.RuntimeFiber`, `Runtime.*`) are a breaking change: list them in the changelog.

### Phase 2: Valance internals (common, valance, router, cli)

- `effect` peer → `^4.1.0` in common, valance and router. cli moves from `dependencies` to a peer (Decision 2).
- Rewrite the Schema → MESH walker (`web-manifest.ts`) and `web-redacted.ts` for the v4 node set. The acceptance test: **the generated `.valance/manifest*.json` of every example is byte-identical before and after.** Capture them on `main` first.
- `form.ts`, `app.ts`, `contract.ts`: `ParseResult` → `SchemaIssue`; the formatters; `decodeUnknown*` renames.
- 12 × `catchAll`, 3 × `Cause.failureOption`, 2 × `zipRight`, `withFiberRuntime` and `Runtime.runFork` in `valance/src/index.ts`.
- `Schema.Redacted` in state means "already a `Redacted` value" in v4; the v3 meaning is `RedactedFromValue`. Check that the persistence and redaction tests keep their meaning.
- Re-measure `cli/src/budgets.json`. v4's smaller runtime (upstream claims 7.1 kB min+gz for a minimal program) should lower the client bundle; tighten the budget to what is measured.

### Phase 3: the author's surface (Valance)

- `init` templates, all tutorials, `packages/cli/README.md`, every example and `reference/**`: `Schema.Literal(a, b)` → `Schema.Literals([a, b])` and the other Schema renames. `reference/**` pins `">=3.10.0 <4"`: lift it to `^4.1.0`.
- `vlx check` gets two diagnostics:
  - `effect-version`: the project's installed `effect` is not 4.x. It names the installed version and the range needed.
  - `effect-v3-schema`: `Schema.Literal(` with more than one argument, or `Schema.Union(`/`Schema.Tuple(` not given an array, in `src/`. It gives the v4 spelling as a quick fix. This closes the silent break above. Drop the rule in a later minor once v3 projects are gone.
- Tutorial tests (the **File:** blocks are already checked against `examples/todo-multi`) carry the change through.

### Phase 4: Port

- `port/integration`: devDependency → `^4.1.1`; port the two slice tests' `Runtime.runFork`. `port-web` itself needs no release.

### Phase 5: release

Order: Nexus 0.18 → Valance 0.17 (raising its Nexus floor to `^0.18`). Port integration lands whenever, with no release. Each changelog states the Effect floor, the Node floor and the author-facing Schema renames. This is a breaking change on the author's surface, but it is Effect's API, not a new Valance one, so no scorecard audit moves. The new `vlx check` diagnostics improve diagnostics but change no public API.

## Not doing

- Adopting v4 features for their own sake (`Context.Service` classes, `Effect.fn`, Standard Schema in forms). Each is a later, separate change with its own tier.
- Compatibility shims that re-export v3 names.

## Outcome: the render dedupe (Task 8)

The dedupe stays `===` (Task 6's change). Timed on this branch at 10,000 items (15 commits, median): a commit that builds a new but equal state costs 0.8 ms with `Equal.equals` (it renders nothing) against 49 ms with `===` (it renders); a deep-equal copy 45 ms against 49 ms; one changed item at the end of the list 70 ms against 67 ms. Structural comparison is at most 1.05x slower for a real change, well under the 2x line, so by speed alone `Equal.equals` would be kept. It is not restored because contract v1 says otherwise: `docs/reference/v1-contract.md` ("an equal-valued new state still reaches the target") and constraint C32 ("no structural state equality") are Stable and pinned by four tracer-web tripwire tests (`unchanged-render.test.ts` three, `work-counts.test.ts` one), and a fifth (`shared-vs-local-failure.test.ts`, test 2) would change. Restoring it is a contract change for the maintainer to take: the patch is a two-line change in `valance/src/index.ts` plus those tests and the two documents. `packages/valance/test/incremental.test.ts` pins the current behaviour (an equal-valued commit renders; a nested change renders).
