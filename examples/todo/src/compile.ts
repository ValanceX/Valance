// Build time, in Node: the screens, compiled against the vocabulary. A program is data; a target draws it.
import { compileProgram } from "@valancex/mesh-compiler";
import { readFileSync } from "node:fs";

import type { Programs } from "./app.js";
import { manifest, SCREENS } from "./vocabulary.js";

export const compilePrograms = async (screens: URL = new URL("./screens/", import.meta.url)): Promise<Programs> => {
  const read = (name: string): string => readFileSync(new URL(`${name}.mprx`, screens), "utf8");

  const entries = await Promise.all(
    SCREENS.map(async (screen) => {
      const result = await compileProgram({
        model: { manifest: JSON.stringify(manifest), path: "vocabulary.ts" },
        root: screen,
        components: [{ component: screen, source: read(screen), path: `${screen}.mprx` }],
      });

      if (result.program === undefined) {
        throw new Error(`${screen} does not compile: ${JSON.stringify(result.assembly ?? result.components)}`);
      }

      return [screen, result.program] as const;
    }),
  );

  return Object.fromEntries(entries) as unknown as Programs;
};
