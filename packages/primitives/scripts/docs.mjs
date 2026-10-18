// Writes docs/use/primitives.md from the specifications and the web's realizations (build the package first).
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { generateDocs, loadSpecifications, loadWeb, root } from "../dist/index.js";

writeFileSync(join(root, "..", "..", "docs", "use", "primitives.md"), generateDocs(loadSpecifications(), loadWeb()));
