// The package's weight is what the application imports: a consumer that takes one thing gets that thing and what it needs, and no plugin, re-export or optional peer it did not name.
// Checked the way a consumer's bundler sees the package: the source is bundled with the peers external, and the output is read.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = (file: string): string => fileURLToPath(new URL(`../src/${file}`, import.meta.url));
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as {
  sideEffects: unknown;
  exports: Record<string, unknown>;
  peerDependencies: Record<string, string>;
  peerDependenciesMeta: Record<string, { optional?: boolean }>;
};

/** What a consumer who writes `import { <names> } from "<file>"` and uses each name ships, with every package except Valance's own source left external. */
const shipped = async (file: string, names: ReadonlyArray<string>): Promise<{ code: string; imports: ReadonlyArray<string> }> => {
  const result = await build({
    stdin: { contents: `import { ${names.join(", ")} } from ${JSON.stringify(src(file))}; globalThis.used = [${names.join(", ")}];`, resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "ts" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    treeShaking: true,
    minifySyntax: false,
    // The substrate packages are left out of the bundle and taken at their word: each declares `sideEffects: false` (checked below), so an import nothing uses is dropped.
    plugins: [{ name: "substrate", setup: (api) => { api.onResolve({ filter: /^(effect|@valancex\/)/ }, (args) => ({ path: args.path, external: true, sideEffects: false })); } }],
    logLevel: "silent",
  });
  const code = result.outputFiles[0]!.text;

  return { code, imports: Array.from(code.matchAll(/^import .*? from "([^"]+)"/gm), (match) => match[1]!) };
};

describe("the package declares that importing it does nothing", () => {
  it("is marked side-effect free, and no entry registers anything on import", () => {
    expect(manifest.sideEffects).toBe(false);
  });

  it("keeps the required peers to the substrate; every other peer (PORT Web now, a plugin's package later) is optional", () => {
    const required = Object.keys(manifest.peerDependencies).filter((name) => manifest.peerDependenciesMeta[name]?.optional !== true).sort();

    expect(required).toEqual(["@valancex/mesh-runtime", "effect"]);
  });

  it("exposes each concern as its own entry, so an entry's weight is its own", () => {
    expect(Object.keys(manifest.exports)).toEqual([".", "./web", "./web/server", "./web/plugin", "./web/build", "./internal", "./package.json"]);
  });
});

describe("the substrate keeps the promise those tests rely on", () => {
  const sideEffects = (name: string): unknown => (JSON.parse(readFileSync(fileURLToPath(new URL(`../node_modules/${name}/package.json`, import.meta.url)), "utf8")) as { sideEffects?: unknown }).sideEffects;

  it.each(["effect", "@valancex/mesh-runtime", "@valancex/port-web"])("%s declares that importing it does nothing", (name) => {
    expect(sideEffects(name) === false || (Array.isArray(sideEffects(name)) && (sideEffects(name) as Array<unknown>).length === 0)).toBe(true);
  });

  // NEXUS 0.12.0 and 0.12.1 do not; 0.12.2 (prepared) does. Until a release carries it, an entry that imports NEXUS keeps it in a consumer's bundle even when it uses none.
  // Goes red when the installed NEXUS declares it: remove the marker then.
  it.fails("@valancex/nexus declares that importing it does nothing", () => {
    expect(sideEffects("@valancex/nexus")).toBe(false);
  });
});

describe("a consumer ships what it names", () => {
  it("the core alone names no PORT package and none of the Web entries' code", async () => {
    const { code, imports } = await shipped("index.ts", ["define"]);

    expect(imports.filter((name) => name.includes("port"))).toEqual([]);
    expect(code).not.toContain("history synchronization failed");
    expect(code).not.toContain("data-valance-head");
  });

  it("the plugin entry's `renderHead` brings the head and nothing of history, the Web target or PORT", async () => {
    const { code, imports } = await shipped("web-plugin.ts", ["renderHead"]);

    expect(code).toContain("data-valance-head");
    expect(code).not.toContain("compose");                                               // composition is not shipped to a page that only writes a head
    expect(code).not.toContain("history synchronization failed");
    expect(imports.filter((name) => name.includes("port"))).toEqual([]);
    expect(imports.filter((name) => name.includes("nexus"))).toEqual([]);                  // nor the NEXUS the platform merge needs
  });

  it("`staticPaths` is a few lines, with no head, no composition, no platform", async () => {
    const { code } = await shipped("web-plugin.ts", ["staticPaths"]);

    expect(code).not.toContain("data-valance-head");
    expect(code).not.toContain("plugin-conflict");
    expect(code).not.toContain("Environment");
  });

  it("the Web entry's `link` is the one primitive, not `history`, `run` or the plugin machinery", async () => {
    const { code } = await shipped("web.ts", ["link"]);

    expect(code).not.toContain("history synchronization failed");
    expect(code).not.toContain("plugin-conflict");
    expect(code).not.toContain("data-valance-head");
  });

  it("the Web entry's `history` brings the head it applies, and not `run`'s composition", async () => {
    const { code } = await shipped("web.ts", ["history"]);

    expect(code).toContain("data-valance-head");
    expect(code).not.toContain("plugin-conflict");
  });

  it("the server entry does not ship the browser's history, and the manifest does not ship the server", async () => {
    const server = await shipped("web-server.ts", ["renderToHtml"]);
    const built = await shipped("web-manifest.ts", ["manifest"]);

    expect(server.code).not.toContain("popstate");
    expect(built.code).not.toContain("realizeHtml");
  });
});
