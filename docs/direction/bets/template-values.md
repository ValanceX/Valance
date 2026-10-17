# Bet 5: Typed template values (snippets)

| | |
|---|---|
| **Stage** | 2 Design, accepted by delegation. The design questions are decided in [decisions](../decisions.md) (U1 to U9); the maintainer has not reviewed the text |
| **Written** | 2026-10-17 |
| **Owner** | Unassigned |
| **Depends on** | [Bet 4](variant-types.md) (the type-kind mechanism, and defaults for optional parts). Bets 10 and 12 depend on this one, and Bet 8 for its second example |

## Question

Can a piece of template be a value that is passed to a component, given typed parameters, rendered where the component chooses, and reused or recursed inside one template, while MPRX stays pure, the render boundary stays data, and node identity stays defined?

## Why, and who is hurt

### What composition can do today

A composite can take **children** and **named slots** (`mesh-slot`, `mesh-fill`). Slot content is "the caller's": it is evaluated in the caller's scope, and the slot only says where it goes ([templates manual, children and the slot](https://github.com/ValanceX/Mesh/blob/main/docs/manual/templates.md#children-and-the-slot)). That is a good, simple model, and it has four limits that a component library meets at once.

| Limit | Source | What it blocks |
|---|---|---|
| **A slot cannot receive data from the component that places it.** The content can only read the caller's scope | templates manual, "The children are the caller's" | A list, table, menu or select where the caller decides how one row, cell or option looks. Today the only way to vary the part is a separate composite per variation, and the component cannot be generic |
| **A composite cannot contain itself**, directly or through others | assembly rule 5, `assembly-cycle` | Anything recursive: a tree, a nested menu, a threaded comment list |
| **A slot must be inside an element of the composite's template.** It is not the template root and not directly under a conditional or a repeat | templates manual, "Where it may be" | Reuse inside one template needs a file of its own |
| **Reuse needs a file and a public name** | the CLI's built-in views | See the next table |

The language specification lists "function types" among the non-goals, and that is the right default. This bet reverses it in a narrow, second-class way (design, section 4), and says exactly how narrow.

### Evidence that the status quo costs files and names

`packages/cli/views/` renders Markdown content. Of the 8 templates in that directory, four exist only so one can be reused or repeated (`block`, `blocks` and `heading-block` are similar and are not counted):

| File | What it is for |
|---|---|
| `runs.mprx` | repeats `inline` over spans |
| `inline.mprx` | one span: strong, emphasis, code, link or text |
| `list-items.mprx` | repeats an item over a list |
| `list-block.mprx` | chooses ordered or unordered, then calls `list-items` |

Each is a separate file, a separate public name, and a separate contract to infer and check, for what would be a local helper in most template languages. `runs` is a documented override point (`packages/cli/README.md:189`) and any built-in view can be replaced (`packages/cli/src/compile.ts:64`), so the cost is not only the files: the granularity of reuse and the granularity of replacement are the same thing today, and they should not be.

### Who is hurt

- A library author cannot write a generic component that lets the caller supply part of its content with typed data.
- An author with a recursive structure has no way to express it.
- A reader of a template sees reuse as a jump to another file.

## Prior art

Reliability: **P** primary source read through a fetch agent; **Repo** this ecosystem's own record. See [prior art](../prior-art.md).

