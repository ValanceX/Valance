# Bet 4: Types that can name variants

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The design questions are decided in [decisions](../decisions.md) (T1 to T9); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | Nothing. Bets 5, 6 and 12 depend on this one |

## Question

Can MPRX express "one of these strings", "a value that may be absent, with a default", and a closed set of variants for a prop, without adding general union types, and without changing what crosses the render boundary?

## Why, and who is hurt

### What the language can say today

MPRX has nine types (`string`, `number`, `boolean`, `null`, `any`, `list<T>`, records, named types, and `T?` for absence). The specification lists, as non-goals: "unions, nullable types separate from absence, generics beyond `list<T>`, function types, open records, implicit coercions, and narrowing" ([MPRX spec §9.2 and non-goals](https://github.com/ValanceX/Mesh/blob/main/docs/MPRX-SPEC.md)).

That was a reasoned choice. The v0.2 outline accepted its consequences up front: "`a string or null` is not expressible without `any`, because there are no unions", and "MPRX has no presence test, so a `T?` value can only flow into a context that accepts `T?`". It named the risk: "**Strict absence may push models to `any?`.** ... That is correct and fail-closed, but real models may lean on the escape hatches to cope. Watch for it in the examples; a presence test is a v0.3 language question, not a v0.2 patch." It also noted that "structured `kind`s (D2) make additions non-breaking."

This brief is that deferred follow-up. The pressure it predicted has now arrived, from a direction the outline did not name: design systems.

### Where it hurts, with evidence from this checkout

| Symptom | Where | Effect |
|---|---|---|
| A closed set of strings has no type. `Schema.Literal("system", "light", "dark")` becomes `string` | `typeOf` in `packages/valance/src/web-manifest.ts`; [TEMPLATE-TYPES](../../application-model/TEMPLATE-TYPES.md): "`theme == "blue"` is **not** an error" | A typo in a variant name compiles and renders nothing special. `intent="dangr"` would pass |
| A union of string literals reaches a different branch of the same function | the `Union` case: "a union of different kinds has no MESH type" | Mixed unions crash `vlx check` with a raw `ManifestError` and a stack (TEMPLATE-TYPES, item 3), against the project's own rule that every mistake is `file:line:col code: message` |
| An optional prop on a composite is almost unusable | Assembly rule 4b: a composite whose prop is not required must have its scope name optional, because "an unwritten prop would bind absent". Spec §9.2: an absent value "can only go where `T?` is accepted" | Inside the composite you can pass the value on, and nothing else. You cannot show it, compare it, or give it a default |
| Props have no defaults | TEMPLATE-TYPES: "Props have no defaults" | Every use repeats the default, or the composite is split in two |
| A closed keyword set is typed as free text | `docs-verifier` writes `pressed={theme == "system" ? "true" : "false"}` for `aria-pressed`, which the [value realization audit](https://github.com/ValanceX/Port/blob/main/docs/architecture/2026-09-27-value-realization-audit.md) calls an enumerated attribute taking keywords (ARIA also allows `mixed`) | The prop's type is `string`, so the set exists only in the author's head |

Variants are the heart of a design system (`size`, `intent`, `density`). Without a closed-set type, [Bet 6](style-contract.md) cannot make `intent="dangr"` a compile error, and a component library cannot say which values its props accept.

### Who is hurt

- A library author cannot publish a component whose props are checked.
- A theme author cannot rely on a prop's values being the ones the theme covers.
- Every author with an optional prop on a composite writes a workaround.

## Prior art

Reliability: **P** primary source read through a fetch agent; **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What they decided and why | Lesson here |
|---|---|---|
| This ecosystem, MESH v0.2 outline (**Repo**) | Chose no unions and strict absence on purpose, and predicted the escape-hatch risk | The carve-out below is the smallest step that addresses the predicted failure, and nothing more |
| This ecosystem, spec §9.3 (**Repo**) | One relation, `is_assignable`, with no coercions; "lists are covariant, which is sound because MPRX values are never mutated" | Subtyping is already accepted where it is sound. An enum is a subset relation on immutable strings, and sound for the same reason |
| This ecosystem, the object-literal rule in the spec (**Repo**) | A literal is checked "field by field" against the expected record | Checking a literal against an expected type already exists. An enum reuses it |
| Svelte 5 snippets (**P**, [snippet docs](https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/03-template-syntax/06-snippet.md)) | Snippets are typed (`Snippet<[T]>`), so the parameters of passed-in content are checked | Typed boundaries are part of what library authors get from a component system. This brief is the value-level half of that; [Bet 5](template-values.md) is the structural half |
| TypeScript, Rust enums, Elm custom types, Angular typed inputs | Closed sets and typed component inputs are standard devices | **Not researched in this session.** The design does not rely on them |

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 1, 2, 3 and 4:

- The render tree and the patch format do not change. A variant is a string at the boundary.
- No general unions, generics or narrowing. Whatever is added must be a closed, finite, decidable relation.
- MESH stays the one evaluator. Any new runtime check lives in the runtime.
- Old manifests, templates and programs keep working unchanged.

## Design

### 1. A closed set of strings, as one new type kind

The manifest gains a tenth kind:

```json
{ "kind": "enum", "values": ["sm", "md", "lg"] }
```

Written `"sm" | "md" | "lg"` in documentation. Rules:

- `values` is a non-empty list of distinct strings, at most 256 of them (a resource limit like the manifest nesting limit, not part of the format).
- It is a type of strings only. Numbers and booleans are not included: variant sets in design systems are strings, `boolean` already has two values, and a number set would make equality and `propText` rules harder for no consumer.
- Adding a kind is a compatible change to `manifest-v1` ("a change that only allows something new, such as a new `"kind"`, may not [need a new version]"). A MESH that does not know it fails closed with `manifest-unknown-kind`.

### 2. How it relates to other types

| Relation | Rule | Reason |
|---|---|---|
| enum to `string` | assignable | Every member is a string |
| enum A to enum B | assignable if A's values are a subset of B's | Subset on immutable values is sound, like list covariance |
| `string` to enum | **not** assignable, except at a literal site (3) | A runtime string could be anything |
| `join(enum A, enum B)` | the enum of A's and B's values together | Needed for `==` and `?:`. Closed, finite, decidable. This is a set union, not a general union type |
| `join(enum, string)` | `string` | The wider of the two |
| `enum` to `any` | assignable | As any other present value |
| enum under `T?` and `list<T>` | as for any type | No special case |

### 3. Literal sites are checked against the set

Where the expected type is an enum, a **string literal** (a quoted attribute value or `"x"` in an expression) is checked for membership. A non-member is an error with the closest member suggested, like the existing did-you-mean suggestions:

```text
error[unknown-variant]: "dangr" is not one of "neutral", "primary", "danger"
 --> toolbar.mprx:4:25
  |
4 |   <button intent="dangr" />
  |                   ^^^^^^ did you mean "danger"?
```

The expected type also flows into the branches of `c ? a : b` and into list elements, because the checker already carries an expected type into literals. Nothing else narrows: there is no flow typing, and a string variable is never silently treated as a member.

`x == "blue"`, when `x` is an enum, is checked the same way: a literal that is not in the set is an error. That is the check the `theme == "blue"` example lacks today.

### 4. The runtime validates the boundary

A value declared as an enum that crosses the host boundary is validated against the set: snapshot fields, event payloads, and values coming through `any`. A value outside the set is a runtime diagnostic (`runtime-value-not-in-enum`, proposed) and the render fails closed, as every other boundary mismatch does. The render tree is unchanged: the value is still a string, `propText` is still its own text, and no PORT needs to know the type exists.

### 5. Absence gets two operators and a default

No narrowing means a presence test alone is nearly useless: after `{#if has(x)}` you still could not use `x` as a `T`. Two pure operators fix this without narrowing:

| Form | Type | Meaning |
|---|---|---|
| `has(x)` | `boolean` | Whether the optional value is present |
| `x ?? y` | `join(T, U)`, where `x: T?` and `y: U` | The value if present, otherwise `y`. The result is never optional |

`has` replaces the "compute an empty flag in scope" workaround, and `??` is how a template gives an absent value a meaning. Neither coerces and neither inspects anything but presence. (`len`, subscripts and `?.` from the M3 milestone are deliberately not in this bet: they have no consumer yet.)

### 6. Defaults for composite props

A composite prop declaration gains an optional `default`: a value of the prop's type. When the prop is omitted, the composite's scope name is bound to the default, so the scope type is `T`, not `T?`, and assembly rule 4b is satisfied by construction. Defaults apply to composites only. For a primitive, an absent prop stays absent and the realization decides what that means (the element's own initial value), so the PORT contract is unchanged.

In Valance, a component's prop is declared as it is for state, `field(schema, default)`, which `defineApp` already uses ("a state field is its type and default in one declaration"):

```ts
component(button, { props: { size: field(Schema.Literal("sm", "md", "lg"), "md") } });
```

### 7. The Effect Schema bridge

`Schema.Literal("a", "b")` and a union made only of string literals become an `enum`. Any other union that has no MESH type becomes a diagnostic at the field's line in `main.ts`, instead of a raw error with a stack. A one-line fix to a defect the TEMPLATE-TYPES note already recorded.

### 8. String joining, smaller and less certain

MPRX cannot build a string from other values, which is why a layout cannot build a base-aware address (finding D3). The non-goal's reason is that "a prop's text is its value's (§9.7.7)": producing text from a number or boolean means formatting. `string + string` involves no conversion: it is concatenation of two present strings, with no coercion (the `+` rule today requires numbers on both sides). Allow that and nothing more.

This is the part of the bet I am least sure belongs here, and it can be cut without affecting the rest.

### Alternatives considered

| Alternative | Why not |
|---|---|
| General union types | The v0.2 reasoning still holds: they bring narrowing, join rules for every pair, and a representation question at the boundary. An enum is the 90 percent case for design systems at a fraction of the surface |
| Keep `string` and add a lint | Cannot be enforced across a library boundary, and does nothing for editor completion or the runtime check |
| Number and boolean enums | No consumer. Add when one appears |
| Make `string` assignable to an enum with a runtime check only | Moves a compile-time error to a render-time failure for the common case of a literal |
| Put variants in the style system only (Bet 6) | Variants are props of any component, not just styled ones |

## Experiment

1. **Rust checker and manifest.** Add the `enum` kind to `manifest-v1`'s schema, to `mesh-manifest`, and to the checker's `is_assignable` and `join`; add literal-site checking and `unknown-variant`. Write the conformance vectors below first.
2. **Runtime and JS packages.** Validate enums at the boundary; add `runtime-value-not-in-enum`. Confirm the render tree and patches are byte-identical for existing programs.
3. **`has` and `??`, then defaults.** Spec text, diagnostics, runtime, then composite `default`.
4. **Valance.** The Effect Schema bridge, `field` on component props, and the typed template imports (`.d.mprx.ts`).
5. **Editor.** Completion lists the values inside an attribute whose prop is an enum; hover shows the set.
6. **Migrate the examples.** Change each closed string set in `examples/` and the CLI templates to an enum, and record how many latent errors surface.

**Conformance vectors** (language-neutral, in Rust and JavaScript): assignability and join tables for every pair of types involving an enum, reflexive and transitive over generated sets; literal membership at each literal site (attribute, `==`, `?:` branches, list element); `has` and `??` over every optionality combination; default binding versus an omitted required prop; boundary validation for each place a value enters.

## Success

- `intent="dangr"` and `theme == "blue"` are compile errors with a suggestion, in the compiler, the CLI and the editor.
- The editor completes the allowed values.
- An optional composite prop with a default can be shown, compared and passed on inside its template.
- Every existing program renders byte-identically, and no PORT changed.
- Migrating the examples finds at least one real latent mistake or removes at least one workaround. (If it finds none, say so; that is also evidence about how much this matters.)

## Kill

- If the checker needs flow typing to make ordinary templates pass, stop at literal sites and `==` and do not widen the checker.
- If `join` of enums produces errors that surprise authors in the migrated examples, fall back to treating an enum as a string with membership checks at literal sites only (a refinement, not a type), and drop `join(enum, enum)`.
- If a consumer needs numbers or mixed sets, do not extend the kind. Revisit unions as a separate bet, with that consumer's code as evidence.

## Breaks (allowed in the free window)

- Programs that pass a non-member string to an enum-typed prop become errors, by design.
- State fields declared with `Schema.Literal` become enums, so templates that compared them with a non-member literal now fail to check.
- An `any`-typed workaround for a union can be replaced; none has to be.

## Open questions for stage 3

- The diagnostic code names (`unknown-variant`, `runtime-value-not-in-enum`) and whether `has` and `??` need new codes for misuse.
- The upper limit on the number of values, and whether very large sets should be named types.
- Whether a `default` may be written in the manifest for a primitive's prop for documentation only. Current answer: no.
- String joining (design item 8): keep or cut.
