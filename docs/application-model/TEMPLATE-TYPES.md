# Template types: what the current design infers, and what it cannot

Question: can the design check a template's types, infer a component's inputs and outputs, and bind properties that come from Effect data types? Everything below was run (probe projects against `vlx check` and the real `mesh-lsp`), not read off the code.

## What is already inferred and checked

The MESH compiler checks every template against the manifest and **infers each component's contract from its own template and its uses**. `vlx check` reports these at `file:line:col`:

| Probe | Result |
|---|---|
| `{count + "x"}` (number + string) | `type-mismatch: an operand of + needs number, found string` |
| `{#if count}` (number as boolean) | `type-mismatch: the condition needs boolean, found number` |
| `{user.nme}` on `Struct({ name })` | `unknown-member: … has no member "nme" (did you mean "name"?)` |
| `{#each user as u (u.id)}` over a record | `type-mismatch … needs list<any>` |
| a component's prop type | **inferred from how its template uses it** (`{n + 1}` makes `n` a `number`); a use that passes a string is an error at that use |
| two uses of one component that disagree | error at the second |
| an event's payload | inferred from the raise (`pick(n)` → `number`); a handler `setCount($event)` is checked against it, `setCount(name)` is an error |
| a command called with the wrong argument | `type-mismatch: the argument "value" of command "setCount" needs number, found string` |
| a name the component was not passed (`{count}` inside a component) | `unknown-reference … isn't in the template's scope` (a component sees only its props) |
| an unknown command or state name | `unknown-reference` / `unknown-command` with a suggestion |

The inferred contract is written to `.valance/manifest.json` (`components.badge.props`, `.events.pick.payload`) and the editor shows it: hovering `<theme-toggle>` gives `component theme-toggle { theme: string  on.toggle }`; hovering `{theme}` gives `theme: string`; an event says "with no payload".

On the TypeScript side `state`, `initial` and every command's `state` are typed by the Effect schema (`defineApp`'s `F`), so `main.ts` is checked by `tsc`.

## Update: contracts are declared, and templates are typed from them

Item 1 below describes the design this note was written against. Since then:

- A state field is its type and default in one declaration: `field(Schema.Number, 0)`. The hand-built `schema` + `initial` pair is still accepted; naming both is the same definition error as a clash.
- A component states its interface where it is defined: `component(template, { props: { n: Schema.Number }, events: { pick: Schema.Number }, uses: [...] })`. Declaring either side declares the contract exactly (an omitted side is none) and overrides inference; declaring neither keeps the inferred contract. A prop is optional when its schema admits `undefined`; an event's schema is its payload, and an empty schema (`Schema.Void`) is no payload. A string-literal union is a closed set (`Schema.Literal("a", "b")` is the MESH type `"a" | "b"`, checked at every use), and `field(schema, value)` gives a prop a default that a use of the component leaves out (MESH 0.14; an older MESH widens the set to `string` and refuses a default). MESH reports an undeclared or missing prop, a prop of the wrong type and a handler for an undeclared event at the use or the template. The layout's contract is not declared (an error).
- `vlx check`, `dev` and `build` write `.valance/types/<template>.d.mprx.ts`, so `import x from "./x.mprx"` has the type `Template<"props", "events">` when the project's `tsconfig.json` has `allowArbitraryExtensions` and `rootDirs: ["src", ".valance/types"]`; a declaration that disagrees with the template's names is a compile-time error. Without the configuration the import is untyped; the types are stale until the next `check`, `dev` or `build`.

Still not covered: value-level agreement between a template and its component, literals as types, exposing derived values, and unused props or events.

## What is lost or missing

1. **The two sides do not meet.** `main.ts` is checked by TypeScript and the templates by MESH, and nothing relates them except the manifest. `component(badge, { props: ["n"] })` lists *names*; the type `n: number` is inferred in the template and visible only in a template hover. A TypeScript author sees no type at the declaration and gets none from it.
2. **Effect schemas map onto MESH's type system, which is small on purpose.** MESH has `string number boolean null any list record optional` and no union, literal or nullable type (MPRX-SPEC §9.2; unions and nullable types are listed as non-goals). `Valance.manifest` converts the *decoded* schema (`typeAST`). Measured per field type:

| Effect type | Result |
|---|---|
| `String Number Boolean`, `Struct`, `Array`, `optional`, `brand`, `Int`, `UUID`, `NumberFromString` | typed |
| `Literal("light","dark")` | becomes `string`: `theme == "blue"` is **not** an error |
| `Option`, `NullOr`, `Union`, `Date`, `BigInt`, `Duration`, `Either`, `Class`, `Record`, `Tuple` | **not representable** |
3. **Unrepresentable types are a crash, not a diagnostic.** `vlx check` prints a raw `ManifestError: layout.f: Declaration has no MESH type` with a stack. It breaks the project's own rule (every mistake is `file:line:col code: message` pointing into authored source). This is a defect, cheap to fix: catch it where the manifest is derived and report at the field's line in `main.ts`.
4. **There is no way to expose a derived value.** The layout's scope is the framework's names plus the state's fields, verbatim (`application()` spreads them). There is no computed property, so a state of `Option<User>` or `Date` cannot be shown even in principle; the author cannot write the view of it (`Valance.View.scope` is a function from state, but `defineApp` does not expose it).
5. **Event and prop types are inferred only.** A component's interface cannot be stated and then enforced; the template defines it. Changing a template's use of a prop silently changes the contract, and only the callers' errors say so.

## What the design can grow into (not built)

- **A typed declaration.** `component(badge, { props: { n: Schema.Number, label: Schema.String }, events: { pick: Schema.Number } })`: the same slot that lists names today holds Effect schemas. `vlx check` compares them with the inferred contract (both directions, as names are compared now), TypeScript sees the types at the declaration, and the declared schema, not the inference, becomes the manifest entry. This is Angular's typed `@Input`/`@Output` and it keeps one place to read an interface.
- **Generated types for the imports.** Replace the wildcard `*.mprx` module with `.valance/types.d.ts` declaring `./badge.mprx` as `Template<{ n: number; label: string }, { pick: number }>` from the enriched manifest. `component(badge, …)` can then be checked by `tsc`, and an editor shows the contract on the import. This is the Svelte/Vue route (a generated type per template) and needs no change to MESH.
- **Expose derived values.** `defineApp({ expose: { schema: Struct({…}), derive: (state) => ({…}) } })` feeding the existing `scope` function. The author writes the template-facing shape in MESH-representable types (`Option<User>` → `{ signedIn: boolean, name: string }`, `Date` → string); this is the honest answer to MESH having no union, and it is where Effect types meet the template.
- **Check literals.** Needs MESH (a literal type, or an enum): `theme == "blue"` cannot be caught from Valance. Until then a declared `Literal` can at least be checked in `main.ts` (command results) by `tsc`.

Order by value for cost: (3) now; typed declarations and generated types next, together; `expose` after; literals wait for MESH.
