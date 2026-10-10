// Loads `src/main.ts` in Node (through Vite, which understands TypeScript) and checks what it exports.
import type { ViteDevServer } from "vite";

import { checkDefinition } from "./app.js";
import { AppError, diagnostic } from "./diagnostics.js";
import type { DefinedApp } from "./index.js";
import { APP } from "./index.js";
import { hasEntry } from "./generate.js";
import { ENTRY_FILE } from "./project.js";

/** The author's definition, or nothing when there is no `src/main.ts`. A mistake in the file is a diagnostic about the file. */
export const loadAuthor = async (server: ViteDevServer, root: string): Promise<DefinedApp | undefined> => {
  if (!hasEntry(root)) { return undefined; }

  let loaded: Record<string, unknown>;

  try {
    loaded = await server.ssrLoadModule(`/${ENTRY_FILE}`);
  } catch (error) {
    const at = (error as { readonly loc?: { readonly line?: number; readonly column?: number } }).loc;

    throw new AppError([diagnostic(ENTRY_FILE, at?.line ?? 0, "entry-load", error instanceof Error ? error.message.split("\n")[0]! : String(error), at?.column ?? 0)]);
  }

  const definition = loaded["default"] as (DefinedApp & { readonly [APP]?: true }) | undefined;

  if (definition === undefined || definition[APP] !== true) { throw new AppError([diagnostic(ENTRY_FILE, 1, "entry-export", `${ENTRY_FILE} must export default defineApp({ … }) from "@valancex/cli"`)]); }

  try {
    checkDefinition(definition);
  } catch (error) {
    throw new AppError([diagnostic(ENTRY_FILE, 1, "entry-definition", error instanceof Error ? error.message.replace(/^src\/main\.ts: /, "") : String(error))]);
  }

  return definition;
};
