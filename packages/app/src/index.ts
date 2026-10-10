// The author's side of the application model: what `src/main.ts` may export. It is optional. An application with no `src/main.ts` has the page-per-Markdown-file behaviour and nothing else;
// `defineApp` adds what only code can say: state of the application's own, and the commands that change it. A layout reads the state's fields by name and runs the commands by name.
//
//   export default defineApp({
//     state: { schema: Schema.Struct({ theme: Schema.Literal("light", "dark") }), initial: { theme: "light" } },
//     commands: (command) => ({ toggleTheme: command((s) => ({ ...s, theme: s.theme === "light" ? "dark" : "light" })) }),
//   });
import type * as Valance from "@valancex/valance";
import { Schema } from "effect";

export { Schema };

/** The part of the application's state the framework owns: which page is shown. A command's `state` always has it. */
export interface PageState { readonly page: string }

export interface AppDefinition<F extends Schema.Struct.Fields = {}> {
  /** Application state beyond the page. `schema` must be a `Schema.Struct`; its fields become names a layout can read. */
  readonly state?: { readonly schema: Schema.Struct<F>; readonly initial: Schema.Struct.Type<F> };
  /** The commands a layout can run. `command` makes one: `command((state) => nextState)` or `command(InputSchema, (input, state) => nextState)`. */
  readonly commands?: (command: Valance.CommandMaker<PageState & Schema.Struct.Type<F>>) => Valance.CommandTable<any, Valance.Ambient>;
}

/** The brand that says a value came from `defineApp`. */
export const APP = Symbol.for("valancex.app");

export interface DefinedApp extends AppDefinition<any> { readonly [APP]: true }

/** Declares the application's own state and commands. It starts nothing; the framework runs it. */
export const defineApp = <F extends Schema.Struct.Fields = {}>(definition: AppDefinition<F>): DefinedApp => ({ ...definition, [APP]: true } as unknown as unknown as DefinedApp);
