// Where the package's data is: the directory that holds `contract/`, `schema/` and `themes/` (one level above `dist/` or `src/`).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Contract } from "./types.js";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export const loadContract = (): Contract => readJson(join(root, "contract", "style-contract-v1.json")) as Contract;

export const loadSchema = (name: string): object => readJson(join(root, "schema", name)) as object;
