// The config schemas have one home, @valancex/cli; the extension ships copies so VS Code can validate valance.json without a network. A test checks they are identical.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("schemas", { recursive: true });

for (const name of ["valance.schema.json", "valance.web.schema.json"]) { copyFileSync(new URL(`../../../packages/cli/schemas/${name}`, import.meta.url), new URL(`../schemas/${name}`, import.meta.url)); }
