# Bet 8: Identity-keyed state units

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The design questions are decided in [decisions](../decisions.md) (V1 to V10); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 4](variant-types.md) (defaults for unit state). [Bet 5](template-values.md) is needed for the second example (tabs), not the first (disclosure). Bets 9, 10, 11, 12 and 15 depend on this one |

## Question

Can a component hold interaction state of its own (open or closed, which tab is selected, what is highlighted) without leaking that state into the application, without making templates impure, and without giving up replay, server rendering or the update guarantees?

## Why, and who is hurt

### Where the state goes today

Valance's principle is that state lives in one place and the screen is a function of it. That is right for application state. The cost shows up for state that is only about presentation:

| Evidence | Source |
|---|---|
| A to-do application keeps `navigation` (whether the desktop layout's side panel is open) beside `items` in the application state, though only one target reads it | `examples/todo-multi/src/main.ts`; decision D3 in the [multi-target plan](../../application-model/MULTI-TARGET-PLAN.md) kept it there, for the reason "smallest model; do not add a concept without a consumer that needs it" (plan line 143) |
| The plan's condition was about persistence: "add `targets.<id>.state` only if a persisting `Store` makes the shared state visible to the person" (plan line 100). It was settled by not persisting `navigation` (plan line 18). A component library is a new consumer, not one D3 named | the same plan |
| NEXUS says what it will not hold: "never UI state, which belongs to the component/UI runtime, not NEXUS" | [`docs/primitives/state.md`](https://github.com/ValanceX/Nexus/blob/main/docs/primitives/state.md) |
| No component/UI runtime owns such state today. Every scope name of a composite must be bound by a prop of the same name | assembly rule 4a in the [templates manual](https://github.com/ValanceX/Mesh/blob/main/docs/manual/templates.md#the-assembly-rules) |

So a disclosure, a tab strip, a menu or a dialog, the first components any library needs, would have to keep their open or selected state in the application's state, under a name the application invents, passed down as props. Every use leaks the component's internals into the application. This is the failure Svelte named when reactivity could not leave a component's top level: it "forced you to resort to using stores when refactoring code out of the top level of components for reuse".

The consumer that D3 asked for is therefore a component library. This bet is how to serve it.

### Who is hurt

- A library author cannot ship a disclosure, tabs or menu that works without the application wiring its state.
- An application author carries state that is not about the application.
- A test of the application's real behavior has to set up screen furniture.

## Prior art

Reliability: **P** primary source read through a fetch agent; **P\*** primary source, read only in part; **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What they decided and why | Architecture or patch | Lesson here |
|---|---|---|---|
| Phoenix LiveView (**P**, [LiveComponent](https://raw.githubusercontent.com/phoenixframework/phoenix_live_view/main/lib/phoenix_live_component.ex)) | A stateful component is for when you "encapsulate both event handling and additional state". "Prefer function components over live components." "Avoid using LiveComponents merely for code organization purposes." Avoid "both the parent LiveView and the LiveComponent working on two different copies of the state". Costs: state kept in memory per component; a single root tag | Architecture, with explicit advice to use it rarely | Stateless by default, stateful by exception, one copy of any value. Plan for the memory cost |
| React Spectrum (**P**, [v3 RFC](https://raw.githubusercontent.com/adobe/react-spectrum/main/rfcs/2019-v3-architecture.md)) | State management that is "platform agnostic", separate from behavior and from the themed component | Architecture | Interaction state is a layer of its own that can be tested without a screen |
| Svelte 5 (**P**, [migration guide](https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/07-misc/07-v5-migration-guide.md)) | State that could not leave a component's top level pushed people to stores | Redesign | Plan the home for local state before libraries exist |
| TC39 Signals (**P\***, [proposal](https://github.com/tc39/proposal-signals)) | "fully decouple the reactive model from the rendering view" | Design goal | Units keep state out of templates. The view stays a function of data |
| React `useId` (**P**, [discussion 111](https://github.com/reactwg/react-18/discussions/111)) | Counters do not work with out-of-order streaming, so ids need a stable source | Design guidance | Per-instance state needs a stable identity from the start. MESH has one (§9.10) |
| This ecosystem, node lifetime (**Repo**, [spec §9.10.6](https://github.com/ValanceX/Mesh/blob/main/docs/MPRX-SPEC.md)) | A node that leaves a render has ended; the same identity later is "a new occurrence ... created, not kept", and MESH "requires it to inherit nothing from the earlier one" | Architecture | The lifetime of a unit is already defined. No new concept is needed |
| This ecosystem, controlled values (**Repo**, [NATIVE-VOCABULARY](../../application-model/NATIVE-VOCABULARY.md)) | "The control reports its value and the app owns it", the rule React Native and Compose state for controlled components | Architecture | Where the application wants to own a unit's value, it must be able to |
| This ecosystem, session replay (**Repo**, the reactivity design, part C) | State changes only through commands and render is pure, so "a session is fully described by an ordered log" | Architecture | Unit transitions must be dispatches in that log, or replay breaks |
| Elm's stance on components, React context, Vue provide and inject | Other answers to the same problem | | **Not researched in this session.** The design does not rely on them |

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 1 to 5 and 8:

- **Render stays pure.** Everything a render reads is an input. Unit state is an input, not something the runtime holds.
- **Commands are the only way state changes**, and they are in the replay log.
- **No two copies of one value.**
- **`render-v1` and the patch format do not change.** No PORT needs to know units exist.
- **The lifetime of a unit is the lifetime of its node.** Nothing new is invented.
- Server and client agree on the first render.

## Design

### 1. What a unit is

A **unit** is state and commands that belong to one occurrence of a composite. It is declared with the composite, defined in TypeScript, and invisible to the application.

```xml
<!-- disclosure.mprx: the template reads `open` and calls `toggle`; it holds nothing -->
<column>
  <button on.click={toggle()}>{label}</button>
  {#if open}<mesh-slot />{/if}
</column>
```

```ts
// the unit: typed state with defaults, and pure transitions
export const disclosure = unit({
  state: { open: field(Schema.Boolean, false) },
  commands: { toggle: (state) => ({ open: !state.open }) },
});
```

The composite's manifest entry gains an optional `unit`:

```json
"disclosure": {
  "props": { "label": { "type": { "kind": "string" }, "required": true } },
  "unit": {
    "state": { "open": { "type": { "kind": "boolean" }, "default": false } },
    "commands": { "toggle": { "parameters": [] } }
  },
  "events": {}, "commands": {}, "scope": { "label": { "kind": "string" } }
}
```

The unit's state names join the template's scope (read-only) and its commands join the template's commands. A clash with an existing scope name or command is an assembly error. Adding the property is a compatible change to `manifest-v1`.

### 2. How the state reaches a pure render

The runtime does not hold unit state, and a unit's state cannot be a field of the snapshot (MPRX records are exact and the set of instances is dynamic). So it is an **explicit input beside the snapshot**:

```text
render(program, model, snapshot, units) -> Render
units = [ { instance: <identity>, state: { open: true } }, ... ]
```

- An occurrence with no entry in `units` is given the manifest's defaults. That is how the first render works, and it is the same on the server and the client.
- The `Render` records which unit occurrences it met, with their identities and the state it used, so the host can see which instances exist.
- The `Render` retains the units it was rendered with, so `dispatch` evaluates against exactly what the person saw (the existing rule that dispatch uses "the render's snapshot, never one supplied separately").
- `update` and the changes form take the new `units` as well, and the equivalence law extends to it: applying the patches to the previous tree gives exactly a fresh render of the same snapshot and units.

### 3. How a command reaches the unit

An event bound to a unit command resolves like any other (§9.9). The intent gains the occurrence:

```json
{
  "command": { "component": "disclosure", "name": "toggle" },
  "instance": "<the occurrence's identity>",
  "arguments": []
}
```

The host looks up the instance's state, runs the unit's transition, stores the result, and renders again with the new `units`. Arguments are validated against the manifest's parameter types, as they are for any command, so a client cannot send what the manifest forbids. Because a unit command is a dispatch, it is in the replay log.

### 4. The host: Valance, with one pass-through in NEXUS

Instance lifecycle is a component lifecycle, which the NEXUS adapter explicitly does not have ("It adds no reactive model, render registry, component lifecycle or command runtime"). So:

- **Valance** keeps the registry. For each instance in a render it creates a NEXUS `State` inside a `Scope` of that instance, and closes the scope when the instance is absent from a later render. NEXUS's existing `State.create` and `Scope` are exactly the machinery needed.
- **The NEXUS adapter** gains one optional pass-through, `units`, that hands the current unit map to the runtime. It has no logic. This is the pass-through that decision X1 already anticipates (V7).

### 5. Lifetime

By spec §9.10.6, a node's lifetime is the run of consecutive renders in which its identity is present, and it inherits nothing from an earlier run. A unit's lifetime is that, with no new rules:

| Event | Result |
|---|---|
| The node is reordered inside a keyed `{#each}` | Same identity, same state |
| The node is hidden by an `{#if}` and shown again | A new occurrence, state back to defaults |
| The item's declared key changes | A different identity, a new unit |
| The node leaves a windowed list ([Bet 10](collections.md)) | The occurrence has ended, so the unit resets when the row scrolls out and back. State a row must keep is application state |
| The program changes (a template edit) | Keys are not stable across programs, so units reset. See the open questions |

Units are **not persisted**. State that must survive a reload is application state (it can then use the `persist` list).

### 6. When to use a unit, and when not

The test, after LiveView's guidance, is a rule of thumb for authors:

| Use application state if... | Use a unit if... |
|---|---|
| A command needs to read it (the draft text that `add()` submits) | Only the component's own template reads it |
| It belongs in the URL, or the router drives it | Losing it on a reload is fine |
| It must persist | It is about presentation: open, hovered-open, highlighted, which tab |
| Another screen or another component reads it | Nothing outside the component does |
| You want to test behavior that depends on it | A test of the application does not need it |

In `todo-multi`, `entry` stays application state because `add()` reads it, and `navigation` becomes a unit of the layout.

### 7. Controlled and uncontrolled

A unit field can be declared `controllable`. If the caller passes a prop with the same name, **the prop is the value**: the template's scope name takes the prop, not the unit's state, and a command's change to that field is not applied. The application owns it and the component reports, which is the rule the ecosystem already states for controls. The intent says which fields were controlled when it was dispatched, so the host's suppression is computed by the pure runtime, not guessed by the host:

```json
{ "command": { "component": "tabs", "name": "select" }, "instance": "…", "controlled": ["selected"], "arguments": [{ "value": 2 }] }
```

The unit can also **notify**: a transition may name a declared composite event to raise, with a payload, so a controlled caller learns what the person chose. Raising uses the existing composite-event forwarding, through one new runtime operation, `raise(render, instance, event, payload)`, which returns the intent of the caller's bound handler, if any.

This is what lets tabs be driven by the router in one application and left alone in another, with one copy of the value in either case.

### 8. Sharing inside a component

Tabs need the tab list and the panels to agree on the selection. There is **no context mechanism**. Within one composite the unit's scope is available to the whole template, and the parts the caller supplies are [snippets](template-values.md) that receive the selection as a parameter. A shared value crosses a component boundary only as a prop or a snippet parameter, so any dependency can be read from the template that uses it.

### 9. Server rendering, hydration, replay

- The server renders with an empty `units` map, so every instance has its defaults. The client's first render does the same, so hydration verification sees identical trees. Interaction before hydration is lost, as it already is.
- Replay needs the initial snapshot and units plus the ordered dispatches; unit commands are among them. Time travel to step *n* renders the recorded units at *n*.
- On the Desktop the instances live in the engine process, not the window, so the protocol is unchanged.

### 10. What it costs

State lives in memory per visible instance, as in LiveView. It is bounded by the nodes on screen, because an absent node's unit is dropped. The experiment measures this at 1,000 instances.

### Alternatives considered

| Alternative | Why not |
|---|---|
| Everything in application state (the status quo) | The evidence above. Leaks internals, and D3 kept the status quo for lack of a consumer, which a component library now is |
| The runtime holds the state | Render stops being a function of its inputs; replay and the update equivalence law break |
| State inside templates (mutable locals) | Impure; against fixed point 1 |
| Hide units in the snapshot under a reserved name | Instances are dynamic and records are exact, so it needs a special case in the type system anyway. An explicit input is simpler and honest |
| Let the platform hold it (a native `<details>`) | Fine for transient browser state like scroll or focus, which already behave this way. Not for state that should replay, render on a server, or work on the Desktop |
| A context or provide/inject mechanism | Hides dependencies. Props and snippet parameters make them visible |

## Experiment

1. **Vectors first** (language-neutral): unit lifetime across a keyed reorder, a hide and show, and a key change; controlled suppression; the replay log; the update equivalence law with units; defaults on first render; a command from a client with a bad argument.
2. **MESH.** The `unit` property in the manifest, scope and command merging with clash errors, the `units` input and output, `instance` and `controlled` on the intent, `raise`, and the changes form for units. Rust first, then WebAssembly.
3. **NEXUS and Valance.** The adapter's pass-through, the `unit()` helper in `@valancex/common` (provisional), the instance registry with a `Scope` per instance, SSR and hydration, and the Desktop engine.
4. **Examples.** First `disclosure`, which needs nothing from Bet 5. Then `tabs` with snippets, once Bet 5 is at stage 3. Then move `navigation` in `todo-multi` into a layout unit.
5. **Measure.** The cost of toggling one of 1,000 disclosure rows against the same toggle held in application state.

## Success

- A library ships `disclosure` and `tabs` that work with no application wiring, on both targets.
- The same tabs are driven by application state when the caller passes `selected`, with one copy of the value.
- Existing conformance vectors pass unchanged, and the extended update law holds over random programs with units.
- Toggling one of 1,000 instances costs no more than 1.2 times the same change held in application state.
- Replay of a recorded session reproduces every tree, units included.

## Kill

- If a realistic component needs state that cannot be a typed `State` per identity, units are the wrong shape. Record the component.
- If `raise` forces an exception to the rule that one interaction reaches at most one binding, ship uncontrolled units with template-level forwarding only, and treat notification as a separate bet.
- If instances accumulate (a leak), the lifetime tie to identity is wrong or the registry is. Fix before shipping anything.
- If the 1.2 times budget cannot be met, keep units for low-count components and tell authors to use application state for large collections.

## Breaks (allowed in the free window)

- The intent format gains `instance` and `controlled`, additive.
- The runtime's `render` and `update` gain the `units` input, and `Render` gains the instance list.
- `todo-multi`'s `navigation` leaves the application state. Its persistence behavior is unchanged, since `navigation` was already not persisted.

## Deferred on purpose

Accessibility ([Bet 7](accessibility.md)) resumed after this brief. Nothing here blocks it, and one choice keeps it cheap: a unit instance has a stable identity, which is also what generated ids for relationships between parts would derive from.

## Answered by research (2026-10-17)

Sources and decision ids: [decisions](../decisions.md) V11 to V14. Memory was measured with the published `@valancex/nexus` 0.12.3 on Node 22.22.

**`controllable` is declared per field.** Radix's `useControllableState` is one hook per value (`isControlled = prop !== undefined`) and warns in development if a value switches between controlled and uncontrolled; Svelte's `$bindable` is declared per prop; the intent of V5 already lists controlled fields. React Spectrum's `useControlledState` was not read (the first path returned 404).

**No keep-alive opt-in on a unit.** Vue's `<KeepAlive>` (include, exclude, max, least-recently-used) and React's `<Activity mode="visible|hidden">` are caller-side wrappers; Activity hides children with `display: none`, keeps them in the tree, destroys their effects and re-renders them at lower priority. If an application wants a hidden panel to keep its state it keeps the node rendered and hides it with a prop, instead of removing it under an `{#if}`, since §9.10.6 keeps the identity alive. A keep-alive boundary would need the tree to omit nodes while remembering state, which is a new input in the `units` map; add it at the hide site later if wanted.

**Hot reload (low to medium confidence).** React Fast Refresh keeps state per component family by id and resets when the hook signature changes (`forceReset`); MESH keys hash the whole program identity, so they are not stable across programs. The proposed rule for when state-preserving reload becomes a goal: identify an instance by the path of (component name, declared repeat key or the ordinal among same-named siblings), keep its state if the unit's state signature (field names and kinds) is unchanged, otherwise reset. Unkeyed same-named siblings match by ordinal, so inserting before one shifts state, as in React. Svelte's hot reload was not read.

**Memory budget: about 12 KB and 150 µs per unit instance.** One `Scope.make()` plus `State.create(Schema.Struct({ open: boolean, selected: number }), ...)` per instance, forced garbage collection before and after:

| N | Heap | Per instance | Create | Close |
|---|---|---|---|---|
| 10,000 | +110 MB | about 11.6 KB | 83 to 125 µs | 32 to 43 µs |
| 1,000 | +11.5 MB | about 12.0 KB | 171 µs (warm-up) | 52 µs |

That is about 12 MB at 1,000 instances and about 116 MB at 10,000. After closing the scopes and dropping references, 147 bytes per instance remained (no leak at this scale). One machine and one two-field schema; units with more fields cost more, and the cost with a real `units` input and the update path is unmeasured.

## Open questions for stage 3

- **State-preserving reload** as a goal, and how Svelte's hot reload handles it (not read).
- **The cost of a real `units` input** on the update path (the 1.2x budget needs the implementation).
- **Effects in transitions**: focus is a host request ([Bet 9](interaction-state.md), I13) and an announcement is a `status` primitive ([Bet 7](accessibility.md), A13), so the Effect form is not needed for version 1.
