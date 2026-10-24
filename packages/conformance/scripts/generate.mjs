// Writes vectors/primitives.vectors.json from the specifications and the web's realizations (decision Q5). The file is committed and a test fails when it is not what this writes.
import { writeFileSync } from "node:fs";
import { loadSpecifications, loadWeb } from "@valancex/primitives";

import { generate } from "../dist/vectors.js";

const file = generate(loadSpecifications(), loadWeb());

writeFileSync(
  new URL("../vectors/primitives.vectors.json", import.meta.url),
  `${JSON.stringify(file, null, 1)}\n`,
);
console.log(
  `vectors/primitives.vectors.json: ${file.vectors.length} vectors for ${new Set(file.vectors.map((each) => each.primitive)).size} primitives`,
);
