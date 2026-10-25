// Reads the specifications and the realizations from the package's own directories. They are data files beside the code, read when the tooling starts (this package is for the build and its tests,
// never for the bundle an application ships).
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Specification, WebRealizations } from "./types.js";

/** The package's root: the directory that holds `specs/`, `realizations/` and `schema/` (one level above `dist/` or `src/`). */
export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const json = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** Every specification, by name, in name order. */
export const loadSpecifications = (directory: string = join(root, "specs")): Readonly<Record<string, Specification>> =>
  Object.fromEntries(
    readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => {
        const specification = json(join(directory, file)) as Specification;

        if (`${specification.name}.json` !== file) {
          throw new Error(`specs/${file} specifies "${specification.name}": a file is named for its primitive`);
        }

        return [specification.name, specification] as const;
      }),
  );

/** The web's realization of the specifications. */
export const loadWeb = (path: string = join(root, "realizations", "web.json")): WebRealizations => json(path) as WebRealizations;

/** A JSON Schema of this package, by file name. */
export const loadSchema = (name: string): unknown => json(join(root, "schema", name));
