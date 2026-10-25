/// <reference path="../types/mprx.d.ts" preserve="true" />
// @valancex/common: the author's side of the application model. What `src/main.ts` may export. It is optional. An application with no `src/main.ts` has the page-per-Markdown-file behaviour and nothing else;
// `defineApp` adds what only code can say: the component tree, state of the application's own, and the commands that change it. A layout reads the state's fields by name and runs the commands
// by name.
//
//   import { Schema } from "effect";
//   import layout from "./layout.mprx";
//   import themeToggle from "./theme-toggle";           // theme-toggle.ts: export default component(template, { props, events })
//
//   export default defineApp({
//     layout: component(layout),
//     components: [themeToggle],
//     state: { theme: field(Schema.Literal("light", "dark"), "light") },
//     commands: (command) => ({ toggleTheme: command((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" })) }),
//   });
//
// A component owns its interface and states it once, in types, where it is defined:
//
//   // theme-toggle.ts
//   import { Schema } from "effect";
//   import template from "./theme-toggle.mprx";
//   export default component(template, {
//     props: { theme: Schema.Literal("light", "dark") },
//     events: { toggle: Schema.Void },                      // an event's schema is its payload; the empty schema is no payload
//   });
import type * as Valance from "@valancex/valance";
import { UNIT } from "@valancex/valance";
import { Schema } from "effect";

import type { Interceptor } from "./transport.js";

/** The part of the application's state the framework owns: which page is shown. A command's `state` always has it. */
export interface PageState {
  readonly page: string;
  /** How much room the page has: `compact` (under 600 px wide: a phone), `medium` (600 to 839) or `expanded` (840 and up). The framework keeps it current as the window changes; a layout reads it as `viewport`. */
  readonly viewport: Viewport;
  /** The pages visited, in order, for `back` and `forward`: `go` adds the page it goes to after the one shown (and drops any that were ahead). */
  readonly trail: ReadonlyArray<string>;
  /** Where in `trail` the page shown is. */
  readonly cursor: number;
  /** The colors the person's system asks for: `light` or `dark`. The framework keeps it current (the page's `prefers-color-scheme`, the window's system theme); a layout reads it as `colorScheme`. The server renders `light`; the page corrects it as it starts. */
  readonly colorScheme: ColorScheme;
}

/** The system's color preference. */
export type ColorScheme = "light" | "dark";

/** What an application asks its window to look like: a scheme, or `system` for the person's own. */
export type Appearance = ColorScheme | "system";

/** Window size classes, the ones Material Design and iOS size classes agree on closely enough to design for. */
export type Viewport = "compact" | "medium" | "expanded";

// ---- state -------------------------------------------------------------------------------------------------------------------------------------------------

export const FIELD = Symbol.for("valancex.common.field");

/** The brand of a state field that holds a form (`Form.field()`): the application then takes the person to the first field in error after a failed submit, with nothing written. */
export const FORM = Symbol.for("valancex.common.form");

/** A state field: its type and its default, declared together. */
export interface Field<A = unknown> {
  readonly [FIELD]: true;
  readonly schema: Schema.Schema<A, any, never>;
  readonly initial: A;
}

/**
 * Declares one field of the application's state with its type and its default in one place. The framework builds the state's schema and its initial value from the fields; the default is
 * checked against the type (by TypeScript, and again when the application is built).
 */
export const DERIVED = Symbol.for("valancex.common.derived");

/** A value worked out from the state, and the type it has. A template reads it by name, like a state field, and no command changes it. */
export interface Derived<A = unknown> {
  readonly [DERIVED]: true;
  readonly schema: Schema.Schema<A, any, never>;
  readonly from: (state: any) => A;
}

/** What `derived` is given: `derive(type, (state) => value)`. The state is the application's, as a command sees it. */
export type DeriveMaker<S> = <A, I = A>(schema: Schema.Schema<A, I, never>, from: (state: S) => A) => Derived<A>;

const derive: DeriveMaker<any> = (schema, from) => ({ [DERIVED]: true, schema: schema as Schema.Schema<any, any, never>, from });

export const field = <A, I = A>(schema: Schema.Schema<A, I, never>, initial: NoInfer<A>): Field<A> => ({ [FIELD]: true, schema: schema as Schema.Schema<A, any, never>, initial });

/** Fields declared one by one. */
export type Fields = Readonly<Record<string, Field<any>>>;

