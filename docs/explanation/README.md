# Explanation

> **TL;DR:** How VALANCE is built, why it behaves as the [contract](../reference/v1-contract.md) says, and the evidence behind each decision. You do not need any of this to use VALANCE; come here when you want a reason.

## Start here

* [What is VALANCE?](what-is-valance.md): the problem, the model, and the words.
* [Design north star](design-north-star.md): the rules every public API is held to.
* [Direction](direction/README.md): where VALANCE is heading, the open [bets](bets/README.md), and the [decisions](direction/decisions.md) taken on them.

## How it is put together

VALANCE composes three packages and adds almost nothing of its own. Each has one job:

| VALANCE concept | Implemented by | What that package owns |
|---|---|---|
| state, commands, resources, the application's runtime | [NEXUS](https://github.com/ValanceX/Nexus) | the state cell, command definition and admission, capabilities, the application lifetime |
| a view description and what it renders to | [MESH](https://github.com/ValanceX/Mesh) | the MPRX language, the compiler (`compileProgram`), the runtime that renders a program to a render tree (`render-v1`), event resolution |
| drawing on a target (the DOM) | [PORT](https://github.com/ValanceX/Port) | `draw`, `update`, `hydrate`, realizing a render tree, reporting interactions |
| composing them: starting, choosing the view, following state, dispatching events, lifetimes | **VALANCE** | which view is current, and so whether a presentation continues the previous one; the ownership and shutdown order |

### Concept first, mechanism second

The Learn pages use VALANCE's words. This is what each one is made of, for when you need to know:

| What you write or read | What it is underneath |
|---|---|
| a **command** | a NEXUS command (`Command.define`, or `command(state)(…)`, which makes one), bound to a name by `entry` as a MESH intent binding |
| **async work** | Effect: a command's body is an Effect that can suspend, fail and be interrupted. "Closing the application cancels it" is Effect interruption, driven by VALANCE's registry of admitted command fibers |
| a **view description** / `program` | a MESH program (compiled MPRX templates plus a manifest); a render is a MESH render-v1 tree |
| **drawing** / **hydrating** | PORT `draw`, `update` and `hydrate` on a target |
| the **application lifetime** and "owned by the application" | the caller's `Scope`, NEXUS's runtime, and the registry that admits and drains commands before NEXUS terminates (C20 to C25) |
| a **platform** and a **resource** | a NEXUS `Platform` layer; capabilities resolved through its environment |
| **start-time work** | one table entry admitted through that same registry, with no caller (C35) |

### The Effect boundary

VALANCE's own handle is Effect-shaped: `start` needs a `Scope`, `invoke` and `state` return `Effect`s. `Web.run` is the Promise-shaped host for an ordinary page, so an application there never touches them. A command that does more than compute the next state is an Effect, so it needs NEXUS's `Command.define` and `effect`; that is the only place a typical application sees them. This is a deliberate edge, not an oversight: wrapping it would hide the interruption and resource semantics that §18 depends on. The contract states it in terms of VALANCE's behavior; the engines' documentation says how they work.

The same split is stated normatively in [Contract §1](../reference/v1-contract.md#1-what-valance-is) and held by tripwires in [`CONSTRAINTS.md`](constraints.md) (C1 and C2: an author never wires NEXUS to PORT; behavior is NEXUS's, render semantics are MESH's, realization is PORT's). What each package's rules are belongs to that package's own documentation: [NEXUS](https://github.com/ValanceX/Nexus), [MESH](https://github.com/ValanceX/Mesh) (its manual covers `render-v1` and the compiler), [PORT](https://github.com/ValanceX/Port).

## Glossary

Words that mean more than one thing across the four repos, and which name is canonical: [glossary](../reference/glossary.md).

## The evidence

- [`CONSTRAINTS.md`](constraints.md): the engineering constraints and tripwires the code is held to, each with the test that enforces it. A maintainer's record, not the user contract.
- [`FINDINGS.md`](findings.md): the chronological investigation record (Stages 1 to 56 and the milestone): what each guarded experiment proved, invalidated or left open. It is evidence, kept as it was written. Where a later stage replaced an earlier mechanism, the later stage wins; its own header says how to read it. Start with [Canonical lifecycle architecture](findings.md#canonical-lifecycle-architecture-consolidated-at-stage-41-evidence-in-stages-29-to-40) and [Architectural checkpoint](findings.md#architectural-checkpoint-stage-56-what-the-real-vertical-slice-has-demonstrated).
- [Changelog](../../CHANGELOG.md): what changed in each release.
- Executable evidence: `packages/valance/test/` (the contract's tripwires) and `examples/tracer-web/` (the contract test suite, formerly the tracer: jsdom tests, Chromium tests, a built page). A model application, built on the published package, is `examples/docs-site/`.

## From a concept to its evidence

| Concept (contract) | Why it is this way: findings | Constraints |
|---|---|---|
| One application, one state ([§2](../reference/v1-contract.md#2-application), [§3](../reference/v1-contract.md#3-state-and-commands)) | [8](findings.md#stage-8-the-application-model-tracer-what-is-an-application), [9](findings.md#stage-9-the-application-model-on-nexus-0101--mesh-070--port-web-022-with-keyed-identity-and-history), [11](findings.md#stage-11-application-model-reassessment) | the first MUST list; [stage 2](constraints.md#added-for-stage-2-written-before-the-multi-view-code) |
| The public API shape and vocabulary ([§2](../reference/v1-contract.md#2-application)) | [15](findings.md#stage-15-public-api-shape-tracer-two-candidates-one-definition), [16](findings.md#stage-16-is-there-an-application-level-external-face), [17](findings.md#stage-17-the-first-public-application-boundary), [18](findings.md#stage-18-application-api-vocabulary-boundary) | MUST / MUST NOT |
| A view is a function of state; continuity by view name ([§5](../reference/v1-contract.md#5-views-and-presentation)) | [2](findings.md#stage-2-one-application-several-mesh-programs), [9](findings.md#stage-9-the-application-model-on-nexus-0101--mesh-070--port-web-022-with-keyed-identity-and-history), [35](findings.md#stage-35-one-application-several-mounts-observed-evidence-no-source-change) | [stage 2](constraints.md#added-for-stage-2-written-before-the-multi-view-code) |
| Commands, admission, command lifetime ([§3](../reference/v1-contract.md#3-state-and-commands), [§9](../reference/v1-contract.md#9-scopes-and-shutdown)) | [25](findings.md#stage-25-can-application-work-lifetime-be-established-above-nexus-a-platform-owned-registry-of-command-fibers), [26](findings.md#stage-26-where-valance-owns-command-lifetime-the-two-entry-paths-tested), [27](findings.md#stage-27-closing-valances-own-entrance-when-its-drain-begins), [28](findings.md#stage-28-the-command-lifetime-boundary-inside-the-real-valance-start-spike), [29](findings.md#stage-29-the-command-lifetime-contract-adopted), [39](findings.md#stage-39-who-owns-an-admitted-click-command-decision-the-application) | [stage 29](constraints.md#added-for-stage-29-command-lifetime-adopted-from-the-stage-2728-evidence) |
| Resources and platform ([§4](../reference/v1-contract.md#4-capabilities-and-resources)) | [19](findings.md#stage-19-an-application-owned-capability-tracer), [20](findings.md#stage-20-an-asynchronous-application-owned-capability-tracer), [21](findings.md#stage-21-an-in-flight-capability-call-whose-resource-has-been-finalized-probe), [22](findings.md#stage-22-the-execution-boundary-after-termination-observation-only-probe), [23](findings.md#stage-23-can-the-resource-owner-keep-its-resource-alive-until-admitted-users-finish-probe), [24](findings.md#stage-24-a-resource-that-interrupts-its-in-flight-users-when-it-is-finalized-probe) | [stage 29](constraints.md#added-for-stage-29-command-lifetime-adopted-from-the-stage-2728-evidence) |
| Async work, start-time work, application-lifetime resources ([§18](../reference/v1-contract.md#18-asynchronous-work-and-start-time-work)) | no stage; the evidence is executable and anchored by C35 to C37: `application-owned-async.test.ts`, `application-start-work.test.ts`, `server-start-work.test.ts`, `application-scoped-capability.test.ts`, `lazy-loading.test.ts` (loading and admission; dynamic views are characterized there as unsupported) | [C35 to C37](constraints.md#added-for-application-owned-async-work-start-time-work-and-application-lifetime-resources) |
| Presentation under fast changes: coalescing, an in-flight render, keyed identity ([§5](../reference/v1-contract.md#5-views-and-presentation)) | no stage; `render-supersession.test.ts` (an in-flight render belongs to its mount and may present one stale frame) and `work-counts.test.ts` (the measured cost of a commit: one evaluation and one render per presentation, PORT changes only what differs) | [C32](constraints.md#added-for-bursty-commits-examplestracer-webbrowserburstbrowsertestts) |
| Async work, composition, ownership ([§3](../reference/v1-contract.md#3-state-and-commands)) | [31](findings.md#stage-31-async-data-flow-observed-evidence-no-abstraction-added), [32](findings.md#stage-32-async-composition-and-ownership-observed-evidence-no-source-change) | |
| Mounts: lifetime, several mounts, inertness ([§6](../reference/v1-contract.md#6-mounts)) | [35](findings.md#stage-35-one-application-several-mounts-observed-evidence-no-source-change), [37](findings.md#stage-37-application--mount-scope-topology-observed-evidence-no-source-change), [38](findings.md#stage-38-whose-lifetime-is-a-mounts-decision-caller-owned-no-behavior-change) | [stage 38](constraints.md#added-for-stage-38-mount-lifetime), [multi-mount](constraints.md#added-for-multi-mount-semantics-examplestracer-webtestmulti-mount-viewstestts), [the inert mount](constraints.md#added-for-the-inert-mount-examplestracer-webbrowserinert-mountbrowsertestts) |
| Events, the retained render, failure at the event boundary ([§7](../reference/v1-contract.md#7-retained-render-and-interaction), [§10](../reference/v1-contract.md#10-failure-model)) | [12](findings.md#stage-12-application-event-entry-is-self-contained), [33](findings.md#stage-33-failure-at-the-event-boundary-observed-evidence-no-source-change), [34](findings.md#stage-34-ownership-and-retention-of-event-dispatch-exits-observed-evidence-no-source-change), [36](findings.md#stage-36-who-owns-a-click-initiated-command-observed-under-both-models-evidence-no-production-change-kept), [40](findings.md#stage-40-the-event-exit-ledger-contract-decision-a-diagnostic-observation-facility) | [stage 40/41](constraints.md#added-for-stage-4041-the-event-exit-ledger) |
| `Mounted` and its observation aids ([§6](../reference/v1-contract.md#6-mounts)) | [42](findings.md#stage-42-mounted-and-dispatchexit-on-the-package-surface-decision-keep-mounted-move-dispatchexit-behind-internal), [43](findings.md#stage-43-the-public-shape-of-mounted-decision-keep-static-audit-no-probe), [44](findings.md#stage-44-the-first-host-integration-of-mounted-the-web-host-run-consumes-followed), [45](findings.md#stage-45-can-a-real-host-observe-event-command-outcomes-with-settled--dispatched-yes-at-the-moments-the-host-has) | |
| History and URLs ([§8](../reference/v1-contract.md#8-history)) | [3](findings.md#stage-3-url--application-state-chromium), [4](findings.md#stage-4-the-url-is-not-the-state-base-path--query), [5](findings.md#stage-5-who-owns-initial-url-canonicalization), [6](findings.md#stage-6-the-guard-url-differs-versus-the-applications-url-changed), [7](findings.md#stage-7-the-webhistory-contract-stabilized) | [stages 3 to 7](constraints.md#added-for-stage-3-url--application-state-written-before-the-code), [the navigation boundary](constraints.md#added-for-the-navigation-boundary-probes-in-examplestracer-webtesthistory-boundarytestts) |
| Server rendering and hydration ([§6](../reference/v1-contract.md#6-mounts), [§17](../reference/v1-contract.md#17-server-rendering-rendertohtml)) | [10](findings.md#stage-10-ssr--hydration--keyed-update), [53](findings.md#stage-53-what-the-server-hands-the-browser-the-payload-boundary-coherent-no-change) | |
| Lifecycle, Scopes, shutdown order ([§9](../reference/v1-contract.md#9-scopes-and-shutdown)) | [13](findings.md#stage-13-the-lifecycle-boundary-a-tracer-that-stopped), [14](findings.md#stage-14-early-termination-is-not-part-of-the-valance-model), [30](findings.md#stage-30-closing-the-lifecycle-boundary-audit-no-mechanism-change), [41](findings.md#stage-41-lifecycle-consolidation-documentation-only) and [Canonical lifecycle architecture](findings.md#canonical-lifecycle-architecture-consolidated-at-stage-41-evidence-in-stages-29-to-40) | [lifecycle ownership](constraints.md#added-for-lifecycle-ownership-examplestracer-webtestlifecycle-ownershiptestts), [lifecycle races](constraints.md#added-for-lifecycle-races-examplestracer-webtestlifecycle-racestestts) |
| The browser host, `Web.run` ([§16](../reference/v1-contract.md#16-the-browser-host-webrun)) | The shipped `Web.run` has no stage of its own; its evidence is `examples/tracer-web/test/web-host.test.ts` (and `host-run.test.ts`). The stages below investigated the tracer's own page host `run`, an example convenience that is not API (see "Not extracted" in FINDINGS), which also logged abnormal ends where `Web.run` logs nothing: [46](findings.md#stage-46-the-first-real-page-entry-a-document-a-script-run), [47](findings.md#stage-47-what-a-real-page-does-when-run-cannot-start-observed-then-a-page-only-policy), [48](findings.md#stage-48-the-real-page-across-url-changes-observed-no-change-needed), [49](findings.md#stage-49-a-real-backforward-cache-restore-hypothesis-confirmed-one-page-local-fix), [50](findings.md#stage-50-time-after-a-bfcache-restore-one-time-sensitive-behavior-no-defect-no-policy), [51](findings.md#stage-51-the-real-page-without-the-dev-server-built-served-loaded), [52](findings.md#stage-52-the-built-page-served-by-an-ordinary-process), [54](findings.md#stage-54-one-pressure-point-in-the-real-page-focus-after-a-program-change-host-owned-not-a-contract-deficiency), [55](findings.md#stage-55-can-a-real-page-inject-its-own-target-through-the-public-path-yes-the-limit-is-the-examples-run-not-valance) | |
| The authoring helpers `command` and `entry`, and building a view description ([§14](../reference/v1-contract.md#14-authoring-helpers-command-and-entry), [§15](../reference/v1-contract.md#15-building-a-view-description)) | no stage of the investigation record covers them; the evidence is executable: `packages/valance/test/entry.test.ts`, `author-surface.test.ts`, and `examples/tracer-web/test/inbox.test.ts`. `compileProgram` is [MESH](https://github.com/ValanceX/Mesh) 0.9's | |
| Not guaranteed ([§11](../reference/v1-contract.md#11-intentional-non-guarantees)) | [14](findings.md#stage-14-early-termination-is-not-part-of-the-valance-model) and the [Milestone: validated VALANCE composition](findings.md#milestone-validated-valance-composition) | |

Anchors into `CONSTRAINTS.md` follow its section titles; if one does not resolve, search the file for the stage number.

## Release history

[`v0.1`](../reference/releases/v0.1.md), [`v0.2`](../reference/releases/v0.2.md), [`v0.2.1`](../reference/releases/v0.2.1.md), [`v0.3`](../reference/releases/v0.3.md), [`v0.4`](../reference/releases/v0.4.md), [`v0.5`](../reference/releases/v0.5.md).
