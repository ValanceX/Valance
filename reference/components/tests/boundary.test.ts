// "Public seams only" (K1): the scan is clean on this repository, and it is shown failing against each way of reaching past the published entry points.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { scan } from "./boundary.mjs";
import { root } from "./helpers.js";

const tree = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "boundary-"));

  for (const [path, text] of Object.entries({ "package.json": '{ "name": "x", "private": true }', ...files })) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }

  return dir;
};

// (written by concatenation, so that this file does not itself hold an import the scan would find)
const KEYWORD = ["fr", "om"].join("");
const imports = (specifier: string): string => `import x ${KEYWORD} ${JSON.stringify(specifier)};`;

describe("the reference build uses public seams only", () => {
  it("this repository imports only published entry points", () => {
    expect(scan(root, { allowPacks: process.env["ALLOW_LOCAL_PACKS"] === "1" })).toEqual([]);
  });

  it.each([
    ["an internal subpath", { "src/a.ts": imports("@valancex/valance/internal") }, "not an entry point"],
    ["a file of a package's dist", { "src/a.ts": imports("@valancex/common/dist/index.js") }, "private seam"],
    ["a package that is not allowed", { "src/a.ts": imports("left-pad") }, "not a package this repository may import"],
    ["a path into another repository", { "src/a.ts": imports("../../../Valance/packages/valance/src/index.js") }, "leaves the repository"],
    ["a link dependency", { "package.json": '{ "name": "x", "dependencies": { "@valancex/common": "link:../Valance/packages/common" } }' }, "version range from the registry"],
    ["a file dependency", { "package.json": '{ "name": "x", "devDependencies": { "@valancex/cli": "file:../cli.tgz" } }' }, "version range from the registry"],
    ["a workspace link to a package that is not ours", { "package.json": '{ "name": "x", "dependencies": { "@valancex/common": "workspace:*" } }' }, "not a package of this repository"],
    ["an override that is not the registry", { "pnpm-workspace.yaml": 'overrides:\n  "@valancex/cli": link:../Valance/packages/cli\n' }, "not the registry"],
  ])("fails on %s", (_, files, message) => {
    const found = scan(tree(files));

    expect(found.join("\n")).toContain(message);
  });

  it("allows a prerelease pack only when it is said to be one", () => {
    const dir = tree({ "pnpm-workspace.yaml": 'overrides:\n  "@valancex/cli": file:../../local-packs/valancex-cli-0.15.0.tgz\n' });

    expect(scan(dir)).not.toEqual([]);
    expect(scan(dir, { allowPacks: true })).toEqual([]);
  });
});