/** A schema built by hand with a separate initial value: for hydration and for schemas shared with other code. */
export interface HandBuilt<F extends Schema.Struct.Fields = Schema.Struct.Fields> {
  readonly schema: Schema.Struct<F>;
  readonly initial: Schema.Struct.Type<F>;
}

export type StateInput = Fields | HandBuilt<any>;

/** The type of the state a definition declares, beyond the page. */
export type StateOf<S> = S extends HandBuilt<infer F> ? Schema.Struct.Type<F> : S extends Fields ? { readonly [K in keyof S]: S[K] extends Field<infer A> ? A : never } : {};

// ---- components --------------------------------------------------------------------------------------------------------------------------------------------

/**
 * What importing a template file gives you: its address. `P` and `E` are the names of its props and events when the toolchain has generated them (`.valance/templates.d.ts`, included by the
 * project's `tsconfig.json`); without that, templates are untyped (`string`).
 */
export interface Template<P extends string = string, E extends string = string> {
  readonly mprx: string;
  readonly "~props"?: P;
  readonly "~events"?: E;
}

export const COMPONENT = Symbol.for("valancex.common.component");

/** One component: a template, and the interface it declares if it declares one. Which components its template uses is read from the template; nothing is written twice. */
export interface Component {
  readonly [COMPONENT]: true;
  readonly template: Template;
  /** Present when the component declares its props (an omitted side of a declared interface is none). Absent: the contract is inferred from the template and its uses. */
  readonly props?: Readonly<Record<string, PropDeclaration>>;
  readonly events?: Readonly<Record<string, Schema.Schema<any, any, never>>>;
  /** The prop that is the component's accessible name, when its template passes the name of whoever uses it through to a control (see `Contract.name`). */
  readonly name?: string;
  /** The state and commands of one occurrence of the component, when it has any (see `unit`). */
  readonly unit?: Valance.Unit;
}

export const SNIPPET = Symbol.for("valancex.common.snippet");

/** A prop that is a piece of template: what an occurrence writes between its tags (`children`), or as a `{#snippet}` of that name among them. */
export interface SnippetDeclaration {
  readonly [SNIPPET]: true;
  /** The types of the snippet's parameters, in order; `{@render name(a, b)}` passes exactly these. */
  readonly params: ReadonlyArray<Schema.Schema<any, any, never>>;
  /** Whether an occurrence may leave it out. Rendering it then needs `{#if has(name)}` around the render (`possibly-absent-snippet`). */
  readonly isOptional: boolean;
  /** The same snippet, which an occurrence may leave out: `snippet(Item).optional()`. */
  optional(): SnippetDeclaration;
}

/**
 * Declares a prop whose value is a snippet, with the types of its parameters: `children: snippet()` is the content written between the component's tags; `row: snippet(Item, Schema.Number)` is a
 * `{#snippet row(item, index)}` an occurrence passes and the template renders with `{@render row(item, index)}`. The prop named `children` is reserved for the content between the tags and takes no
 * parameters. A snippet is not data: it has no default, is not a field of a record or an event's payload, and is declared on a component that has a template. `snippet(...).optional()` is one an occurrence may leave out (an absent one draws nothing), and `children: snippet().optional()` is content an occurrence may leave out.
 */
export const snippet = (...params: ReadonlyArray<Schema.Schema<any, any, never>>): SnippetDeclaration => declare(params, false);

const declare = (params: ReadonlyArray<Schema.Schema<any, any, never>>, isOptional: boolean): SnippetDeclaration => ({
  [SNIPPET]: true,
  params,
  isOptional,
  optional: () => declare(params, true),
});

/** Whether a declaration is a snippet's. */
export const isSnippet = (value: unknown): value is SnippetDeclaration => typeof value === "object" && value !== null && SNIPPET in value;

/** A prop is declared by its schema, by `field(schema, default)` when an occurrence that leaves it out should get a value, or by `snippet(…)` when it is a piece of template. */
export type PropDeclaration = Schema.Schema<any, any, never> | Field<any> | SnippetDeclaration;

/** Whether a prop is declared with a default. */
export const isFormField = (value: unknown): boolean => typeof value === "object" && value !== null && FORM in value;

export const isField = (value: unknown): value is Field => typeof value === "object" && value !== null && FIELD in value;

