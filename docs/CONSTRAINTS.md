# Architectural constraints (Guarded Tracer Bullet, step 2)

Written *before* the first line of `src/`. Each line is either enforced by a tripwire
(`packages/valance/test/boundaries.test.ts`, `examples/tracer-web/test/*`) or listed
as "reviewed only".

## MUST

1. **C1, one composition boundary.** An application author defines and starts a *Valance* application; they do not wire a NEXUS host to a PORT. *(tripwire: tracer example imports no `Mesh.host`/`createWebPort`.)*
2. **C2, substrate ownership.** Behavior is NEXUS's (`Application.start`, state, commands), render semantics are MESH's (`Mesh.host`, render-v1), realization is PORT's (`draw/update/hydrate`). Valance calls them; it reimplements none. *(reviewed + render tripwire)*
3. **C3, real paths only.** The tracer runs the real compiler, MESH runtime (WASM), NEXUS 0.9 and port-web.
4. **C4, target independence.** The core entry (`.`) names no Web type and imports no PORT package. Target specifics live in the `./web` subpaths. *(tripwire)*
5. **C5, substrates stay independent.** MESH and PORT never depend on Valance or NEXUS; Valance's core depends on NEXUS and (types of) the MESH runtime only. *(tripwire)*
6. **C6, explicit lifecycle.** `start` creates the application; the *caller's Scope* owns its lifetime; `start` is where platform is supplied; Valance owns render/update orchestration (a fiber and a target, both finalized by the Scope, target first); shutdown is scope close or `Application.shutdown`. *(tripwire: lifecycle + J1 isolation)*
7. **C7, program continuity and drawn render stay with the composer** (PORT CONTRACT; NEXUS M1/M2). Valance dispatches each event with the render whose tree is drawn, never a newer one. *(tripwire)*

## MUST NOT

- No router, plugin system, CLI, dev server, platform registry, diagnostics framework, optimizer.
- No second hydration protocol: `hydrate` is PORT's; Valance only decides *when* to call it.
- No `any`; no `ApplicationDefinition.environment` / `CapabilitySource`.
- No application code mutating the target. The only path to the target is state → render → PORT.
- No compat shims. (None were needed; if one appears it is documented in `FINDINGS.md`.)

## Added for stage 2 (written before the multi-view code)

- **C8.** One `Valance.start` per application, however many MESH programs it shows; route state lives in application state; the active program is derived from it.
- **C9.** A program change is PORT's `draw` (continuity is the composer's fact); Valance never asks PORT to `update` across programs.
- No `@valancex/router`, route DSL, navigation registry, or route lifecycle; no second application to simulate navigation.

## Added for stage 3 (URL ↔ application state; written before the code)

- **C10.** Still one `Valance.start`, one state, one platform lifetime. The URL is derived from, and feeds, application `path`; it is never a second source of truth.
- **C11.** Browser Back/Forward enters application behavior through the SAME navigate command a MESH intent uses. No second navigation pathway.
- **C12.** MESH and PORT do not change. NEXUS changes only if the tracer proves a missing primitive.
- No Router/Route/route DSL/registry/link primitive/guards/loaders/redirects/outlets/parameters/wildcards; exact-path comparison only.

## Added for stage 4 (URL shape; written before the code)

- **C13.** URL ≠ state. What a URL means is application code (`urlOf`, `stateOf` in the example app). `Web.history` reads and writes the URL and calls them; it parses nothing.
- **C14.** Same navigate command, same single application. No Router, codec, mapper, normalization, link primitive, or public `urlOf`/`stateOf` API.

## Added for stage 5 (initial URL canonicalization; written before the code)

- **C15.** Starting an application never creates a history entry because `Web.history` saw a representation mismatch.
- **C16.** Interpreting the initial URL (`stateOf`, total) is not synchronization (`urlOf`, later commits). Which one owns canonicalization is decided by evidence, not assumed; no public `replaceState`/canonicalization API unless a stable need is shown.

## Added for stage 6 (the guard; written before the code)

- **C17.** `Web.history` answers "did the application's URL change?" (`urlOf(state)` vs the last synchronized `urlOf`), not "does the browser URL equal the application's?". It is not a canonicalizer.
- **C18.** Starting writes nothing, popstate never writes, and the signature and public surface of `Web.history` do not change.

## Added for stage 7 (stabilization)

