# The V1 interface freeze gate

Decisions and evidence for freezing VALANCE's public conceptual model. Companion to `COGNITIVE_LOAD.md` (what composing the site cost) and `VIEW_BOUNDARY.md` (why the interface has this shape). **Verdict: READY TO FREEZE** (sections 7 and 8). PORT 0.3.0, which the controlled field needs, has since been published and integrated (section 2); every criterion is met. (The first pass of this gate read ONE BLOCKER REMAINS because one criterion, title, scroll and focus, was untested; section 8 tests it.)

## 1. Navigation: a rule, not an API

**The model was already sound** (a URL is a navigation fact; `Web.link` is a destination; Back and Forward are the same navigation; no router). What was wrong was a forwarding adapter, `entry(go, (navigation) => navigation)`, written by every application that used history (this site, `items`, the links fixture, the inbox).

**Why the adapter existed.** An event's or `invoke`'s arguments bind to a bare command **positionally**: a struct takes them as its fields, in order, and a single object is not unpacked (`name-keyed-commands.test.ts` case 11 pins this). History supplies something else: not an event's arguments but the **navigation fact**, which *is* the command's input. A global "unpack a single object" rule would break the tripwire and make a command whose first field is itself an object ambiguous, so the positional rule stays exactly as it is.

**The rule.** When `history`'s `navigate` is a **bare command name**, the fact is that command's **input, whole**, validated by its schema as always. An exact key (`"app/navigate"`) is the binding it always was. Implementation: `start` registers each bare command a second time under a reserved whole-input key (`navigation/<name>`, in `internal.ts`); history picks it for a slash-less `navigate`. Nothing about `invoke`, events or `entry` changed.

```ts
go: command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id })),
// history: { window, urlOf, stateOf, navigate: "go" }    stateOf: (url) => ({ id: … })
```

| Question | Result |
|---|---|
| Typed input preserved | yes: the command's schema validates the fact; a rejected fact is the typed `CommandValidationError`, logged, nothing changes (tested) |
| Back, Forward, direct navigation, links | the same path as before (tested: jsdom, and real Chromium for the site, `items` and links) |
| SSR, hydration | unaffected: the `items` deep link and the site hydrate and navigate |
| `entry(go, nav => nav)` remains? | no, in the three applications that owned it; an exact key still works and is how an adapted command is bound |
| The positional rule | unchanged: tripwire case 11 passes untouched, and `history-navigate.test.ts` asserts it beside the new rule |
| One existing unit fixture changed | `packages/valance/test/history.test.ts` used the slash-less key `"navigate"` for its hand-built registry, which no real registry contains (exact keys have a `/`); it now uses `"app/navigate"`, the same pass-through contract, and gains one test for the bare form |

Tests: `test/history-navigate.test.ts` (6), `history.test.ts` (+1), `links.test.ts` (14), and the site, `items` and links in Chromium.

## 2. Controlled fields: PORT 0.3.0 published and integrated