export interface Contract<P extends string, E extends string> {
  /**
   * The inputs the template reads, each with its type. Optional when the schema admits `undefined`. `field(schema, default)` gives a prop a default: an occurrence of the component that leaves
   * the prop out gets the default (for a component with a template; a primitive ignores it), and the prop may then be left out. A string-literal union (`Schema.Literal("a", "b")`) is a closed set:
   * the model checks every literal written for it. With neither `props` nor `events` the contract is inferred; with either, the interface is exactly what is written (an omitted side is none).
   */
  readonly props?: { readonly [K in P]: PropDeclaration };
  /** The events the template raises, each with its payload's schema; `Schema.Void` is no payload. */
  readonly events?: { readonly [K in E]: Schema.Schema<any, any, never> };
  /**
   * The prop that is the component's accessible name: a component whose template draws a control and takes its name from whoever uses it (a labelled checkbox of the design system) says which
   * prop that is, and the toolchain holds both sides to it. The prop must be a string every use writes (the model reports a use that omits it, where it is written), and the template must read it;
   * a control in the template that has no name of its own (no `label`, not inside a `<label>`) is then not reported by `unnamed-control`, because the name arrives from the use.
   */
  readonly name?: P;
  /**
   * State that belongs to one occurrence of the component, such as whether a disclosure is open or which tab is chosen: `unit({ state, commands })`. The template reads its fields and runs its commands
   * by name, like any others; the application never sees them. A component with a unit states its interface (`props` and `events`, empty if it has none).
   */
  readonly unit?: Valance.Unit;
}

/**
 * Defines a component: its template and an optional contract. Register it once, in `defineApp`'s `components`; the templates that write its tag use it, and nothing about its interface is
 * written again there. Where the toolchain has generated the template's type, a contract that disagrees with the template's keys is a compile-time error.
 */
export function component<P extends string = string, E extends string = string>(template: Template<P, E>, contract: Contract<NoInfer<P>, NoInfer<E>> = {}): Component {
  return {
    [COMPONENT]: true,
    template,
    ...(contract.props === undefined ? {} : { props: contract.props }),
    ...(contract.events === undefined ? {} : { events: contract.events }),
    ...(contract.name === undefined ? {} : { name: contract.name }),
    ...(contract.unit === undefined ? {} : { unit: contract.unit }),
  };
}

// ---- units ---------------------------------------------------------------------------------------------------------------------------------------------------

/** What a unit's commands change: some of its fields. */
type Changes<S> = Partial<S>;

/** One command of a unit: a function of the state as the person saw it that returns the fields it changes, or the same with parameters and the events it announces. */
export type UnitCommandSpec<S, P extends Schema.Struct.Fields = Schema.Struct.Fields> =
  | ((state: S) => Changes<S>)
  | {
      /** The command's parameters, in order: `{ n: Schema.Number }`. Each is a parameter of the command in the model. */
      readonly params?: P;
      readonly run: (state: S, args: Schema.Struct.Type<P>) => Changes<S>;
      /** Events of the component the command announces to its caller, each with the payload it carries, worked out from the state the command leaves: `{ change: (next) => next.at }`. */
      readonly raises?: Readonly<Record<string, (next: S, args: Schema.Struct.Type<P>) => unknown>>;
    };

/** A command with parameters, typed: the parameters' types reach `run` and `raises`. */
export const unitCommand = <S, P extends Schema.Struct.Fields>(spec: {
  readonly params: P;
  readonly run: (state: S, args: Schema.Struct.Type<P>) => Changes<S>;
  readonly raises?: Readonly<Record<string, (next: S, args: Schema.Struct.Type<P>) => unknown>>;
}): UnitCommandSpec<S, P> => spec;

/**
 * Declares the state and commands of one occurrence of a component (Tier 2; a component with no unit needs none of it). The state is typed with defaults, as application state is; a command is a
 * pure function of the state as the person saw it that returns the fields it changes:
 *
 *   export default component(template, {
 *     props: { label: Schema.String },
 *     events: {},
 *     unit: unit({ state: { open: field(Schema.Boolean, false) }, commands: { toggle: (state) => ({ open: !state.open }) } }),
 *   });
 *
 * The template reads `open` and runs `toggle()`; the application holds neither. The state belongs to the occurrence: it follows its row when a keyed list is re-sorted, and starts again from the defaults
 * when the occurrence leaves the page and returns. State that must outlive that (or that another part of the application reads) is application state, not a unit. A field named in `controllable` is
 * owned by the caller when it writes a prop of the same name (the prop must be declared, optional and of the same type): the prop is then the value, the unit's change to it is not applied, and
 * `raises` tells the caller what the person chose.
 */
