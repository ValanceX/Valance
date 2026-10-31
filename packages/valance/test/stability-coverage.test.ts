// Every public entry of every published package names each of its value exports in docs/reference/stability.md, so no export ships without a stability level.
// Value exports (runtime names) are checked. A type-only export is covered by its entry's row ("and their types"), so it is not listed here.
// An `./internal` entry is one Internal row for the whole entry (its names are unstable by design), so its subpath must be named and its names need not be.
// The entries are read from each package.json "exports" (the source file behind each built file), never from internal modules an entry does not re-export.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

// A name counts only inside a backtick span of a table row that names its own entry (the package name for the root entry, the full subpath for another), so a word another entry's
// row already uses (`check`, `run`, `text`) cannot name it. Names are whole identifiers: the pattern relies on JS identifier characters (word characters and `$`), and only `$` needs escaping.
const rowsFor = (page: string, id: string): string => {
  const escape = (text: string): string => text.replace(/[$/.]/g, "\\$&");
  const [scope, name, ...sub] = id.split("/");
  const pkg = `${scope}/${name}`;
  // a subpath is named in full (`@valancex/common/http`) or after its package (`@valancex/cli`'s `./node`); the root entry is the package name not followed by a subpath
  const mentions = sub.length === 0 ? new RegExp(`${escape(pkg)}(?![\\w$/])`) : new RegExp(`${escape(id)}(?![\\w$])|${escape(pkg)}\`'s \`\\./${escape(sub.join("/"))}\``);

  return page
    .split("\n")
    .filter((line) => line.startsWith("|") && mentions.test(line))
    .flatMap((line) => Array.from(line.matchAll(/`([^`]+)`/g), (match) => match[1]!))
    .join("\n");
};
const namedIn = (page: string, id: string, name: string): boolean => new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`).test(rowsFor(page, id));

const stability = readFileSync(root("docs/reference/stability.md"), "utf8");

const published = ["cli", "common", "router", "style", "valance"];

const entries = published.flatMap((dir) => {
  const manifest = JSON.parse(readFileSync(root(`packages/${dir}/package.json`), "utf8")) as { name: string; exports: Record<string, unknown> };

  return Object.entries(manifest.exports).flatMap(([subpath, target]) => {
    const built = (target as { default?: string }).default;
    const source = built?.replace(/^\.\/dist\/(.*)\.js$/, "packages/" + dir + "/src/$1.ts");

    return source !== undefined && existsSync(root(source)) ? [{ id: manifest.name + subpath.slice(1), source }] : [];
  });
});

describe("docs/reference/stability.md names every value export of a published entry", () => {
  it("finds the entries it checks", () => {
    expect(entries.map((entry) => entry.id)).toContain("@valancex/valance");
    expect(entries.length).toBeGreaterThanOrEqual(published.length);
  });

  it("counts a name only in a row for its own entry", () => {
    const page = "| `@valancex/cli`'s `./node` (`check`) | x |\n| `@valancex/valance/web` (`run`) | x |\n| `@valancex/valance` (`define`) | x |";

    expect(namedIn(page, "@valancex/valance", "define")).toBe(true);
    expect(namedIn(page, "@valancex/valance", "run")).toBe(false);
    expect(namedIn(page, "@valancex/valance/web", "run")).toBe(true);
    expect(namedIn(page, "@valancex/valance/web", "check")).toBe(false);
    expect(namedIn(page, "@valancex/cli/node", "check")).toBe(true);
    expect(namedIn(page, "@valancex/cli/node", "define")).toBe(false);
  });

  it.each(entries.filter((entry) => entry.id.endsWith("/internal")).map((entry) => entry.id))("%s is named as Internal", (id) => {
    expect(rowsFor(stability, id)).not.toBe("");
  });

  it.each(entries.filter((entry) => !entry.id.endsWith("/internal")).map((entry) => [entry.id, entry.source] as const))("%s", async (id, source) => {
    const exported = Object.keys(await import(root(source))).filter((name) => name !== "default");

    expect(exported.filter((name) => !namedIn(stability, id, name))).toEqual([]);
  });
});
