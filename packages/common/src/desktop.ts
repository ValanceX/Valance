// The desktop half, for the generated entry (`.valance/desktop.ts`): run the application as the engine of a native window. An author never imports this. It is what `./client` is to a page: the
// content, the compiled program and the author's definition, run; the window itself is the Desktop PORT's, a separate program that starts this one.
import * as Native from "@valancex/valance/native";
import { init } from "@valancex/mesh-runtime";
import { Effect } from "effect";

import type * as Valance from "@valancex/valance";

import { application, titleFor } from "./app.js";
import type { DefinedApp } from "./index.js";
import type { Content } from "./model.js";
import { routes } from "./routes.js";
import { pageAt } from "./scope.js";

export interface DesktopParts {
  readonly content: Content;
  readonly program: Valance.Program;
  readonly author?: DefinedApp | undefined;
  /** The MESH runtime's module, when the host reads it (the generated entry reads the copy beside the engine). */
  readonly wasm?: Uint8Array | undefined;
}

/** Whether a link's address is one of the application's own pages (it starts with `/`, once). An address anywhere else would need a capability that opens it, which does not exist yet. */
const onSite = (href: string): boolean => href.startsWith("/") && !href.startsWith("//");

/** Runs the application on stdin and stdout until the window closes. */
export const start = async ({ content, program, author, wasm }: DesktopParts): Promise<void> => {
  if (wasm !== undefined) {
    await init(wasm);
  }

  const table = routes(content);

  await Native.run(application(content, program, author), {
    // The window's title follows the page, in the project's format (`valance.json`), or whatever the author's `title` function says.
    titleOf: (state) => titleFor(content, pageAt(content, state.page), state, author),
    // A link is an address, and navigation is the application's own `go` command, as it is for a page.
    onLink: (href, handle) =>
      onSite(href) ? handle.invoke("app/go", [{ value: (table.stateOf(new URL(href, "http://app.invalid/")) as { readonly id: string }).id }] as never) : Effect.void,
  });
};
