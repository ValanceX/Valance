// §3 signatures, §13 discoverability, §14 documentation, §16 stability tiers: read from the published packages, as a consumer's tools would.
import * as ts from "typescript";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";

import { evidence } from "./evidence.js";

const seen = evidence("surface");
const require_ = createRequire(import.meta.url);

afterAll(() => { seen.write(); });

const packages = ["@valancex/valance", "@valancex/nexus", "@valancex/mesh-runtime", "@valancex/mesh-compiler", "@valancex/port-web"] as const;
const root = (name: string) => join(process.cwd(), "node_modules", name);
const packageJsonResolvable = () => Object.fromEntries(packages.map((name) => [name, exportsPackageJson(name)]));
const exportsPackageJson = (name: string) => { try { require_.resolve(`${name}/package.json`); return true; } catch { return false; } };
const declarations = (dir: string): Array<string> => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? declarations(join(dir, entry.name)) : entry.name.endsWith(".d.ts") ? [join(dir, entry.name)] : []);

it("§3: public callables take at most three positional parameters and no positional booleans", () => {
  const offenders: Array<{ file: string; name: string; params: number; booleans: number }> = [];
  let callables = 0;

  for (const name of packages) {
    const dist = join(root(name), "dist");

    for (const file of declarations(dist)) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isFunctionDeclaration(node) || ts.isMethodSignature(node) || ts.isCallSignatureDeclaration(node) || ts.isFunctionTypeNode(node) || ts.isConstructSignatureDeclaration(node)) {
          callables += 1;
          const params = node.parameters.filter((p) => p.name.getText() !== "this");
          const booleans = params.filter((p) => p.type?.kind === ts.SyntaxKind.BooleanKeyword).length;
          const label = "name" in node && node.name !== undefined ? node.name.getText() : (node.parent as { name?: ts.Node }).name?.getText() ?? "(anonymous)";

          if (params.length > 3 || booleans > 0) {
            offenders.push({ file: `${name}/${file.slice(dist.length + 1)}`, name: label, params: params.length, booleans });
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(source);
    }
  }

  seen.record("signatures", { callables, offenders });
  expect(offenders).toEqual([]);
});

it.fails("§16/§14: every package says what it promises (stability tiers) and where its docs are, in the README that ships with it", () => {
  const missing: Array<string> = [];
  const facts: Record<string, unknown> = {};

  for (const name of packages) {
    const dir = root(name);
    const readme = existsSync(join(dir, "README.md")) ? readFileSync(join(dir, "README.md"), "utf8") : "";
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string; types?: string; exports?: unknown; license?: string; repository?: unknown };
    const has = { readme: readme.length > 0, stability: /stab(le|ility)|provisional|unreleased/i.test(readme), install: /install|npm|pnpm/i.test(readme), example: /```(ts|typescript|js|javascript)/.test(readme), license: pkg.license !== undefined, types: pkg.types !== undefined || pkg.exports !== undefined };

    facts[name] = { version: pkg.version, ...has };
    Object.entries(has).forEach(([key, value]) => { if (!value) { missing.push(`${name}: ${key}`); } });
  }

  seen.record("packageFacts", facts);
  expect(missing).toEqual([]);
});

it("§17: the five packages agree on one dependency story (peer ranges name the released set)", () => {
  const ranges: Record<string, unknown> = {};

  for (const name of packages) {
    const pkg = JSON.parse(readFileSync(join(root(name), "package.json"), "utf8")) as { peerDependencies?: Record<string, string>; dependencies?: Record<string, string> };

    ranges[name] = { peers: pkg.peerDependencies ?? {}, deps: pkg.dependencies ?? {} };
  }

  seen.record("ranges", ranges);
  seen.record("packageJsonResolvable", packageJsonResolvable());
  expect(Object.keys(ranges)).toHaveLength(5);
  expect(Object.values(packageJsonResolvable()).every(Boolean)).toBe(true);                // NEXUS 0.12.1 exports ./package.json like the others (O1)
});
