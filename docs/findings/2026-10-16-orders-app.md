# Findings: the second reference application (WP-18)

Written 2026-10-16. Register: [`README.md`](README.md). Method: a second real application, [`examples/orders-app`](../../examples/orders-app), written to find what **data screens** take with `vlx` as it is, after the first reference ([`reference-form`](2026-10-16-reference-form.md)) found what a form takes. DP2 says no abstraction before a second case; this is the second case for RF-4, RF-5 and RF-6, and the first for everything about loaded data and nested routes.

## What was built

A master-detail screen on nested routes. `/orders` lists orders (a filter that is the address: `?status=paid`), `/orders/:id` shows one beside the list, and its status can be changed and saved to a backend that may refuse. Loading is declared on the routes (`load`), the detail is drawn in the list's slot (`children`, `index`), leaving an order with an unsaved choice is stopped (`canDeactivate`), and the detail's addresses are client-delivered (`delivery: "client"`). **224 authored lines** (102 of `main.ts`, 42 of templates, 28 of screen contracts, 30 of CSS, 22 of the model), six browser tests in Chromium against a host that applies `_redirects`.

`vlx check` passed on the second run (the first said the detail route has path parameters and no `staticParams`, and its message still pointed to a future feature: fixed). Five of the six tests passed on the first run; the sixth **found a defect in the framework**, below.

## What was easy

Putting the filter in the address (a query on the route, and `enter` copying it to state); the list and the order each declaring the fetch they need (`load`) and nothing else; the order drawn beside the list with no code for the layout (`children` and `<mesh-slot />`); a result that arrives after the person moved on being dropped without a line of code; a refused save leaving the screen as it was.

## The log

| # | Task | Desired thought | Actual thought required | Extra concept | Engine exposed | Layer | Sev |
|---|---|---|---|---|---|---|---|
| 1 | Show the list when the page opens | "the list is fetched when I'm here" | `load` on the route: `begin`, `work` (a `request` Effect), `settle` | `load` | none | FW | 0 |
| 2 | Open an order beside the list | "the list stays; the order appears" | `children`, `<mesh-slot />`, `load` on the child | nested routes | none | FW | 0 |
| 3 | **Selecting an order must not reload the list** | "nothing about the list changed" | **the framework reloaded it**: entering a child started every level's load and set the parent's state back to "loading", so the list flashed and was fetched again on every selection | none | none | FW | **3, found by the test, fixed** (WA-12) |
| 4 | Make the detail's addresses work | "any id" | `delivery: "client"` on the child; without it `vlx check` refuses the route | client delivery | none | FW | 1 |
| 5 | A row that links to its order | "each row links to `/orders/2`, keeping the filter" | a template cannot build an address, so the row carries `href`, built in `settle` (plain TypeScript, where it is easy) | none | none | App | 1 |
| 6 | Choose a status | "pick one of three" | three buttons with `aria-pressed`, as the plan chooser was: works, but is not a radio group | none | none | FW | 2 (RF-4, second case) |
| 7 | Save it | "send the id and the status I picked" | a command that waits is given its input and nothing else, so `save` is a **derived record**, passed out of the screen by an event; the command's `begin` cannot read the state either (second time) | derived value as a parcel | none | FW | 3 (RF-5, second case) |
| 8 | The server refuses | "show the server's reason" | **not possible**: the answer carries no body, so the text is chosen by status (422 → "would not make that change"); the server's words are out of reach (second time) | none | none | FW | 2 (RF-6, second case) |
| 9 | Don't lose an unsaved choice | "ask before leaving" | `canDeactivate` reads `state`; the rule ("choice differs from what was loaded") is written **twice**, in the derived `changed` and in the guard, because a guard sees the state's fields and not the derived values | none | none | FW | 1 (WA-13) |
| 10 | Show the orders as a table | "rows and columns" | **not possible**: there is no `table`, `tr`, `td`; a list of rows with spans, so there is no row and column meaning for assistive technology | none | none | FW | 2 (RF-12) |
| 11 | `#{r.id} {r.customer}` in a link | "#1 Ada" | the space between two interpolations is dropped ("#1Ada"); a separator character is needed | none | MPRX | Eng | 1 (RF-13) |
| 12 | Count the pages that exist | "which pages will the build write" | `/orders` and `/` ; the detail is the shell's. `vlx info` says so per route | none | none | FW | 0 |

## What it justifies

| Finding | Evidence now | Verdict |
|---|---|---|
| **WA-12** a move inside a level reloaded it | found by building this | **Fixed**: a level the move stays inside (the same route or a descendant, with the same path parameters and query of its own) is not entered: its `begin` does not run again, its load does not start again, and a result is still wanted while the level is shown with the same input. `routing-engine.ts`, engine and browser tests |
| **RF-4** a choice among a few | two applications, the same shape (a plan, a status), both as pressed buttons | **Justified now**: a portable "choice group" (a radio group with its name, arrow keys and `aria-checked`/`role="radiogroup"`; the desktop toolkit has radio buttons). Wants a design note first (WP-23); a `select` for long lists waits for a case |
| **RF-5** a waiting command reads the state it starts from | two applications, both worked around with a derived record | **Justified**: `work` should receive the state after `begin` (or the input should default to the state's named fields). A decision on the core command surface, a maintainer's (WP-25) |
| **RF-6** the server's words | two applications, both guess a message from the status | **Justified**: an opt-in `request({ errors: Schema })` that decodes a failed status's body before it reaches state. Safety reason holds because nothing undecoded gets through. A decision (WP-25) |
| **RF-12** no table | one application | Open: a data table is the commonest thing a data screen draws. A portable name is harder (egui has a grid) than a web-only `table` family; decide from one more case (WP-24) |
| **RF-13** whitespace between interpolations | one application | A MESH question (WP-26): either the space is content or it is not; the spec should say |
| **WA-13** a guard cannot read derived values | one application | Small: give the guard's `state` the derived values as the layout has them (WP-21's neighbour). Not done |
| **RF-10** a success that navigates | not needed here either | Still open |
