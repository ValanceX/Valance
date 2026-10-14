// The desktop half, for the generated entry (`.valance/desktop.ts`): run the application as the engine of a native window. An author never imports this. It is what `./client` is to a page: the
// content, the compiled program and the author's definition, run; the window itself is the Desktop PORT's, a separate program that starts this one.
import * as Native from "@valancex/valance/native";
import { init } from "@valancex/mesh-runtime";
import type { RenderTree } from "@valancex/mesh-runtime";
import { Effect } from "effect";
import { statSync } from "node:fs";
import { resolve, sep } from "node:path";

import type * as Valance from "@valancex/valance";

import { application, titleFor } from "./app.js";
import { Open } from "./open.js";
import { systemOpen } from "./open-system.js";
import { platformOf } from "./platform.js";
import { Store } from "./store.js";
import { fileStore, userDataDir } from "./store-file.js";
import type { DefinedApp } from "./index.js";
import type { Content } from "./model.js";
import { routes } from "./routes.js";
import { pageAt } from "./scope.js";

export interface DesktopParts {
  readonly content: Content;
  readonly program: Valance.Program;
  readonly author?: DefinedApp | undefined;
  /** Where the project's `public/` files are on this machine: an image whose address is a file there is drawn from it. Absent: images are drawn as their descriptions. */
  readonly assets?: string | undefined;
  /** The MESH runtime's module, when the host reads it (the generated entry reads the copy beside the engine). */
  readonly wasm?: Uint8Array | undefined;
}

/** Whether a link's address is one of the application's own pages (it starts with `/`, once). An address anywhere else is the `Open` capability's. */
const onSite = (href: string): boolean => href.startsWith("/") && !href.startsWith("//");

/** Runs the application on stdin and stdout until the window closes. */
/**
 * An image's address as the window can use it. Content says `/logo.png`, an address on the site; the window draws files it is given by absolute path, so an address that names a file under
 * `assets` becomes that file's path, and anything else (an address on the network, a path that leaves `assets`, a file that is not there) is left as it is, and drawn as its description.
 */
export const assetPath = (assets: string, src: string): string | undefined => {
  if (!src.startsWith("/") || src.startsWith("//")) {
    return undefined;
  }

  const file = resolve(assets, `.${decodeURI(src).split("?")[0]!.split("#")[0]!}`);

  return file.startsWith(resolve(assets) + sep) && statSync(file, { throwIfNoEntry: false })?.isFile() === true ? file : undefined;
};

type Node = { readonly type: string; readonly component?: string; readonly props?: Readonly<Record<string, unknown>>; readonly children?: ReadonlyArray<Node> };

/** The tree with each image's address turned into the file it names, where there is one. */
export const withAssets = (tree: RenderTree, assets: string): RenderTree => {
  const walk = (node: Node): Node => {
    if (node.type !== "node") {
      return node;
    }

    const src = node.component === "image" ? node.props?.["src"] : undefined;
    const file = typeof src === "string" ? assetPath(assets, src) : undefined;

    return { ...node, ...(file === undefined ? {} : { props: { ...node.props, src: file } }), children: (node.children ?? []).map(walk) };
  };

  return { ...tree, root: walk(tree.root as unknown as Node) } as unknown as RenderTree;
};

export const start = async ({ content, program, author, wasm, assets }: DesktopParts): Promise<void> => {
  if (wasm !== undefined) {
    await init(wasm);
  }

  const table = routes(content);
  const opener = systemOpen();

  await Native.run(application(content, program, author), {
    // What the desktop supplies: a store, in the user's data directory for the application.
    platform: platformOf([
      [Store, fileStore(userDataDir(content.site.name))],
      [Open, opener],
    ]),
    ...(assets === undefined ? {} : { present: (tree: RenderTree) => withAssets(tree, assets) }),
    // The window's title follows the page, in the project's format (`valance.json`), or whatever the author's `title` function says.
    titleOf: (state) => titleFor(content, pageAt(content, state.page), state, author),
    // A link is an address, and navigation is the application's own `go` command, as it is for a page.
    onLink: (href, handle) =>
      onSite(href)
        ? handle.invoke("app/go", [{ value: (table.stateOf(new URL(href, "http://app.invalid/")) as { readonly id: string }).id }] as never)
        : // an address elsewhere goes to the person's own program for it, when it is one a link may open; anything else is dropped
          opener.open(href).pipe(Effect.catchAll((error) => Effect.sync(() => console.error(`a link was not opened: ${error.message}`)))),
  });
};
