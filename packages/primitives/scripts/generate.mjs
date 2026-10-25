// Writes `@valancex/common`'s `src/primitives.ts` from the specifications and the web's realizations (build the package first).
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { generatePrimitives, generateStylePrimitives, loadSpecifications, loadWeb, root } from "../dist/index.js";

writeFileSync(join(root, "..", "common", "src", "primitives.ts"), generatePrimitives(loadSpecifications(), loadWeb()));
writeFileSync(join(root, "..", "style", "src", "primitives.ts"), generateStylePrimitives(loadSpecifications(), loadWeb()));
