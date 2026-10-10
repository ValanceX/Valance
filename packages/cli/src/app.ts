// The application the framework assembles from the three things an author supplies: the content (built from `content/`), the program (built from the templates), and optionally
// `defineApp`'s state and commands. This is one Valance application (`Valance.define`): the page is its state, going to a page is its `go` command, and the layout is its one view.
// The server renders it and the browser runs it, from the same function.
import * as Valance from "@valancex/valance";
import type { Plugin } from "@valancex/valance/web/plugin";
import { Schema } from "effect";

import type { DefinedApp, PageState } from "./index.js";
import type { Content } from "./model.js";
import { documentTitle, frame, FrameScope, pageAt, RESERVED } from "./scope.js";
import { primitives } from "./primitives.js";
import { normalize, routes } from "./routes.js";

export type AppState = PageState & Record<string, unknown>;

/** What the browser needs to know about the built page to keep the document's head in step. */
export interface Built {
  /** The address of the page script. */
  readonly script: string;
  /** Stylesheet addresses, in order. Empty in development, where the script brings its styles. */
  readonly styles: ReadonlyArray<string>;
}

const PageSchema = Schema.Struct({ page: Schema.String });

/** A mistake in `src/main.ts`, reported with what to change. */
export class AppDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppDefinitionError";
  }
}

const authorFields = (author: DefinedApp | undefined): ReadonlyArray<string> => author?.state === undefined ? [] : Object.keys(author.state.schema.fields);

/** Checks the author's definition against the names the framework owns. */
export const checkDefinition = (author: DefinedApp | undefined): void => {
  for (const name of authorFields(author)) {
    if (RESERVED.includes(name)) { throw new AppDefinitionError(`src/main.ts: the state field "${name}" is a name the layout already reads from the framework (${RESERVED.join(", ")}); choose another`); }
    if (name === "page") { throw new AppDefinitionError('src/main.ts: the state field "page" is the framework\'s (which page is shown); choose another'); }
  }

  // Building the table reads no state (a command reads it when it runs), so it can be built here, with nothing, to see its names.
  if ("go" in (author?.commands?.(Valance.command({} as never) as never) ?? {})) { throw new AppDefinitionError('src/main.ts: "go" is the framework\'s command (it shows a page); choose another name'); }
};

/** The scope schema a layout is compiled against: the framework's names and the author's state fields. */
export const scopeSchema = (author: DefinedApp | undefined): Schema.Schema<any, any, never> =>
  author?.state === undefined ? FrameScope : (Schema.extend(FrameScope, author.state.schema) as unknown as Schema.Schema<any, any, never>);

export const stateSchema = (author: DefinedApp | undefined): Schema.Schema<any, any, never> =>
  author?.state === undefined ? PageSchema : (Schema.extend(PageSchema, author.state.schema) as unknown as Schema.Schema<any, any, never>);

/** The command table: the framework's `go`, then the author's. */
export const commandTable = (author: DefinedApp | undefined) => (state: Parameters<typeof Valance.command>[0]): Valance.CommandTable<any, Valance.Ambient> => {
  const command = Valance.command(state as never) as Valance.CommandMaker<AppState>;
  const own = author?.commands?.(command as never) ?? {};

  if ("go" in own) { throw new AppDefinitionError('src/main.ts: "go" is the framework\'s command (it shows a page); choose another name'); }

  return { go: command(Schema.Struct({ id: Schema.String }), ({ id }, current) => ({ ...current, page: id })), ...own };
};

export const initialState = (author: DefinedApp | undefined): AppState => ({ page: "/", ...((author?.state?.initial ?? {}) as Record<string, unknown>) });

export const application = (content: Content, program: Valance.Program, author?: DefinedApp) => {
  checkDefinition(author);

  return Valance.define({
    name: content.site.name,
    state: { schema: stateSchema(author) as Schema.Schema<AppState>, initial: initialState(author) },
    views: {
      layout: {
        program,
        scope: (state: AppState) => {
          const { page, ...own } = state;

          return { ...frame(content, page), ...own };
        },
      },
    },
    view: () => "layout" as const,
    commands: commandTable(author) as never,
  });
};

/** The state a request for `pathname` starts from. */
export const stateFor = (content: Content, pathname: string, author?: DefinedApp): AppState => ({ ...initialState(author), page: normalize(pathname, content.site.base) });

/** The plugin that makes the application a website: its tags, its URL policy, and its document head. */
export const plugin = (content: Content, built: Built): Plugin<AppState> => ({
  name: "valance-app",
  primitives,
  routes: routes(content) as never,
  head: (state) => {
    const page = pageAt(content, state.page);
    const shown = page ?? { description: "" };
    const canonical = content.site.url === "" || page === undefined ? [] : [{ rel: "canonical", href: `${content.site.url}${content.site.base}${page.path.replace(/^\//, "")}` }];

    return {
      title: documentTitle(content, page),
      meta: shown.description === "" ? [] : [{ name: "description", content: shown.description }],
      links: [...built.styles.map((href) => ({ rel: "stylesheet", href })), ...canonical],
    };
  },
});