export const unit = <F extends Fields>(definition: {
  readonly state: F;
  readonly commands: { readonly [name: string]: UnitCommandSpec<StateOf<F>, any> };
  readonly controllable?: ReadonlyArray<Extract<keyof F, string>>;
}): Valance.Unit<StateOf<F>> => {
  const entries = Object.entries(definition.state) as Array<[string, Field<any>]>;
  const fields = Object.fromEntries(entries.map(([name, each]) => [name, { schema: each.schema, initial: each.initial }]));
  const schema = Schema.Struct(Object.fromEntries(entries.map(([name, each]) => [name, each.schema])));

  return {
    [UNIT]: true,
    schema: schema as unknown as Schema.Schema<StateOf<F>, any, never>,
    fields,
    controllable: definition.controllable ?? [],
    commands: Object.fromEntries(
      Object.entries(definition.commands).map(([name, command]) => [
        name,
        typeof command === "function"
          ? { run: command }
          : {
              ...(command.params === undefined ? {} : { input: Schema.Struct(command.params) }),
              run: command.run,
              ...(command.raises === undefined ? {} : { raises: command.raises }),
            },
      ]),
    ),
  } as Valance.Unit<StateOf<F>>;
};

// ---- the application ---------------------------------------------------------------------------------------------------------------------------------------

/**
 * What the document's title is made of. `page` is the page's own part (default: its title, from the Markdown front matter), `app` the application's name (default: the site's name), `status` what is
 * going on right now and is not part of any page (an unread count, "Saving…"): it is written first, in parentheses. The project's format in \`valance.json\` (`"title": "{page} · {site}"`) puts them
 * together. A target that is not a web page uses the same three parts for its own surfaces (a window title, a navigation bar, a badge). All text: control and direction-override characters are removed
 * and the length is limited, so a title built from user data cannot reorder or hide what surrounds it.
 */
export interface TitleParts {
  readonly page?: string;
  readonly app?: string;
  readonly status?: string;
}

/** What differs between targets: the templates. Everything else in the definition (state, commands, title, http) is the application's, and the same on every target. */
export interface TargetParts {
  readonly layout?: Component;
  readonly components?: ReadonlyArray<Component>;
  readonly override?: ReadonlyArray<Component>;
}