- **C19.** The `Web.history` contract is tested at unit level (`packages/valance/test/history.test.ts`); Chromium stays the acceptance check. No new options, API, rollback or resynchronization.

## Added for stage 29 (command lifetime; adopted from the Stage 27/28 evidence)

*The whole lifecycle (application, mount, event command, ledger) is stated once in `docs/FINDINGS.md`, "Canonical lifecycle architecture". C20 to C26 are its invariants.*

- **C20, command lifetime (safety).** A command admitted through the application's command boundary (`inApplication`, reached by both `ApplicationHandle.invoke` and MESH dispatch) remains owned by the application until it exits. When draining begins (the caller's Scope closes), VALANCE closes admission and interrupts and awaits every already-admitted command BEFORE NEXUS terminates and platform resources release. *(tripwire: `examples/tracer-web/test/capability-async.test.ts`, "the VALANCE command-lifetime contract")*
- **C21, admission during drain.** No new command is admitted after draining begins; the refusal is a defect (`VALANCE: admission is closed (draining)`). The check and the registration are one synchronous step. *(tripwire: same)*
- **C22, ownership boundary.** The registry owns commands, not application fibers: daemon and escaped fibers are outside it; structured children are covered by their command. It is internal: `ApplicationHandle` exposes no lifecycle, drain, shutdown or registry. NEXUS, MESH and PORT are unchanged.
- **C20, trigger and scope (Stage 30, clarifies C20).** "Draining begins" means the caller's Scope closing, the only route in the VALANCE model. The drain constrains admission and the lifetime of admitted commands; it does not forbid state changes by commands that are still running (Stage 30, Interpretation A). `Application.shutdown(running.nexus)`, reachable only through `./internal`, is the substrate's early end: it does not pass the drain and the contract is not claimed for it.
- **C23, liveness limitation (documented, not solved).** An uninterruptible admitted command that depends on a NEW admission can keep shutdown from completing; the application stays alive and its resources are not released under the command. No timeout, forced interruption, watchdog or fallback admission. *(tripwire: contract 5)*
- **C25, event commands (Stage 39).** A command admitted from a mount's event is the application's, exactly like an invoked one: it remains owned by the application until it exits. Closing the mount that reported the event ends that mount's follower and target, not the command; the application's close interrupts it through the registry (C20 to C22). The mount remains the source: its ledger (`Mounted.dispatched`) records the exit, even after it closed. *(tripwire: `test/event-ownership.test.ts`, `browser/event-lifetime.browser.test.ts`)*

## Added for stage 38 (mount lifetime)

- **C24, a mount's lifetime is the caller's Scope's.** `mount`/`hydrate` end with the Scope the caller supplies (target and follower finalized by it, target first), and relate to the application's Scope in no other way. The application ending ends the mount's follower, not its target. An independent mount may therefore outlive its application as a drawn, inert target until its own Scope closes. This is permitted, not an error. *(tripwire: `browser/mount-lifetime.browser.test.ts`, `test/scope-topology.test.ts`)*

## Added for stage 40/41 (the event-exit ledger)

- **C26, the event-exit ledger is a mount-owned diagnostic observation facility.** `Mounted.dispatched` is append-only (settle order, never removed or reordered), belongs to the mount that dispatched, keeps receiving exits after that mount's target closed until its commands have exited, and lives as long as `Mounted` is held. It is not application state, is not exposed by `ApplicationHandle`, is read by nothing in Valance, and is not part of the application programming model. `Mounted.settled` is a barrier over an open mount's own held dispatches, does not read the ledger, and on a closed mount returns at once. *(tripwire: `packages/valance/test/entry.test.ts` (the handle is `{state, invoke}`: `packages/valance/test/entry.test.ts`), `browser/event-ledger.browser.test.ts`)*

## Status (Web.history exploration closed)

C10 to C19 are satisfied by the code at `40a9793` and its tests. The contract is stated once, in `docs/FINDINGS.md` Stage 7. Browser URL ≠ application URL; `Web.history` synchronizes application URL transitions and never detects navigation by comparing the browser URL with the state; it does not restore or rewrite the browser URL after a popstate navigation that produced no state transition (application policy).

## Added for the navigation boundary (probes in `examples/tracer-web/test/history-boundary.test.ts`)

