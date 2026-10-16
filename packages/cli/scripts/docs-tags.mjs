// Rewrites the tag reference in README.md from the vocabularies (run `pnpm docs:tags` after building). `test/tags.test.ts` fails when the two differ.
import { readFileSync, writeFileSync } from "node:fs";

import { TAGS_BEGIN, TAGS_END, tagReference } from "../dist/tags.js";

const file = new URL("../README.md", import.meta.url);
const text = readFileSync(file, "utf8");
const from = text.indexOf(TAGS_BEGIN);
const to = text.indexOf(TAGS_END);

if (from < 0 || to < from) {
  throw new Error("README.md has no tag reference markers");
}

writeFileSync(file, `${text.slice(0, from)}${TAGS_BEGIN}\n\n${tagReference()}\n\n${text.slice(to)}`);
