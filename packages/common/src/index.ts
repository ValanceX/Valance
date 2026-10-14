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
import { Schema } from "effect";

import type { Interceptor } from "./transport.js";

/** The part of the application's state the framework owns: which page is shown. A command's `state` always has it. */
export interface PageState {
  readonly page: string;
  /** How much room the page has: `compact` (under 600 px wide: a phone), `medium` (600 to 839) or `expanded` (840 and up). The framework keeps it current as the window changes; a layout reads it as `viewport`. */
  readonly viewport: Viewport;
}

/** Window size classes, the ones Material Design and iOS size classes agree on closely enough to design for. */
export type Viewport = "compact" | "medium" | "expanded";

// ---- state -------------------------------------------------------------------------------------------------------------------------------------------------

export const FIELD = Symbol.for("valancex.common.field");

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
  readonly props?: Readonly<Record<string, Schema.Schema<any, any, never>>>;
  readonly events?: Readonly<Record<string, Schema.Schema<any, any, never>>>;
}

export interface Contract<P extends string, E extends string> {
  /**
   * The inputs the template reads, each with its type. Optional when the schema admits `undefined`. A prop has no default: the model has none. With neither `props` nor `events` the contract is
   * inferred; with either, the interface is exactly what is written (an omitted side is none).
   */
  readonly props?: { readonly [K in P]: Schema.Schema<any, any, never> };
  /** The events the template raises, each with its payload's schema; `Schema.Void` is no payload. */
  readonly events?: { readonly [K in E]: Schema.Schema<any, any, never> };
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
  };
}

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
   * Values worked out from the state, for a template to read: `derived: (derive) => ({ open: derive(Schema.Number, (state) => state.items.filter((item) => !item.done).length) })`. Each has its
   * type, as a state field does. They are computed from the state each time it changes, on every target, and a command cannot change one (change the state they come from). The function must
   * be pure and must not throw.
   */
  readonly derived?: (derive: DeriveMaker<PageState & StateOf<S>>) => { readonly [name: string]: Derived<any> };
  /** The commands a layout can run. `command` makes one: `command((state) => nextState)` or `command(InputSchema, (input, state) => nextState)`. */
  readonly commands?: (command: Valance.CommandMaker<PageState & StateOf<S>>) => Valance.CommandTable<any, Valance.Ambient>;
}

/** The brand that says a value came from `defineApp`. */
export const APP = Symbol.for("valancex.common");

export interface DefinedApp extends AppDefinition<any> {
  readonly [APP]: true;
}

/** Declares the application's component tree, state and commands. It starts nothing; the framework runs it. */
/** What `derived` makes, for the toolchain: the function is called with the one `derive`. */
export const derivedOf = (author: { readonly derived?: AppDefinition<any>["derived"] } | undefined): Readonly<Record<string, Derived<any>>> => author?.derived?.(derive) ?? {};

export const defineApp = <S extends StateInput = {}>(definition: AppDefinition<S>): DefinedApp => ({ ...definition, [APP]: true }) as unknown as DefinedApp;
