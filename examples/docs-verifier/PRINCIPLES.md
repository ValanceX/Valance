# Verification against API Design Principles v1.0

Subject: the released set from the npm registry: `@valancex/valance` 0.7.0, `@valancex/nexus` 0.12.0, `@valancex/mesh-runtime` 0.10.0, `@valancex/mesh-compiler` 0.10.0, `@valancex/port-web` 0.4.0.
Method (§18): a consumer's tasks, written from the public packages only. `pnpm test:principles` runs 20 probes (`principles/*.test.ts`) and writes what each saw to `principles/evidence/`.
A confirmed defect is a probe marked `it.fails`: the suite is green while it is open, and goes red the moment it is fixed, so the marker is then removed.
The docs are referential: where a doc and the behaviour disagree, the behaviour is what was judged.

## Status after the follow-up (prepared, nothing tagged or published; the verifier runs against packs of them)

| # | Fix | Where | Release |
|---|-----|-------|---------|
| P1 | URL attributes refuse `javascript:`/`vbscript:` (and a navigable `data:`) as `unrealizable-value`, in draw, update, hydrate, `patch` and server HTML; 17 new tests | Port | `@valancex/port-web` 0.4.1 |
| P2 | The doc comment now states the logging; the **behavior is unchanged**: the whole cause is logged unredacted, which `stability.md` has listed as Stable since 0.6.0. Changing a stable surface is a minor release's decision (an opt-in or identity-only log), so the probe stays an open `it.fails`. | Valance | `@valancex/valance` 0.7.1 (doc only) |
| P3 | README gains an install line and a stability section | Mesh `main` | rides the next MESH release (no code change warrants a lockstep 0.10.1) |
| O1 | `./package.json` exported | Nexus | `@valancex/nexus` 0.12.1 |

P1 and O1 are confirmed fixed against the packs of PORT Web 0.4.1 and NEXUS 0.12.2 (`pnpm test:principles` through `scripts/with-local-packs.mjs`): the P1 probe is now an ordinary test that a `javascript:` link is refused (`unrealizable-value`), and the O1 check asserts all five manifests resolve. P3 flips when MESH next releases; P2 stays open.

NEXUS 0.12.2 also declares `sideEffects: false` (found while making Valance's entries tree-shakable), and Valance 0.8 adds the plugin seams (`docs/V1_CONTRACT.md` §19).

## Result

Seventeen probes hold. **Three defects are confirmed**, plus observations. Nothing found blocks the released set; two of the three are security-relevant defaults.

| # | Principle | Finding | Evidence | Severity | Recommendation |
|---|-----------|---------|----------|----------|----------------|
| P1 | §11 secure defaults | `Web.link` (and the `href` realization) writes a `javascript:` URL into the DOM as given: `<a href="javascript:alert(1)">`. A destination that comes from data (a CMS, a query string) is script on click. | `security.test.ts` "a link whose destination is data" | **High** | Default-deny schemes in `link`/`attribute("href")` (allow `http`, `https`, `mailto`, `tel`, relative; others rendered inert), with an explicit opt-in on the primitive for anything else. |
| P2 | §11, §9.4 errors/logs | Valance logs the whole cause of a failed `start` work: `level=ERROR message="start-time work failed" cause="Error: {…\"authorization\":\"Bearer s3cr3t-token\"}"`. A secret a failure carries lands in the consumer's logs without their choosing. The doc for `StartOptions.start` says its exit "is not reported anywhere", which the behaviour contradicts. | `security.test.ts` "start-time work" | **Medium** | Log the failure's identity (`_tag`/`code`) and a message, not the value; offer the full cause only behind an opt-in `onStartFailure`. Fix the doc whichever way it goes. |
| P3 | §14/§16 docs and tiers | `@valancex/mesh-compiler`'s README names no stability tier and no install line. | `surface.test.ts` §16/§14 | Low | Add both, as the other four READMEs have. |
| O1 | §16, tooling | `@valancex/nexus` does not export `./package.json` (the other four do), so tools that read versions through `require.resolve` fail on it. | `surface.test.ts` `packageJsonResolvable` | Low | Add `"./package.json": "./package.json"` to its `exports`. |
| O2 | §4 type safety | A command key (`"app/name"`) is a string; a typo is the typed failure `UnmappedCommand` at run time, not a compile error. `Command.invoke` takes `unknown` by design (it is the validated boundary). | `types.test.ts`, `errors.test.ts` | Info | Acceptable at the boundary; a typed `invoke` derived from the command table would remove the class of mistake. |
| O3 | §9 errors | After full close, `invoke` fails with the Nexus refusal `code:terminating`, not Valance's `admission-closed`; both satisfy `Valance.isRefusal`. | `errors.test.ts` `valance.closed` | Info | Documented pair of codes would help a consumer who switches on `code`. |
| O4 | §14 docs | A released render still works after `release()` (documented), except one made by `updateChanges` (`render-gone`). A name that suggests "invalid" for something that mostly still works is easy to misread. | `errors.test.ts` | Info | None needed; the docs state it. |

## What held, by principle

- **§3 signatures.** 165 public callables across the five packages: none takes more than three positional parameters, none takes a positional boolean.
- **§4/§9 errors with identity.** Compile diagnostic `unknown-reference` with a location and the suggestion `count` for `cuont`; runtime `runtime-value-mismatch` with a path and a hint, resolved not thrown; misuse of the runtime API throws a coded `TypeError` (`invalid-argument`, `render-gone`); port misuse is `WebRealizationError` (`not-drawn`); Nexus input errors are `_tag:CommandValidationError`; Valance tells apart unmapped (`_tag`), closed (`code`) and corrupt initial state.
- **§11 text is text.** Markup in a value is shown, not parsed. A secret in an ordinary command failure is returned to its caller and is not logged by Valance.
- **§8 lifecycle.** Closing a scope twice, unmounting twice and disposing after unmount are all no-ops.
- **§9 async.** Cancelling the caller of a running command aborts its `AbortSignal` and writes no later state; closing with grace 0 interrupts in-flight work, with a grace it finishes and lands; 50 concurrent commands are serialized with no lost update.
- **§17 consistency.** One peer story: Valance and Nexus name Mesh runtime `^0.10.0`, Valance names Port `^0.4.0`, Port accepts `0.6–0.10`.
- **§5/§12 cost and no hidden nodes** (verified earlier in the verifier): later renders are `update` plus `patch` and cost what changed; templates make no node they did not write (`site.test.ts`).

## Not covered here

§12 cost beyond the existing tripwires, §17 server/client divergence beyond hydration, and the README snippets of Nexus and Valance compiled as code were not probed in this pass.
