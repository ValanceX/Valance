// Every public entry of every published package names each of its value exports in docs/stability.md, so no export ships without a tier.
// Value exports (runtime names) are checked. A type-only export is covered by its entry's row ("and their types"), so it is not listed here.
// An `./internal` entry is one Internal row for the whole entry (its names are unstable by design), so its subpath must be named and its names need not be.
// The entries are read from each package.json "exports" (the source file behind each built file), never from internal modules an entry does not re-export.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = (path: string): string => fileURLToPath(new URL(`../../../${path}`, import.meta.url));

// Names are matched inside backtick spans of the page, as whole identifiers, so prose ("text", "list") does not count as naming `text`.
const spans = Array.from(readFileSync(root("docs/stability.md"), "utf8").matchAll(/`([^`]+)`/g), (match) => match[1]!).join("\n");
const named = (name: string): boolean => new RegExp(`(?<![\\w$])${name.replace(/\$/g, "\\$")}(?![\\w$])`).test(spans);

const published = ["cli", "common", "router", "style", "valance"];

const entries = published.flatMap((dir) => {
  const manifest = JSON.parse(readFileSync(root(`packages/${dir}/package.json`), "utf8")) as { name: string; exports: Record<string, unknown> };

  return Object.entries(manifest.exports).flatMap(([subpath, target]) => {
    const built = (target as { default?: string }).default;
    const source = built?.replace(/^\.\/dist\/(.*)\.js$/, "packages/" + dir + "/src/$1.ts");

    return source !== undefined && existsSync(root(source)) ? [{ id: manifest.name + subpath.slice(1), source }] : [];
  });
});

describe("docs/stability.md names every value export of a published entry", () => {
  it("finds the entries it checks", () => {
    expect(entries.map((entry) => entry.id)).toContain("@valancex/valance");
    expect(entries.length).toBeGreaterThanOrEqual(published.length);
  });

  it.each(entries.filter((entry) => entry.id.endsWith("/internal")).map((entry) => entry.id))("%s is named as Internal", (id) => {
    expect(readFileSync(root("docs/stability.md"), "utf8")).toContain(id);
  });

  it.each(entries.filter((entry) => !entry.id.endsWith("/internal")).map((entry) => [entry.id, entry.source] as const))("%s", async (_id, source) => {
    const exported = Object.keys(await import(root(source))).filter((name) => name !== "default");

    expect(exported.filter((name) => !named(name))).toEqual([]);
  });
});
