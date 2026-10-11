/// <reference path="../types/mprx.d.ts" preserve="true" />
// The author's side of the application model: what `src/main.ts` may export. It is optional. An application with no `src/main.ts` has the page-per-Markdown-file behaviour and nothing else;
// `defineApp` adds what only code can say: state of the application's own, and the commands that change it. A layout reads the state's fields by name and runs the commands by name.
//
//   import layout from "./layout.mprx";
//   import themeToggle from "./theme-toggle.mprx";
//
//   export default defineApp({
//     layout: component(layout, { uses: [component(themeToggle, { props: ["theme"], events: ["toggle"] })] }),
//     state: { schema: Schema.Struct({ theme: Schema.Literal("light", "dark") }), initial: { theme: "light" } },
//     commands: (command) => ({ toggleTheme: command((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" })) }),
//   });
import type * as Valance from "@valancex/valance";
import { Schema } from "effect";

export { Schema };

/** The part of the application's state the framework owns: which page is shown. A command's `state` always has it. */
export interface PageState { readonly page: string }

/** What `import layout from "./layout.mprx"` gives you: a template file. It has no behaviour of its own; `component` says how it fits into the application. */
export interface Template { readonly mprx: string }

/** One node of the component tree: a template, what it takes (`props`), what it raises (`events`), and the components its template uses. */
export interface Component {
  readonly [COMPONENT]: true;
  readonly template: Template;
  readonly props: ReadonlyArray<string>;
  readonly events: ReadonlyArray<string>;
  readonly uses: ReadonlyArray<Component>;
}

export interface ComponentOptions {
  /** The names its template reads from whoever uses it. Checked against the template: a prop that is read but not listed, or listed but never read, is an error. */
  readonly props?: ReadonlyArray<string>;
  /** The names its template raises (`on.toggle={…}` in a user). Checked the same way. */
  readonly events?: ReadonlyArray<string>;
  /** The components its template uses, and only those: using a tag that is not listed is an error, and so is listing one the template never uses. */
  readonly uses?: ReadonlyArray<Component | Template>;
}

export const COMPONENT = Symbol.for("valancex.cli.component");

const asComponent = (given: Component | Template): Component => COMPONENT in given ? given : component(given as Template);

/** Declares a component of the application: the template, its props and events, and the components it uses. The application is the tree of these, from `layout` down. */
export function component(template: Template, options: ComponentOptions = {}): Component {
  return { [COMPONENT]: true, template, props: options.props ?? [], events: options.events ?? [], uses: (options.uses ?? []).map(asComponent) };
}

export { asComponent };

export interface AppDefinition<F extends Schema.Struct.Fields = {}> {
  /** The page's shell, and under it every component of the application. Omit it to use the built-in layout. Its template must be named `layout.mprx`. */
  readonly layout?: Component | Template;
  /** Built-in components (`heading`, `runs`, …) you replace with your own template of the same name. */
  readonly override?: ReadonlyArray<Component | Template>;
  /** Application state beyond the page. `schema` must be a `Schema.Struct`; its fields become names a layout can read. */
  readonly state?: { readonly schema: Schema.Struct<F>; readonly initial: Schema.Struct.Type<F> };
  /** The commands a layout can run. `command` makes one: `command((state) => nextState)` or `command(InputSchema, (input, state) => nextState)`. */
  readonly commands?: (command: Valance.CommandMaker<PageState & Schema.Struct.Type<F>>) => Valance.CommandTable<any, Valance.Ambient>;
}

/** The brand that says a value came from `defineApp`. */
export const APP = Symbol.for("valancex.cli");

export interface DefinedApp extends AppDefinition<any> { readonly [APP]: true }

/** Declares the application's own state and commands. It starts nothing; the framework runs it. */
export const defineApp = <F extends Schema.Struct.Fields = {}>(definition: AppDefinition<F>): DefinedApp => ({ ...definition, [APP]: true } as unknown as unknown as DefinedApp);
