// `vlx check`: every stage that can find a mistake in authored files, without bundling or writing a site. It reports all of them at once, in the one diagnostic shape, so an editor
// or a CI job can read the result (`--json`) as easily as a person reads the terminal.
import type { Diagnostic } from "./diagnostics.js";
import { AppError } from "./diagnostics.js";
import { loadAuthor } from "./author.js";
import { loadConfig } from "./config.js";
import { librariesOf } from "./libraries.js";
import { generateContent, generateEntries, generateProgram } from "./emit.js";
import { createLoader } from "./vite.js";

export interface Checked {
  readonly diagnostics: ReadonlyArray<Diagnostic>;
  readonly pages: number;
  readonly components: ReadonlyArray<string>;
}

const collect = async <T>(into: Array<Diagnostic>, work: () => Promise<T> | T): Promise<T | undefined> => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AppError) {
      into.push(...error.diagnostics);
      return undefined;
    }

    throw error;
  }
};

/** Checks the project at `root`. Never throws for a mistake in the project: that is what the result is for. */
export const check = async (root: string): Promise<Checked> => {
  const problems: Array<Diagnostic> = [];
  const config = await collect(problems, () => loadConfig(root));

  if (config === undefined) {
    return { diagnostics: problems, pages: 0, components: [] };
  }

  // a library whose marker is wrong is reported first: when the application cannot even be loaded, it is the likely reason (a package the build does not process)
  problems.push(...librariesOf(root).problems);
  generateEntries(root, config);

  const content = await collect(problems, () => generateContent(root, config));
  const server = await createLoader(root, config);

  try {
    const author = await collect(problems, () => loadAuthor(server, root));
    const failedAuthor = problems.some((each) => each.file === "src/main.ts");
    const components = failedAuthor ? undefined : await collect(problems, () => generateProgram(root, author, config));

    // (the templates stage reports the same marker problems; once is enough)
    const once = problems.filter((each, index) => problems.findIndex((other) => other.file === each.file && other.code === each.code && other.message === each.message) === index);

    return { diagnostics: once, pages: content?.pages.length ?? 0, components: components ?? [] };
  } finally {
    await server.close();
  }
};
