# Performance: opt-in knobs

> **TL;DR:** The opt-in knobs for when a measurement says an update is too slow. Without them an application is already correct and within budget.

## Prerequisites

* A measurement that shows a problem.

---

An application with none of this set is correct and meets the framework's own budgets: updates reach the screen as patches, the start-up budgets apply, and a tap before the page is ready is kept. Read this page when a measurement tells you to, not before.

| Knob | What it tunes | Default | Rules |
|---|---|---|---|
| `admit(handle, name, view)` | When a view's program is loaded: a program that arrives after start (a dynamic `import()`) is put into the running application under `name`, held to the same invariant as `start` | everything the application needs is loaded before start | [Start-up and budgets](start-up-and-budgets.md), [Stability](../reference/stability.md) |
| `budgets` in `valance.json` | How large the start-up JavaScript and CSS (`initial`) and what loads later (`afterStart`) may grow before `vlx build` warns or fails | the framework's own budgets | [Start-up and budgets](start-up-and-budgets.md) |
| `Target.patch` (optional, on a target) | How a later render of the same view reaches the screen: as MESH's patches when the target has `patch`, as a whole `update` when it has not | web and desktop targets have it | [Contract §5](../reference/v1-contract.md#5-views-and-presentation) |
| `ledger` (`mount(handle, target, { ledger })`) | How many exits of the commands a mount's events started are kept in `Mounted.dispatched` | the most recent 1,000; `Infinity` keeps all, `0` none | [Contract §6](../reference/v1-contract.md#6-mounts) |
| `earlyInput="keep"\|"drop"` on `button`, `toggle`, `checkbox`, `radio` | What a tap does before the application is ready: replayed once it starts, or dropped (the control shows `aria-busy` meanwhile). Web only | `"keep"` | [Start-up and budgets](start-up-and-budgets.md) |

## Which one for which problem

- **The first screen is slow to appear.** Measure with `vlx build` (its size report), set `budgets` so a regression fails the build, then move programs the first screen does not need behind `admit`.
- **A tap before the page is ready does the wrong thing.** Mark the control that must not be replayed (a payment, a delete) `earlyInput="drop"`.
- **A long-lived mount holds memory in `dispatched`.** Lower `ledger`; the mount reports how many exits left (`dispatchedDropped`).
- **A custom target repaints the whole view on every change.** Give it a `patch`; without one it receives `update`. The patches are MESH's, so the target does not diff anything itself.

## What this page does not cover

A very long list does not need a knob here: it is windowed in the template, so only the rows in view exist ([Bet 10: collections](../explanation/bets/collections.md)). That is a direction, not yet a release.

Nothing on this page changes what an application means. A view is still a function of state, and a state still reaches the target as `update` or `draw` ([Contract §5](../reference/v1-contract.md#5-views-and-presentation)).

## Next steps

* [Start-up and budgets](start-up-and-budgets.md): what a page costs to ship and to start.
