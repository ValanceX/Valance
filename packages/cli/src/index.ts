/// <reference path="../types/mprx.d.ts" preserve="true" />
// The author's side of the application model: what `src/main.ts` may export. It is optional. An application with no `src/main.ts` has the page-per-Markdown-file behaviour and nothing else;
// `defineApp` adds what only code can say: the component tree, state of the application's own, and the commands that change it. A layout reads the state's fields by name and runs the commands
// by name.
//
//   import layout from "./layout.mprx";
//   import themeToggle from "./theme-toggle";           // theme-toggle.ts: export default component(template, { props, events })
//
//   export default defineApp({
//     layout: component(layout, { uses: [themeToggle] }),
//     state: { theme: field(Schema.Literal("light", "dark"), "light") },
//     commands: (command) => ({ toggleTheme: command((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" })) }),
//   });
//
// A component owns its interface and states it once, in types, where it is defined:
//
//   // theme-toggle.ts
//   import template from "./theme-toggle.mprx";
//   export default component(template, {
//     props: { theme: Schema.Literal("light", "dark") },
//     events: { toggle: Schema.Void },                      // an event's schema is its payload; the empty schema is no payload
//   });
import type * as Valance from "@valancex/valance";
import { Schema } from "effect";

export { Schema };

/** The part of the application's state the framework owns: which page is shown. A command's `state` always has it. */
export interface PageState {
  readonly page: string;
}

// ---- state -------------------------------------------------------------------------------------------------------------------------------------------------

export const FIELD = Symbol.for("valancex.cli.field");

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

export const COMPONENT = Symbol.for("valancex.cli.component");

/** One node of the component tree: a template, the interface it declares if it declares one, and the components its template uses. */
export interface Component {
  readonly [COMPONENT]: true;
  readonly template: Template;
  /** Present when the component declares its props (an omitted side of a declared interface is none). Absent: the contract is inferred from the template and its uses. */
  readonly props?: Readonly<Record<string, Schema.Schema<any, any, never>>>;
  readonly events?: Readonly<Record<string, Schema.Schema<any, any, never>>>;
  readonly uses: ReadonlyArray<Component>;
}

export interface Contract<P extends string, E extends string> {
  /**
   * The inputs the template reads, each with its type. Optional when the schema admits `undefined`. A prop has no default: the model has none. With neither `props` nor `events` the contract is
   * inferred; with either, the interface is exactly what is written (an omitted side is none).
   */
  readonly props?: { readonly [K in P]: Schema.Schema<any, any, never> };
  /** The events the template raises, each with its payload's schema; `Schema.Void` is no payload. */
  readonly events?: { readonly [K in E]: Schema.Schema<any, any, never> };
  /** The components its template uses, and only those. */
  readonly uses?: ReadonlyArray<Component>;
}

/**
 * Defines a component: its template, an optional contract, and the components its template uses. Use sites name only what they use (`uses: [themeToggle]`); nothing about the interface is
 * written again there. Where the toolchain has generated the template's type, a contract that disagrees with the template's keys is a compile-time error.
 */
export function component<P extends string = string, E extends string = string>(template: Template<P, E>, contract: Contract<NoInfer<P>, NoInfer<E>> = {}): Component {
  return {
    [COMPONENT]: true,
    template,
    ...(contract.props === undefined ? {} : { props: contract.props }),
    ...(contract.events === undefined ? {} : { events: contract.events }),
    uses: contract.uses ?? [],
  };
}

// ---- the application ---------------------------------------------------------------------------------------------------------------------------------------

export interface AppDefinition<S extends StateInput = {}> {
  /** The page's shell, and under it every component of the application. Omit it to use the built-in layout. Its template must be named `layout.mprx`, and it has no props or events: its inputs are the state and the commands. */
  readonly layout?: Component;
  /** Built-in components (`heading`, `runs`, …) you replace with your own template of the same name. */
  readonly override?: ReadonlyArray<Component>;
  /**
   * Application state beyond the page: `{ theme: field(Schema.Literal("light", "dark"), "light") }`. Its fields become names a layout can read. A hand-built `{ schema, initial }` is also accepted, for
   * hydration and shared schemas.
   */
  readonly state?: S;
  /** The commands a layout can run. `command` makes one: `command((state) => nextState)` or `command(InputSchema, (input, state) => nextState)`. */
  readonly commands?: (command: Valance.CommandMaker<PageState & StateOf<S>>) => Valance.CommandTable<any, Valance.Ambient>;
}

/** The brand that says a value came from `defineApp`. */
export const APP = Symbol.for("valancex.cli");

export interface DefinedApp extends AppDefinition<any> {
  readonly [APP]: true;
}

/** Declares the application's component tree, state and commands. It starts nothing; the framework runs it. */
export const defineApp = <S extends StateInput = {}>(definition: AppDefinition<S>): DefinedApp => ({ ...definition, [APP]: true }) as unknown as DefinedApp;
