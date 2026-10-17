# Direction

Where Valance is heading, how we decide, and how to take part. This is not a roadmap: it promises no features and no dates. It says what we hold fixed, what we are still finding out, and what has to be true before we ask anyone to build on a surface.

*Written 2026-10-17. Valance is pre-1.0, and until the [Reference Gate](#gates) passes, anything may break.*

## Where things stand

An honest map. Tiers are the ones in [API stability](../stability.md); stages are defined [below](#bets-and-their-stages).

| Area | State today | What it means for you |
|---|---|---|
| The model: state, commands, views, events | Works, tested across [MESH](https://github.com/ValanceX/Mesh), [NEXUS](https://github.com/ValanceX/Nexus), [PORT](https://github.com/ValanceX/Port) and Valance. Pre-1.0: a minor version may change it, and the change is named in the release notes | Safe to try and build small things on |
| Web and Desktop targets | Both work. The Desktop PORT is built from source for now. The two vocabularies differ in places ([Bet 1](bets/primitive-specification.md) lists exactly where) | A template written with only the portable core may still need a change to run on both |
| Application model and `vlx` | Provisional | Expect renames |
| Size, speed and installing | Measured on 2026-10-17 ([baseline](baselines/2026-10-17.md)): a counter application transfers about 334 KB (brotli) and shows in about 0.2 s locally, and 83 percent of its JavaScript is Effect. The newest published versions of `mesh-runtime` and `port-web` are not accepted by `valance` 0.13.0, so a plain install gets older ones | Fine for an application. Worth knowing before choosing it for a very small page |
| Loading | One entry chunk, and the WebAssembly runtime is fetched after the JavaScript has run. No code splitting, no preloading. The build raises the bundler's chunk-size warning limit to 1,500 kB instead of reporting size ([Bet 3](bets/budgets.md#8-the-start-up-path-and-the-deferred-set)) | Works, and starts slower and heavier than it needs to |
| Components you can share as a package | **Not built.** A package cannot yet contribute templates or tags | You cannot publish a component library yet |
| Styling and themes | **No contract.** The web uses plain CSS hooks on some tags; the Desktop has no styling ([Bet 6](bets/style-contract.md)) | You cannot publish a style library yet |
| Accessibility | Roles, names and states are mapped per primitive on both targets. There is no shared model, and no check that a control has a name | Do not assume a primitive is accessible because it compiles |
| Behavior that needs its own state (tabs, menus, dialogs) | **Not designed.** State is application-level only | Such components would leak state into your application |
| Overlays, virtual lists, forms from a schema | Not built | |

If something you need is in a "Not built" row, that is not an oversight to wait out. It is probably one of the [bets](bets/README.md), and telling us what you tried is the most useful thing you can do.

## Why "Direction" and not "roadmap"

A roadmap tells readers what will be delivered and roughly when. We do not know that yet, and finding out is the work. Projects that explore in public tend to separate the three things a roadmap muddles:

| Part | Job | Changes |
|---|---|---|
| **Direction** (this page) | What we hold fixed and what we are optimizing for | Rarely; a change is an event |
| **[Bets](bets/README.md)** | One open question each, as a hypothesis with an experiment and kill criteria | Continuously |
| **[Gates](#gates)** | What must be true before a surface is offered to others | Only when the bar moves |

Precedent, from each project's own documents: TC39 moves a proposal through numbered stages with entry criteria and warns that a stage-2 feature "may never be included in the standard"; React Labs posts describe "projects in active research and development", including ones "currently on hold"; Angular's roadmap puts dates only on completed work. Sources and reliability are in [prior art](prior-art.md).

We follow one rule on this page: **dates appear only on things already shipped.** Everything else has a stage and a gate.

## What we hold fixed

The first eight are already written down in the repositories; the ninth is new direction. They are the reason to build here, and a bet may not trade them away.

1. **A view is data, not code.** MPRX has no arbitrary code, no side effects and no business logic ([MESH architecture rules](https://github.com/ValanceX/Mesh/blob/main/docs/ARCHITECTURE.md)).
2. **Checked before it runs.** Mistakes are diagnostics with stable codes and a suggestion, never a surprise in front of a user.
3. **One evaluator.** MESH evaluates MPRX exactly once, in its runtime.
4. **Renderer independence.** A render tree carries no DOM, canvas or widget assumption. PORT decides how a target realizes it.
5. **Behavior belongs to NEXUS, realization to PORT, meaning to MESH.** Valance composes them and reimplements none ([constraints C1 and C2](../CONSTRAINTS.md)).
6. **Nothing is dropped silently.** A PORT refuses or visibly surfaces what it cannot realize ([PORT contract](https://github.com/ValanceX/Port/blob/main/docs/CONTRACT.md)).
7. **Evidence before abstraction.** A primitive enters the portable layer only after two targets have realized it, and a design records the alternatives it rejected.
8. **Data only on every wire format.** No executable references in render trees, patches or the host protocol.
9. **Start-up carries only what start-up needs.** A production build ships the smallest output it can, the rest loads in parallel as soon as the application has started, and a development build says nothing about size ([budgets](bets/budgets.md#7-production-and-development-builds)).

## The free window

Because nobody depends on Valance yet, change is cheap, and learning is the point. So until the Reference Gate passes:

- Anything may break, with no compatibility shim and no migration guide.
- Every break still says what changed and what replaces it. Where we can, the old form becomes a diagnostic that names its replacement, as MESH 0.11 did with `mesh-if` and `mesh-each`.
- We spend the window on changes that were deferred "for a major version" and are cheapest now: names that disagree with the ARIA names the shared content layer already uses, props that differ between the web and the Desktop, the `class` and `theme` hooks that exist on some tags only, and where the authoring API lives.
- Before the window closes we install the machinery that makes later change safe:
  - **Editions.** A language and vocabulary edition field, on the model Rust's editions use: warning-free code on edition N must compile on N+1 with the same behavior, and old editions keep working side by side. Rust's RFC also lists the cost: it can muddy the stability story and invalidate older documentation.
  - **A vocabulary evolution policy.** Which changes to a primitive are minor (an optional prop is added) and which are major (a rename, a new required prop, a new value in a closed set, a changed role).
  - **Deprecation diagnostics** that name the replacement.

## Bets and their stages

A bet is a question we expect to answer by trying. Each has a one-page [brief](bets/README.md#the-brief) and a stage:

| Stage | Name | Entry |
|---|---|---|
| 0 | Question | The problem and who is hurt are written down |
| 1 | Evidence | Prior art read from primary sources; past failures listed; our invariants stated |
| 2 | Design | A written design with rejected alternatives, drafted conformance vectors, and kill criteria |
| 3 | Prototype | Working behind a marked namespace on one target, measured against the budgets |
| 4 | Proven | Two targets realize it and the reference library uses it from outside |
| 5 | Stable | Frozen under an edition, with docs and a migration story |

A bet can also be **killed**. A killed bet stays in the index with the reason, because a recorded dead end is evidence.

## Gates

| Gate | Passes when | Unlocks |
|---|---|---|
| **Spec Gate** | Today's tables regenerate from the primitive specifications with no test changes, and the web/Desktop parity report is green or waived per primitive with a reason | New primitives are written only as specifications |
| **Language Gate** | Variant-capable types and typed template values are at stage 4, with conformance vectors in Rust and JavaScript | Component libraries can be typed |
| **Reference Gate** | A component library and a theme, built outside these repositories using only public seams, work on both targets; budgets are met; a screen-reader run is recorded | We invite outside authors and freeze edition 1 |
| **Edition Gate** | The edition field, the evolution policy and deprecation diagnostics exist | The first stable promise |

## What we will not do

Written down because a small foundation stays small by refusing things.

- A style engine that runs in the browser (a CSS-in-JS runtime).
- Arbitrary code in views, or executable references on any wire format.
- General union types or generics in MPRX.
- Component-local mutable state inside templates.
- A portable primitive with only one realization.
- Optimizing arbitrary JavaScript as part of the critical path ([NEXUS future direction](https://github.com/ValanceX/Nexus/blob/main/docs/FUTURE_DIRECTION.md) is research, and nothing here depends on it).
- Size warnings in development builds, or raising a build tool's warning limit to hide a size problem.
- Per-subtree catch semantics in templates. A failed render fails closed, and isolation is a host pattern.

## How to take part

- **Try it and tell us what hurt.** Open an [issue](https://github.com/ValanceX/Valance/issues) with what you tried, what you expected, and what happened. The repositories have none yet, so yours will be the first. A friction report is more useful to us than a feature request.
- **See what was decided.** [Decisions](decisions.md) answers the open questions in the first seven briefs, with the reason for each and what it would cost to undo.
- **Read the evidence.** [Prior art](prior-art.md) lists what other frameworks decided and why, with the quality of each source. If we have a source wrong, say so.
- **Build a library before the gate.** If you want to be one of the first outside authors, say so in an issue. The Reference Gate needs people who will build against a surface that is known to be unstable, and their friction becomes our evidence.

## Where this fits in the documentation

The three levels in the [documentation index](../README.md) describe what exists. This section describes where it is going and why, so it sits beside them, not in them.
