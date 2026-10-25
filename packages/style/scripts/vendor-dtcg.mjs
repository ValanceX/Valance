// Copies the Design Tokens Community Group's 2025.10 JSON Schemas (into `schema/dtcg-2025.10/`, which the package ships: `vlx theme check` validates with them) and format test suite (into
// `test/fixtures/dtcg-2025.10/`), pinned to a commit, so nothing needs the network. The files are the group's, unchanged, under the W3C Software and Document License (NOTICE.md says so). Maintainer's step, run when the pin moves:
//
//   node scripts/vendor-dtcg.mjs <commit>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const commit = process.argv[2];

if (commit === undefined || !/^[0-9a-f]{40}$/.test(commit)) {
  throw new Error("usage: node scripts/vendor-dtcg.mjs <40-hex commit of design-tokens/community-group>");
}

const raw = `https://raw.githubusercontent.com/design-tokens/community-group/${commit}`;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemas = join(root, "schema", "dtcg-2025.10");
const suite = join(root, "test", "fixtures", "dtcg-2025.10");
const get = async (path) => {
  const response = await fetch(`${raw}/${path}`);

  if (!response.ok) {
    throw new Error(`${path}: ${response.status}`);
  }

  return response.text();
};
const save = (base, relative, text) => {
  mkdirSync(dirname(join(base, relative)), { recursive: true });
  writeFileSync(join(base, relative), text);
};

// the schemas, following their $refs
const queue = ["format.json"];
const seen = new Set();

while (queue.length > 0) {
  const name = queue.pop();

  if (seen.has(name)) {
    continue;
  }

  seen.add(name);
  const text = await get(`schemas/src/2025.10/${name}`);

  save(schemas, name, text);

  for (const match of text.matchAll(/"\$ref"\s*:\s*"https:\/\/www\.designtokens\.org\/schemas\/2025\.10\/([^"#]*)/g)) {
    queue.push(match[1]);
  }
}

// the format test suite
const manifest = JSON.parse(await get("test-suite/tests/2025.10/format/manifest.json"));

save(suite, "manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

for (const test of manifest.tests) {
  save(suite, test.input, await get(`test-suite/tests/2025.10/format/${test.input}`));
}

for (const base of [schemas, suite]) {
  save(
    base,
    "NOTICE.md",
    `# Design Tokens Community Group, format 2025.10: schemas and test suite

Copied unchanged from https://github.com/design-tokens/community-group at commit ${commit} (\`schemas/src/2025.10/\` into \`schema/dtcg-2025.10/\`, \`test-suite/tests/2025.10/format/\` into \`test/fixtures/dtcg-2025.10/\`) by \`scripts/vendor-dtcg.mjs\`.
${seen.size} schema files and ${manifest.tests.length} tests.

The files are the group's. They are licensed under the [W3C Software and Document License](https://www.w3.org/Consortium/Legal/2015/copyright-software-and-document), as the repository's LICENSE.md says for its Reports; the format is a Final Community Group Report, not a W3C Standard.
`,
  );
}
console.log(`${seen.size} schemas, ${manifest.tests.length} tests, from ${commit}`);