export interface AppDefinition<S extends StateInput = {}> {
  /**
   * The templates of one target, for a project with more than one (`valance.web.json` and `valance.desktop.json`): `targets: { web: { layout, components }, desktop: { layout } }`. A target's
   * `layout` replaces the top-level one, and its `components` and `override` are added to it. A target's templates are compiled against that target's vocabulary only; the state, the commands and
   * the content are the one application's.
   */
  readonly targets?: { readonly web?: TargetParts; readonly desktop?: TargetParts };
  /** The page's shell. Omit it to use the built-in layout. Its template must be named `layout.mprx`, and it has no props or events: its inputs are the state and the commands. */
  readonly layout?: Component;
  /** Every component of the application besides the layout and the overrides. A template uses one by writing its tag; one that no template writes yet is not part of the program. */
  readonly components?: ReadonlyArray<Component>;
  /** Built-in components (`heading`, `runs`, …) you replace with your own template of the same name. */
  readonly override?: ReadonlyArray<Component>;
  /**
   * Application state beyond the page: `{ theme: field(Schema.Literal("light", "dark"), "light") }`. Its fields become names a layout can read. A hand-built `{ schema, initial }` is also accepted, for
   * hydration and shared schemas.
   */
  readonly state?: S;
  /**
   * The document's title for a state: `(state, page) => { status: unread > 0 ? String(unread) : undefined }`. A string is the page part. Absent: the page's title and the site's name. It runs for
   * every committed state, on the server for the state it renders and in the browser after each one; it should be cheap and must not throw (a throw is logged and the title stays).
   */
  readonly title?: (state: PageState & StateOf<S>, page: { readonly path: string; readonly title: string }) => TitleParts | string;
  /**
   * What the application sends to its backend, for every request: `http: { interceptors: [bearer(base, token), refreshOn401(refresh), retryGet(2)] }`, outermost first. Interceptors
   * (`@valancex/common/http`) all have one shape, `(next) => next`, so they chain; a narrower scope is `withInterceptors(effect, ...)` around a command's work, or `interceptors` on one request.
   * Used by the page; the server makes no requests.
   */
  readonly http?: { readonly interceptors?: ReadonlyArray<Interceptor> };
  /**
   * The appearance this application asks of its window, for a state: `appearance: (state) => state.theme` (`"light"`, `"dark"` or `"system"`). A page draws its own colors, so it is the desktop
   * window's: the window follows the system's theme unless this says otherwise. Absent: the system's.
   */
  readonly appearance?: (state: PageState & StateOf<S>) => Appearance;
  /**
   * The state fields that outlive a run: `persist: ["items", "theme"]`. They are loaded when the application starts and saved when they change, through the platform's `Store` (the page's
   * storage on the web, a file in the user's data directory on the desktop), under the application's name. What was stored and no longer fits a field's type is ignored, not loaded. Where a
   * platform has no store the application runs as it would without this. A field not listed is not kept (a `navigation` flag on one target should not follow the person to another).
   */
  readonly persist?: ReadonlyArray<Extract<keyof StateOf<S>, string> | "navigation">;
  /**
   * A guard for moving between pages by `go`, `back` and `forward`: the router's `Guard`, asked before the move. It is told where the application is going from and to (a route named for the
   * page, with no parameters), the state, and why: `kind` is `"programmatic"` for `go` and `"history"` for `back` and `forward`. `true` lets it through, `false` stops it (nothing changes),
   * a `redirect(...)` sends it to another page. A guard that throws or fails stops the move. Without one every move is allowed. A page's own Back and Forward are the browser's: the router
   * guards those as `"popstate"`.
   */
  readonly guard?: NavigationGuard;
  /**
   * Values worked out from the state, for a template to read: `derived: (derive) => ({ open: derive(Schema.Number, (state) => state.items.filter((item) => !item.done).length) })`. Each has its
   * type, as a state field does. They are computed from the state each time it changes, on every target, and a command cannot change one (change the state they come from). The function must
   * be pure and must not throw.
   */
  readonly derived?: (derive: DeriveMaker<PageState & StateOf<S>>) => { readonly [name: string]: Derived<any> };
  /** The commands a layout can run. `command` makes one: `command((state) => nextState)` or `command(InputSchema, (input, state) => nextState)`. */
  readonly commands?: (command: Valance.CommandMaker<PageState & StateOf<S>>) => Valance.CommandTable<any, Valance.Ambient>;
}

/** What a navigation guard is told; the router's `GuardContext`, spelled out so the author's entry needs nothing but VALANCE and effect. */
export interface NavigationContext {
  readonly from: { readonly name: string; readonly params: Readonly<Record<string, unknown>>; readonly query: Readonly<Record<string, unknown>> } | undefined;
  readonly to: { readonly name: string; readonly params: Readonly<Record<string, unknown>>; readonly query: Readonly<Record<string, unknown>> };
  readonly state: unknown;
  readonly kind: "link" | "popstate" | "programmatic" | "history" | "initial" | "close";
  readonly data: Readonly<Record<string, unknown>>;
}

/** `true` allows, `false` stops, and `{ _tag: "Redirect", name }` (the router's `redirect(page)`) goes to another page; it may answer now, later or as an Effect. */
export type NavigationGuard = (context: NavigationContext) => unknown;

/** The brand that says a value came from `defineApp`. */
export const APP = Symbol.for("valancex.common");

export interface DefinedApp extends AppDefinition<any> {
  readonly [APP]: true;
}

/** Declares the application's component tree, state and commands. It starts nothing; the framework runs it. */
/** What `derived` makes, for the toolchain: the function is called with the one `derive`. */
export const derivedOf = (author: { readonly derived?: AppDefinition<any>["derived"] } | undefined): Readonly<Record<string, Derived<any>>> => author?.derived?.(derive) ?? {};

export const defineApp = <S extends StateInput = {}>(definition: AppDefinition<S>): DefinedApp => ({ ...definition, [APP]: true }) as unknown as DefinedApp;

// ---- forms ---------------------------------------------------------------------------------------------------------------------------------------------------

export * as Form from "./form.js";