PORT has the realization (`41f2db7`, 13 tests) and the release is **prepared** (`a4a735f`): version 0.3.0 (an additive minor: PORT's convention reserves patches for releases with no API change), changelog entry, release notes marked *not yet released*. No tag, no publish.

VALANCE cannot consume it until that exists on the registry. **The exact Valance change is prepared, validated and saved** as `port-0.3.0.prepared.patch` (10 files, 247 lines): `Web.textField` (a text field: `controlled("value")` for the value, a string payload on `input`), the site's field becoming `field: Web.textField`, `Web.controlled` re-exported, the manifest matching `controlled` by case, the `^0.3.0` ranges (peer, dev, README, contract), the benchmark's pinned mismatch assertion flipped to expect agreement, and a Chromium test of the field.

**Validation state** (the patch applied to the committed tree, against the prepared PORT 0.3.0 build linked into the Valance workspace; the link and the patch were then reverted, and the patch is proven to apply cleanly to the committed tree):

| | Result |
|---|---|
| Valance package | 12 files, 110 tests pass; typecheck clean |
| The real site, jsdom | passes, with the pinned mismatch assertion flipped: after the application clears the query the box is `""` |
| Chromium, the site, `items`, links | 4 files, 4 tests pass |
| Chromium, the field flow | the server wrote `value="async"`; hydration adopted the same element and the box shows it; 20 typed characters all kept; a state-driven replacement landed with the **focused caret still at 3**; picking a page cleared the box and kept the same element |
| Workaround left in VALANCE or the application | none: no synchronization code, no attribute-or-property choice |

**What is not claimed.** The field's *payload* (what the user typed) is still a hook, now hidden inside `Web.textField`; an application with a custom input still writes `Web.event`. The declined-edit-with-no-presentation case is PORT's documented contract (the next presentation reasserts the value), not something VALANCE adds.

**Historical (done): these were the steps once PORT 0.3.0 was published; the patch is applied and its file removed.**

```console
$ git apply examples/tracer-web/src/docs-benchmark/port-0.3.0.prepared.patch
$ pnpm install                                   # refreshes pnpm-lock.yaml for ^0.3.0
$ pnpm --filter @valancex/valance run build
$ (cd packages/valance && npx vitest run)        # 110
$ (cd examples/tracer-web && npx vitest run test/docs-benchmark.test.ts && npx vitest run -c vitest.browser.config.ts browser/docs-field browser/docs-benchmark)
```

**A compatibility decision for the maintainer.** `./web` would import `controlled` unconditionally, and `controlled` does not exist in PORT 0.2.4, so the peer range must become `^0.3.0`, not `^0.2.4 || ^0.3.0` (the named import would fail when the module loads). A Valance release carrying the patch therefore requires PORT 0.3.0.

## 3. Async: `command(state).waiting` is ADOPTED, scoped as tested

The previous candidate's blockers were each resolved or made explicit. All the conditions the gate set:

| Gate condition | Result |
|---|---|
| **Typed failure preserved** | the failure reaches `settle` **exactly as the Promise rejected**: an object, a string, `undefined` and an `Error` were all kept by reference (tested), never stringified. Its static type is `unknown`, because a Promise's rejection has none. A failure that must be *typed* is a value `work` returns, or a command written with NEXUS and Effect, which stays the advanced path. No second error system |
| **Latest-wins** | automatic per command, one counter per command per started application; `a, a` and `a, as, a` accept only the newest run's answer, in either completion order (tested) |
| **`wanted`** | a separate question: *is the result still relevant to the state as it is now*, asked in the same atomic step as the commit. **Required by the type** (a `@ts-expect-error` test pins that omitting it does not compile), so it cannot be forgotten silently. When it is false nothing commits, so whatever invalidated the result owns the state; a `wanted` that is always true is written `() => true` |
| **Superseded run** | the contract is now explicit and tested: A starts, B starts, B completes, A completes. **A's work is not cancelled** (its signal is not aborted), **A's caller sees it complete** (a success, not an interruption), **A's late result, success or failure, is discarded**, B's stands. This is exactly what the Learn page's hand-written ticket already did |
| **Interruption** | not a failure and not success: application close aborts the signal, `settle` never runs, the invoking caller sees an interruption distinguishable from success (`Cause.isInterruptedOnly`); the caller's own interruption does the same and leaves the state as `begin` left it |
| **Close** | work aborted, nothing commits afterwards, state stays readable (tested, also for start-time runs) |
| **Start-time work** | admitted at start and application-owned; omit `begin` when the state already says loading (tested) |
| **SSR and headless** | begins during `renderToHtml` and is interrupted when the render ends, HTML and state are what the render read; headless `invoke` waits for the run (tested) |
| **The author's own functions misbehave** | `work` may throw or reject (a failure outcome); a `settle` that throws is a defect of the command and the state stays as `begin` left it (tested) |
| **Duplicates NEXUS?** | no: about 30 lines over `Nexus.Command.define`, so admission, ownership, interruption and the close drain are NEXUS's, unchanged |
| **Second async state machine?** | no: `begin` and `settle` are the loading and done transitions authors write anyway; the state is still the application's |
| **Materially simpler** | the site's search command: 14 lines and 15 NEXUS/Effect references became 8 lines and 0, `app.ts` no longer imports `@valancex/nexus`, the `ticket` left the state, and the site's tests pass **unchanged** in jsdom and Chromium |

**Decision: ADOPT**, scoped to Promise-shaped work. Honest limits, all in the contract (§18.3): the failure's static type is `unknown`; a superseded run's work keeps running (no automatic cancellation, by decision); a `wanted` that returns false leaves whatever invalidated the result responsible for the state; a throwing `settle` leaves `begin`'s state. NEXUS and Effect remain the way to write a typed failure, several steps, or a service-using command. Tests: `packages/valance/test/waiting.test.ts` (14).

## 4. Lists and conditionals: documented as provisional, not wrapped

`mesh-if` and `mesh-each` were introduced in MESH 0.7.0 and **their behavior did not change in 0.8.0 or 0.9.0** (0.8.0's `declaredEvents` reports the events inside them, and changes nothing about them); MESH's own manual still calls them provisional and lists the spelling and nested conditionals as undecided. So: *it works, it has been stable across two releases, and MESH has not promised it.* That is a provisional engine feature, taught as one (`learn/state-views-events.md`, "Repeated and conditional parts (provisional)": `key` is identity, `mesh-if` is positional if/else with one or two children, expressions for `when` and `items`, no length operator, no direct nesting). No VALANCE wrapper, no MESH change. On the site they are 12 uses in 49 lines of markup and the site is understandable.

## 5. Remaining engine exposure, classified

| Exposure | Classification | V1 action |
|---|---|---|
| `compileProgram` and the build script | **Polish** (build-time machinery, identical in every application) | none; document |
| `init(wasmUrl)` in the browser | **Polish** (the URL is the bundler's; forgetting it gives a clear error) | none; a `Web.run` option is a later convenience |
| `Effect.runPromise(renderToHtml(…))` | **Polish**, advanced escape hatch (the core is Effect-shaped on purpose) | none; document |
| repeated view names (`scopes`, `views`) | **Polish** (drift is a precise build-time diagnostic) | none |
| factoring `commands` out of `define` | **Documentation problem** | a recipe; not an API |
| `mesh-each`, `mesh-if`, no length operator, no direct nesting | **Provisional engine feature** (MESH) | taught as provisional; revisit when MESH decides the spelling |
| NEXUS and Effect for a typed failure, several steps, a service | **Advanced escape hatch** | stays public, out of the beginner path |
| `Web.event` and `Valance.entry` with an adapter | **Advanced escape hatch** | stays; the common cases (`Web.textField`, `Web.link`, bare `navigate`) no longer need them |
| the view description language (MPRX), `Schema` (from `effect`) | **A user concept** | taught in VALANCE's words |
| `attribute("value")` instead of `controlled` | **Underlying engine problem, fixed, unpublished** | the prepared patch (section 2) |

Nothing in this table is a **V1 blocker** except the unpublished PORT release, which is a dependency, not an interface problem.

## 6. The author's model

```
Application  (Valance.define)
├── state        a Schema and an initial value                       what is true
├── views        name → { program, scope }; view(state) picks one     what can be shown, and the values it reads
├── commands     name → a transition of state                         the only way anything changes
│                  command.waiting(…) is one that waits               (work is a kind of command, not a fifth concept)
└── navigation   urlOf / stateOf, a navigate command; Web.link         where the application is; a link is a destination
Outside the definition: where it is drawn (tag → element) and the build step (view description → program)
```

The model lost its fifth box: **work is a command that waits**, so the site's whole behavior is state, views, commands and navigation. The normal path reads without NEXUS, MESH, PORT or Effect in the lead; `app.ts` imports `@valancex/valance`, `effect` (for `Schema`) and its own content.

## 7. Freeze assessment (first pass; superseded by section 8)

| Freeze criterion | State |
|---|---|
| 1. The site is composed through the normal surface | met (`app.ts`: no NEXUS, no manifest, no payload hook but the field's) |
| 2. Links are destination-based | met |
| 3. The manifest is derived | met |
| 4. Controlled fields have a **released**, consumable PORT contract | **met**: PORT 0.3.0 is published and integrated (`Web.textField`) |
| 5. Navigation needs no adapter | met |
| 6. Async is safely represented by a small API | met (`waiting`, scoped) |
| 7. Lists and conditionals need no new VALANCE abstraction | met |
| 8. No generic component system | met |
| 9. No second state, rendering or runtime model | met |
| 10. Remaining exposure is advanced, provisional or build-time | met (section 5) |
| 11. The composition reveals no other major missing ordinary-website concept | **untested in the first pass** (title, scroll, focus); **met after the probe in section 8**: no new concept; two small gaps in existing navigation behavior were found and fixed |

PORT 0.3.0 was published and the prepared patch applied (post-freeze gate rerun, 2026-10-05): criterion 4 is met. Package 114 tests, tracer Node 547, Chromium 57, all against the published package.

## 8. The document-navigation probe: title, scroll, focus

**The question:** does ordinary document navigation require a *concept* beyond state, views, commands and navigation, or machinery a normal author should not have to know? Method: the documentation site in real Chromium (hydrated, real history, real keyboard), recording what happens, with a deliberately tall page and, where it mattered, pages of different heights. A target wrapper over `Valance.mount` was also tried, to see what the public API can express.

### Title

| | Result |
|---|---|
| Can the view carry it? | **No, by PORT's deliberate contract.** PORT's server entry refuses a `<title>` element (`unserializable-element`, with `script`, `style`, `textarea`, `template`…: elements whose content is not a tree of nodes and text), and a title lives in the head, outside the container. The attempt failed at server rendering, before any browser |
| SSR | the server's document writes `titleOf(state)`, the application's own pure function (the tracer's real page already owns its head template; its title was a constant) |
| Hydration | never touches the head, so it cannot replace the title |
| Client navigation today (before the fix) | a static title never follows the state. The only routes were an **impure `urlOf`** (a side effect in a function that is pure by contract; it did work, including Back and Forward), or leaving `Web.run` for core composition with a target wrapper and its `Effect` and `Scope` plumbing (it also worked) |

**Classification: D, genuine and small.** A normal application cannot make the tab title follow state through `Web.run` without a contract-violating trick or core composition, and every documentation site needs it. It is **not a new concept**: history already keeps the document's location in step with the state, and the title is the other half of a history entry. **Fix:** `HistoryOptions.titleOf?: (state) => string`, set for the first state and every later one, Back and Forward included, after the URL step. Tested: 4 unit tests, the site in jsdom (initial, navigation, SSR title function) and in real Chromium (initial, navigation, Back, Forward).

### Scroll

| | Observed (Chromium) |
|---|---|
| `history.scrollRestoration` | `auto` |
| **A, C. A plain link click** (client navigation) | `scrollY` stayed at 800; a native link starts at 0. **VALANCE introduced this** by taking the click |
| **B.** A direct load of another page | a document load: the browser starts at the top. Inherent; not exercised in the iframe |
| **D. Back and Forward** | the browser restores each entry's position, **also across pages of very different height** (a tall page left at 2180 → a short page, clamped to 1290 → Back restored exactly 2180 → Forward 1290). It waits for the render; VALANCE adds nothing |

**Classification: browser behavior (B) for Back and Forward, and D, small, for the link click.** The link click is VALANCE's to preserve (the task's "preserve browser semantics"): the application cannot do it itself, because every navigation path (link, command, Back) reaches the same command and state, so no application code can tell a link click from a Back. **Fix:** after the navigation, a plain link click scrolls to the top, in `Web.history`'s link handler; a destination with a `#fragment`, a failed navigation and a link to the page already shown scroll nothing.

**A bug the real browser caught in the first version of that fix.** The reset ran when the navigate command finished, which can be *before* the URL is pushed. The browser records the position of the page being left **at the moment of `pushState`**, so resetting first made Back restore the top. The reset now runs in the follower, **after the push**; the Chromium test asserts the whole sequence (scroll 800 → link click → 0 → Back → 800). It was found only because the test went through Back.

### Focus

| | Observed (Chromium) |
|---|---|
| A sidebar or prev/next link, pressed with Enter | focus stays on the same element (keyed identity keeps it) |
| Navigation by an application command | focus stays where it was (the search box) |
| Back and Forward | focus unchanged |
| The focused link leaves the view (the "next" link on the last page) | focus falls to `body`: the DOM's own behavior for a removed element |
| The page heading | not focusable without `tabindex`, so "focus the heading after navigation" needs a hook |
| Can the public API express such a policy? | **yes**: a target wrapper over `Valance.mount` set `tabindex="-1"` on the new heading and focused it, with no internals |

**Classification: C, an advanced escape hatch.** Browser focus semantics are unchanged by VALANCE, nothing breaks, and moving focus after navigation is an accessibility *policy* sites differ on, not part of every navigation. It is expressible through the public core API (a target wrapper), not through `Web.run`, which offers no presentation hook; that is acceptable for an advanced policy and is not a blocker.

### Result

| | Class | Action |
|---|---|---|
| Title | **D, small** | `titleOf` on history (done) |
| Scroll, Back and Forward | **B, the browser's** | none |
| Scroll, plain link click | **D, small** | start at the top, after the push (done) |
| Focus | **C, advanced escape hatch** | none; documented |

**No new concept.** Both fixes live inside **navigation**: where the application is now includes the document's title, and a link navigation behaves like a page change. The model stays `state`, `views`, `commands`, `navigation`.

**Not in V1, and not blockers:** analytics, canonical URLs, Open Graph and other head metadata (crawlers and unfurlers read them from the **server's** HTML, which the server's document already writes; nothing about them needs to follow the client), fragment scrolling, a focus policy, syntax highlighting, copy buttons. None changes how a developer thinks about VALANCE.

### Final freeze assessment: READY TO FREEZE

| Criterion | State |
|---|---|
| 1-3, 5-10 | met (section 7) |
| 4. Controlled fields have a released, consumable PORT contract | **met**: PORT 0.3.0 published and integrated; the prepared patch is applied and removed |
| 11. No other major missing ordinary-website concept | **met**: title, scroll and focus probed; two small gaps in existing navigation behavior fixed, one advanced escape hatch documented, no new concept |

Tests added: `history.test.ts` +4 (title), `links.test.ts` +4 (scroll), the site's jsdom and Chromium tests (title), `links.browser.test.ts` +1 (scroll and Back). Full runs after the change: package 12 files / 114 tests, tracer Node 74 / 547, Chromium 24 / 56.
