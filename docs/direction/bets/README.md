# Bets

A bet is one open question, written as a hypothesis we can test and a rule for when we stop. The stages, and why we use bets, are on the [Direction](../README.md#bets-and-their-stages) page.

## The index

Every bet in the table has a brief. Briefs 7, 9 and 11 were written last, after the maintainer lifted the deferral of accessibility; they build on the earlier ones.

| # | Bet | Question | Stage | Depends on |
|---|---|---|---|---|
| 1 | [Primitive specification](primitive-specification.md) | Can one declarative record be the only place a primitive is defined? | 2 Design (by delegation) | |
| 2 | [The conformance kit and the gallery](conformance-kit.md) | Can every primitive and library be verified, and shown in every state, from data? | 2 Design (by delegation) | 1 (12 pilot) |
| 3 | [Budgets as gates](budgets.md) | Can bundle size, startup and update cost be limits a bet must meet? | 3 Prototype (harness and baseline); gates 2 Design (by delegation) | |
| 4 | [Types that can name variants](variant-types.md) | Can MPRX express literal sets, optional values and defaults without general unions? | 2 Design (by delegation) | |
| 5 | [Typed template values](template-values.md) | Can a template be a value passed, recursed and typed, instead of a slot? | 2 Design (by delegation) | 4 |
| 6 | [Style contract](style-contract.md) | Can the core define what a theme may depend on, without becoming a style engine? | 2 Design (by delegation) | 1, 4 |
| 7 | [Accessibility as types](accessibility.md) | Can the spec make an unnamed control a compile error and bind each role to its keyboard contract? | 2 Design (by delegation); gaps measured (stage 3) | 1, 4 |
| 8 | [Identity-keyed state units](state-units.md) | Can a component hold interaction state without leaking it into the application or breaking purity? | 2 Design (by delegation) | 4 |
| 9 | [Interaction state, focus and layers](interaction-state.md) | Can pressed, hover, focus scopes and overlays be primitives realized natively? | 2 Design (by delegation); web measured, Desktop not | 1, 7, 8 |
| 10 | [Collections](collections.md) | Can windowing be a property of `{#each}` without changing meaning? | 2 Design (by delegation) | 1, 5, 8 |
| 11 | [Forms from the schema](forms.md) | Can field state and validation derive from the schema NEXUS already validates with? | 2 Design (by delegation); schema measured (stage 3) | 4, 7, 8, 9 |
| 12 | [The reference library, themes and a third target](reference-library.md) | Can outside authors build against public seams only? | 2 Design (by delegation); seam measured (stage 3) | 3, 4, 5, 6, 8, 10, 14 |
| 13 | [Safe generated UI](safe-generated-ui.md) | Can a model's partial MPRX be validated and repaired against a manifest as it streams? | 2 Design (by delegation); checker measured (stage 3) | 1, 3 |
| 14 | [Starting from what the server did](resumable-start.md) | Can a page start from the render tree without re-evaluating it, and what happens to a tap before the app is ready? | 3 Prototype (early-input shell); 2 Design (by delegation) | 3 |
| 15 | [Replay as a contract](replay.md) | Can a recorded session reproduce every tree byte for byte, as a conformance requirement? | 2 Design (by delegation); determinism measured (stage 3) | 2, 8 |

Killed bets are listed here with the reason. None yet.

## The brief

Every brief answers the same questions, in this order, so they can be compared and reviewed alike.

| Section | Says |
|---|---|
| **Header** | Stage, date, owner, depends on |
| **Question** | One sentence |
| **Why, and who is hurt** | What happens today, with facts from this repository and where they live |
| **Prior art** | What others decided, why, and whether it was architecture or a patch, each with a source and its reliability (see [prior art](../prior-art.md)) |
| **Constraints** | Which of the [fixed points](../README.md#what-we-hold-fixed) bound the design |
| **Design** | The proposal, marked as a sketch until stage 2, with the alternatives rejected and why |
| **Experiment** | The smallest thing that would show it works, and how it is measured |
| **Success** | What we will see if it works |
| **Kill** | What we will see if it does not, decided in advance |
| **Breaks** | What it changes in the free window |
| **Open questions** | Things we cannot answer yet, with the options |

## Reading a stage honestly

Stage 1 means the evidence is gathered and a design is drafted for review. It does not mean the design is accepted. A brief moves to stage 2 when a maintainer other than its author has read the rejected alternatives and the kill criteria and agreed they are the right ones. A maintainer may delegate that review; the delegation is recorded in [decisions](../decisions.md), and the text stays open to a veto.
