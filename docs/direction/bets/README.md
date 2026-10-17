# Bets

A bet is one open question, written as a hypothesis we can test and a rule for when we stop. The stages, and why we use bets, are on the [Direction](../README.md#bets-and-their-stages) page.

## The index

Briefs exist for the five bets the rest depend on: the primitive specification, the language's types, typed template values, the style contract and state units. The others are named so the dependencies are visible; their briefs are written when they reach stage 1.

| # | Bet | Question | Stage | Depends on |
|---|---|---|---|---|
| 1 | [Primitive specification](primitive-specification.md) | Can one declarative record be the only place a primitive is defined? | 2 Design (by delegation) | |
| 2 | Conformance kit and gallery | Can every primitive and library be verified, and shown in every state, from data? | 0 Question | 1 |
| 3 | Budgets as gates | Can bundle size, startup and update cost be limits a bet must meet? | 0 Question | |
| 4 | [Types that can name variants](variant-types.md) | Can MPRX express literal sets, optional values and defaults without general unions? | 2 Design (by delegation) | |
| 5 | [Typed template values](template-values.md) | Can a template be a value passed, recursed and typed, instead of a slot? | 2 Design (by delegation) | 4 |
| 6 | [Style contract](style-contract.md) | Can the core define what a theme may depend on, without becoming a style engine? | 2 Design (by delegation) | 1, 4 |
| 7 | Accessibility as types | Can the spec make an unnamed control a compile error and bind each role to its keyboard contract? | 0 Question, deferred by direction | 1 |
| 8 | [Identity-keyed state units](state-units.md) | Can a component hold interaction state without leaking it into the application or breaking purity? | 2 Design (by delegation) | 4 |
| 9 | Interaction state, focus and layers | Can pressed, hover, focus scopes and overlays be primitives realized natively? | 0 Question | 1, 7, 8 |
| 10 | Collections | Can windowing be a property of `{#each}` without changing meaning? | 0 Question | 1 |
| 11 | Forms from the schema | Can field state and validation derive from the schema NEXUS already validates with? | 0 Question | 7, 8 |
| 12 | The reference library, theme and a third PORT | Can outside authors build against public seams only? | 0 Question | 4, 5, 6, 8 |
| 13 | Safe generated UI | Can a model's partial MPRX be validated and repaired against a manifest as it streams? | 0 Question | |
| 14 | Resumable-style hydration | Can a page start from the render tree without re-evaluating it? | 0 Question | |
| 15 | Replay as a contract | Can a recorded session reproduce every tree byte for byte, as a conformance requirement? | 0 Question | |

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
