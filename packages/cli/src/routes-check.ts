// The routes `src/main.ts` declares, checked next to the content: an address that is both a page and a route, a route a build has no page to write for. The declarations themselves are checked
// when the definition is loaded (`entry-definition`); these need the content too.
import type { DefinedApp } from "@valancex/common";
import { routeProblems } from "@valancex/common/internal";

import type { Content } from "@valancex/common/internal";
import type { Diagnostic } from "./diagnostics.js";
import { diagnostic } from "./diagnostics.js";
import { ENTRY_FILE } from "./project.js";

/** Mistakes in the declared routes that need the content to see, each a diagnostic about `src/main.ts`. */
export const checkRoutes = (author: DefinedApp | undefined, content: Content | undefined): ReadonlyArray<Diagnostic> => {
  if (author?.routes === undefined || content === undefined) {
    return [];
  }

  return routeProblems(
    author,
    content.pages.map((page) => page.path),
  ).map((problem) => diagnostic(ENTRY_FILE, 1, problem.code, problem.message));
};