| Who | What they decided and why | Architecture or patch | Lesson here |
|---|---|---|---|
| Svelte 5 (**P**, [migration guide](https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/07-misc/07-v5-migration-guide.md), [snippet docs](https://raw.githubusercontent.com/sveltejs/svelte/main/documentation/docs/03-template-syntax/06-snippet.md)) | Slots became "more involved and confusing" as use cases grew; `let:` "creates a variable whereas all other `:` directives receive a variable". Snippets "allow you to define sections of UI that you can render anywhere, not just passing them as props to a component"; they are visible in the lexical scope, can be passed as ordinary props, are recursive, and are typed `Snippet<[T]>`. Caveat from the docs: a prop named `children` conflicts with inline content | Architecture: a generalization that replaced a special syntax | The right cut is a value with parameters, not more slot syntax. Slots keep working beside it for compatibility |
| React Spectrum (**P**, [v3 RFC](https://raw.githubusercontent.com/adobe/react-spectrum/main/rfcs/2019-v3-architecture.md)) | Higher-order components and render props "generally cause a lot of boilerplate code" | Rejected alternative | Passing a function is the heavy way. A pure template value is the same capability without arbitrary code |
| Radix (**P**, [philosophy](https://raw.githubusercontent.com/radix-ui/primitives/main/philosophy.md)) | "Composition is preferred over configuration" | Principle | A component that takes the part it does not own as content is the pattern Radix states as a principle |
| This ecosystem, slot build notes (**Repo**, the "Built" note under B1 in the [reactivity and composition design](https://github.com/ValanceX/Mesh/blob/main/docs/superpowers/specs/2026-10-06-mesh-fine-grained-reactivity-and-composition.md)) | Found by building slots: "a node that places a slot is never reused as it was, because its memo records the names it reads in its own scope and not the caller's content [...]. A first version without that rule returned stale content in a random update test" | Hard-won detail | The same hazard applies to snippets and needs the same kind of test written first |
| Vue scoped slots, Angular `ng-template`, React render props | Other answers to the same problem | | **Not researched in this session.** The design does not rely on them |

## Constraints

Bounded by [fixed points](../README.md#what-we-hold-fixed) 1 to 4, 6 and 8:

- A template value is **pure**: a function of its parameters and the scope it was declared in. It runs no code.
- **`render-v1` and the patch format do not change.** A rendered snippet is expanded away exactly as a composite is. No PORT needs to know the feature exists.
- Identity (§9.10) stays: a node is still its sites and declared keys. Every conformance vector for it must still pass.
- It fails closed. A mistake is an assembly or runtime diagnostic, never a partial render.
- A snippet cannot cross the host boundary. It is never in a snapshot, an event payload, a record, a list or a patch.

## Design

### 1. Syntax, borrowed from the syntax MPRX already mirrors

MPRX's blocks (`{#if}`, `{:else}`, `{#each x as y (key)}`) already follow Svelte's. Snippets follow it too, so authors who know one know the other.

```xml
<!-- the caller: the part it owns is passed as a snippet named `row` -->
<data-list items={people}>
  {#snippet row(p)}
    <row><text>{p.name}</text><button on.click={select(p.id)}>Open</button></row>
  {/snippet}
</data-list>

<!-- the template of data-list: it chooses where and with what data -->
{#each items as item (item.id)}
  {@render row(item)}
{/each}
```

- `{#snippet name(a, b)} ... {/snippet}` declares a snippet.
- A snippet declared as a **direct child of a composite occurrence** is passed as the prop of the same name. Loose children are passed as the prop `children`, with no parameters. This is Svelte's rule, and it lets slots be defined in terms of snippets (section 7).
- A snippet declared anywhere else in a template is **local**. It can be rendered in that template, or passed explicitly: `row={row}`.
- `{@render name(args)}` renders one. It may appear wherever an element may.
- The word "snippet" avoids a clash with MESH's own "template" (the compiled form of a component). It is cheap to rename in the free window.

### 2. A new type kind, second-class

The manifest gains the kind from [Bet 4](variant-types.md)'s mechanism:

```json
{ "kind": "snippet", "params": [ { "kind": "named", "name": "Person" } ] }
```

Written `snippet<Person>`. Parameters are positional and ordered, like a command's.

| Where the kind may appear | Allowed |
|---|---|
| A composite's **prop** type | Yes |
| A composite's **scope** name type (bound from that prop) | Yes |
| A primitive's prop | **No**: a primitive's props cross the PORT boundary (`assembly-snippet-to-primitive`) |
| A record field, a list element, a named type, an event payload, a command parameter, the root scope | **No**. A snippet is never stored, returned, or sent anywhere |
| An expression other than the whole value of a snippet-typed attribute, an argument to `{@render}`, or a snippet-typed name passed along | **No**. It cannot be compared, joined, or put in `?:` |

**Assignability** compares parameters **contravariantly** and requires the same arity. `snippet<Person>` fits a prop that wants `snippet<Employee>` only if every `Employee` is a `Person`. That is the only subtyping the kind introduces.

This is what keeps "function types" a non-goal in every way that matters: a snippet cannot be applied in an expression, returns no value, has no identity of its own, and exists only while the render that created it is being computed.

### 3. Scope and events are lexical

- A snippet body reads the **declaring template's** scope plus its own parameters. It never reads the scope of the template that renders it.
- Handlers in the body name the declaring template's commands and events. Today's rule for children carries over unchanged: "a handler in children written in `shell`'s template ... names `shell`'s events".
- A composite's declared events are unaffected.

### 4. Parameter types

- When a snippet is passed to a prop, its parameters are typed by the prop's declared `snippet<...>`.
- When a snippet is local and only rendered in its own template, its parameter types are **inferred from its render sites** and joined, as a composite's prop types are inferred from its uses today. Two render sites that disagree are an error at the second, as for composites.
- `{@render name(args)}` takes **exactly** as many arguments as the snippet has parameters, as commands do.

### 5. Recursion

A snippet may render itself or another snippet that renders it. The composite rule against cycles is unchanged, because a composite's expansion is a structural fact checked before evaluation. For snippets the question is termination, and the data is finite and acyclic (a value that contains itself is rejected at the boundary), so recursion over data terminates unless a snippet re-renders itself with the same argument. That case is stopped at runtime: exceeding a render depth limit (proposed 100, a resource limit like the manifest nesting limit) is the diagnostic `runtime-snippet-depth`, and the render fails closed.

### 6. Identity

Identity is a sequence of steps from the root (§9.10). A render site adds a step, as a slot does (`0x06`) and a repeat does (`0x05`):

- `{@render name(args)}` adds a **render step** (a new kind, proposed `0x07`) at the render site's position, with no component.
- The snippet body's own sites follow, at their positions within the body.
- The step carries the site's path in the *rendering* template, so one snippet rendered at two sites, or under two parents, or in two repeat items, never shares a key. The declaring template contributes only the positions inside the body.
- A render site inside a `{#each}` is keyed by the item's declared key like any other node.
- A snippet passed through several composites ends up with the path of the composites that carried it plus the render site, so it is unique.

The required conformance vectors (written before any implementation, like the identity vectors for slots): the same snippet rendered twice under one parent; rendered in each item of a repeat with items reordered; passed through two composites; rendered recursively three levels deep; a snippet whose declaring template is inside a repeat.

### 7. Slots become sugar

| Today | After |
|---|---|
| `<mesh-slot />` | `{@render children()}`, the `children` prop with no parameters |
| `<mesh-fill slot="header">...</mesh-fill>` | `{#snippet header()}...{/snippet}`, the prop `header` |
| Loose children | the `children` snippet prop |

Both forms are accepted until the **Language Gate** passes, then the slot elements are retired with a diagnostic that names the replacement (`retired-element`, as MESH 0.11 did for `mesh-if`). One consequence is gained for free: a snippet can be rendered at the template root and directly under a conditional or repeat, which slots cannot.

### 8. How it evaluates

A snippet value is the pair (body, the declaring occurrence's scope). Because it is never stored, compared, or returned, it never needs to outlive the render that created it: no heap closure is needed, only a reference to the scope frame that is already alive.

The update path (memoization of unchanged inputs, `reads` derived by the runtime, patches by key) treats `{@render s(args)}` like a composite occurrence whose scope is the declaring scope plus the arguments. The equivalence law is the acceptance gate: applying `update`'s patches to the previous tree must equal a fresh render of the new snapshot, over random programs that use snippets. The slot work shows the hazard: a node that places content must not be reused on the strength of names it reads in its own scope alone.

### 9. Authoring in Valance

- The TypeScript side gets a `Snippet` helper, so `component(dataList, { props: { row: Snippet(Person) } })` declares the contract, and the typed template import (`Template<props, events>`) carries it.
- The editor shows a snippet's signature on hover, completes snippet names after `{@render`, and goes from a render to its declaration.
- The Tree-sitter grammar, the highlight queries, `mesh-format` and the language server gain the two constructs. The formatter changes whitespace between tokens and nothing else, and must keep that.

### Alternatives considered

| Alternative | Why not |
|---|---|
| Scoped slots (Vue's `v-slot`, Svelte 4's `let:`) | Solves passing data up, not reuse or recursion inside one template, and Svelte moved off it for the confusion it caused |
| Function-typed props (render props) | Needs function types and arbitrary code in views, against fixed point 1. React Spectrum calls the pattern boilerplate-heavy |
| Keep one composite per fragment | The status quo. It works and costs files, names and contracts, and cannot take typed parameters from the caller |
| Compile-time inlining only | Gives local reuse but no typed parameters from the caller and no recursion, so it does not unblock a library |
| Allow snippets in records and lists | Would put code-like values in the data model and across the boundary. Rejected: the boundary stays data |

## Experiment

1. **Vectors and the desugaring law first.** Identity vectors (section 6), the contravariance table, and a property test that `{@render s(a)}` equals the declared body with the parameters bound to the evaluated arguments, in the declaring scope.
2. **Grammar, parser, semantic model, analysis.** Tree-sitter nodes for the two constructs, then the checks in sections 2 to 4 with stable diagnostic codes.
3. **Template format.** The templates carry a new node form. `template-v1` and `render-v1` "gain optional properties only", and a new child kind is more than that, so either a format `version` bump or an agreed extension rule is needed. This is the first open question below.
4. **Runtime, identity and patches** in Rust, then the WebAssembly packages. Run the update equivalence law over random snippet programs and the keyed-list benchmark.
5. **Valance and editor.**
6. **Acceptance examples.** A generic `data-list` (rows supplied by the caller), a recursive tree menu, and a copy of the Markdown content views rewritten with local snippets. Do **not** replace the public override points in the real `packages/cli/views/`: fold the private helpers only, or keep the composites as thin wrappers, so `override` still works.

## Success

- `data-list` renders caller-supplied rows with typed parameters, on both targets, with no PORT change.
- The recursive tree menu renders to the depth of its data, and a self-referencing snippet fails with `runtime-snippet-depth`.
- All existing identity, event-resolution and update conformance vectors pass unchanged, plus the new ones.
- The update equivalence law holds over random snippet programs.
- On the 10,000-item keyed-list benchmark, a row supplied as a snippet costs within 10 percent of the same row as a composite.
- The Markdown views copy needs fewer files, with the same output, and `override` still works on the originals.

## Kill

- If identity cannot be defined without storing snippet values, stop. The second-class rule is the reason this is safe.
- If the update equivalence law fails in ways that need a runtime cache keyed by snippet values, stop and keep slots.
- If the benchmark cost exceeds the 10 percent budget and cannot be brought down by memoization, ship snippets for typing and recursion only, and keep composites for hot lists.
- If authors in the outside-author experiment keep reaching for function types, the second-class rule is too strict. Record the cases before loosening anything.

## Breaks (allowed in the free window)

- `mesh-slot` and `mesh-fill` are retired after the Language Gate, with diagnostics that name their replacements.
- Composites that rely on being usable as a slot host change to declare a `children` snippet prop where they accept content.
- Documentation and examples that teach slots are rewritten.

## Open questions for stage 3

- **The template format.** A format version bump, or an agreed rule for extending the child kinds within `template-v1`. Current lean: bump to `template-v2` while there are no outside consumers.
- **Where `children` is declared.** Svelte's caveat (a prop called `children` conflicts with inline content) suggests reserving the name.
- **The depth limit's value** and whether it is configurable by the host.
- **Whether `{@render}` may appear as the root of a template.** The consequence of section 7 says yes; the update and identity vectors will say whether it is safe.
- **The word "snippet".**