- **C27, the navigate key is the application's, not Valance's.** `"app/navigate"` appears in no Valance source: it is the name of one binding in the application's table, and `HistoryOptions.navigate` is how history is told it. MESH intents, `invoke` and popstate reach that one binding, so there is one semantic entry point. Valance does not know the command's argument shape: it passes `stateOf(url)` through unread.
- **C28, history fails closed and logs.** A popstate whose navigate key is unbound (`UnmappedCommand`), whose argument the command rejects (`CommandValidationError`), or whose `urlOf`/`stateOf` throws, changes no state and writes no URL; the failure is logged (`Effect.logError`), never returned (`history` has no error channel), and later navigation still synchronizes. Browser URL and application state may then differ until the next application navigation; restoring one is the application's policy. Invariant added: a defect in the application's `urlOf` or `stateOf` never ends the history follower.
- Whether every committed view transition must be realized, or may be coalesced: decided by C32 (a mount may skip superseded intermediates).

## Added for multi-mount semantics (`examples/tracer-web/test/multi-mount-views.test.ts`)

- **C29, one application, N mounted presentations.** A started application has one NEXUS runtime, state, resource lifetime and `view(state)`; each mount owns only a target, the render it drew, and its own draw/update continuity. The view is the application's, so every mount shows the same one (there is no per-mount view); a report is dispatched against its own mount's drawn render; closing a mount ends that presentation and nothing of the application; application resources are released by the application's Scope, after every mount that shares it.

## Added for lifecycle ownership (`examples/tracer-web/test/lifecycle-ownership.test.ts`)

- **C30, every binding lives in the Scope it was given.** Like a mount (C24), `Web.history` owns its listener and follower through its own Scope, related to the application's only by what the caller passes. In a shared Scope it ends before the application; in its own Scope it outlives the application as an inert listener (the follower ended with the state stream, navigation is refused, nothing is written) until that Scope closes. A closed mount leaves its container empty and the container takes a new mount; mount and hydrate are per-mount choices. Two live mounts on one container are not a supported arrangement (PORT promises no container exclusivity, and Valance does not know containers).

## Added for the inert mount (`examples/tracer-web/browser/inert-mount.browser.test.ts`)

- **C31, a mount that stops following is inert, not unmounted.** Whatever ends a mount's follower (the application ending (C24), an invalid MESH render, a failing PORT target) leaves its target drawn with the last good render, retained for events, until that mount's own Scope closes; `followed` says why. The application stays authoritative and keeps committing, nothing recovers by itself, other mounts and fresh mounts are unaffected (a fresh mount renders the current state), and closing the inert mount disposes only it. The owner of the cause differs, the effect does not: an invalid render comes from the state, so every mount that renders that state ends (a mount may skip a superseded invalid state, C32); a target failure ends only its own mount.

## Added for bursty commits (`examples/tracer-web/browser/burst.browser.test.ts`)

- **C32, a mount presents committed state in commit order and may skip superseded intermediate states.** Application state is authoritative and independent of presentation: every command commits, `State.values` carries every commit, and a slow or failing mount never delays a commit. A mount's presentations start from the state current when it begins following and converge on the latest committed state. Each one is rendered from the latest state available when the mount reaches it, so a state superseded before then is skipped; what is presented is never reordered, repeated or invented, and a state already presented is not presented again. Continuity is relative to the render actually presented: a view other than the drawn one is a `draw`, the same view an `update`, even when a skipped intermediate was another view (so DOM-resident state such as focus survives a skipped round trip and is lost by a presented one). An event is dispatched against the render its mount currently has drawn, whatever has committed since. Mounts consume independently: they may skip different intermediates and converge on the same latest state. Not guaranteed: that every committed state is presented, how many are, or when; which are skipped; that an invalid-render intermediate is rendered (its MESH diagnostic exists only if that state is rendered, C31), though an invalid LATEST state fails the mount; latency, fairness or main-thread responsiveness. History is unaffected: `Web.history` follows committed states in its own subscription (C17). Pacing is the caller's: an application or host that cares about input latency issues commits across macrotasks through the public API (awaiting `invoke`, or an application command that sleeps between commits), and a mount's work then follows the commit rate; Valance neither paces nor yields. The cost of one presentation belongs to MESH's synchronous `render` and the target's synchronous `draw`/`update` (PORT's `void` operations, with no completion signal): Valance holds no partially realized render and has no meaningful split point, and asynchronous or incremental realization would be an upstream MESH/PORT contract change that nothing currently requires.
