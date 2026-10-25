// The author's side of a library (Bet 12; K7, K13): `vlx init library` makes a workspace; `vlx library build` and `vlx library check` work on it. The workspace here is what the command writes, with
// the dependencies linked the way a package manager's workspace links them (the library has its own node_modules for its peers; the playground reaches the library through the workspace).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { buildLibrary, checkLibrary, planLibrary, scaffoldLibrary } from "../src/library.js";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const COMMON = fileURLToPath(new URL("../../common", import.meta.url));
const ROUTER = realpathSync(fileURLToPath(new URL("../../common/node_modules/@valancex/router", import.meta.url)));
const EFFECT = realpathSync(join(PACKAGE, "node_modules", "effect"));
const TYPESCRIPT = realpathSync(join(PACKAGE, "node_modules", "typescript"));
const TYPES_NODE = realpathSync(join(PACKAGE, "node_modules", "@types", "node"));
const made: Array<string> = [];

afterEach(() => made.splice(0).forEach((each) => rmSync(each, { recursive: true, force: true })));

const link = (target: string, at: string): void => {
  mkdirSync(dirname(at), { recursive: true });
  symlinkSync(target, at, "dir");
};

/** A workspace as `vlx init library acme-ui` writes it, with its dependencies linked in. */
const workspace = (name = "acme-ui"): { readonly dir: string; readonly lib: string; readonly app: string } => {
  const dir = mkdtempSync(join(tmpdir(), "vlx-library-"));

  made.push(dir);
  scaffoldLibrary({ name, dir, packageManager: "pnpm", cli: "link:../../cli" });

  const lib = join(dir, "packages", name.replace(/^@[^/]+\//, ""));
  const app = join(dir, "playground");

  for (const root of [lib, app]) {
    link(COMMON, join(root, "node_modules", "@valancex", "common"));
    link(PACKAGE, join(root, "node_modules", "@valancex", "cli"));
    link(ROUTER, join(root, "node_modules", "@valancex", "router"));
    link(EFFECT, join(root, "node_modules", "effect"));
    link(TYPESCRIPT, join(root, "node_modules", "typescript"));
    link(TYPES_NODE, join(root, "node_modules", "@types", "node"));
  }

  link(lib, join(app, "node_modules", ...name.split("/")));

  return { dir, lib, app };
};

const edit = (file: string, change: (text: string) => string): void => writeFileSync(file, change(readFileSync(file, "utf8")));
const codes = (found: ReadonlyArray<{ readonly code: string }>): string[] => found.map((each) => each.code);

describe("vlx init library", () => {
  it("writes a workspace: the marked package, a playground that depends on it, and nothing else to configure", () => {
    const files = [...planLibrary({ name: "@acme/ui", dir: "/x/ui", packageManager: "npm" }).keys()];

    expect(files).toEqual(
      expect.arrayContaining([
        "package.json",
        "packages/ui/package.json",
        "packages/ui/src/index.ts",
        "packages/ui/src/greeting.mprx",
        "playground/src/main.ts",
        "playground/valance.desktop.json",
      ]),
    );

    const pkg = JSON.parse(planLibrary({ name: "@acme/ui", dir: "/x/ui", packageManager: "npm" }).get("packages/ui/package.json")!) as Record<string, any>;

    expect(pkg["exports"]["."]).toEqual({ types: "./dist/index.d.ts", valance: "./dist/index.js" });
    expect(pkg["sideEffects"]).toEqual(["**/*.css"]);
    expect(pkg["valance"]).toEqual({ kind: "components", targets: ["web", "desktop"] });
    expect(Object.keys(pkg["peerDependencies"])).toContain("@valancex/common");

    // the workspace root has no `vlx` of its own: its scripts go through the scripts of the packages that do
    const root = JSON.parse(planLibrary({ name: "acme-ui", dir: "/x/ui", packageManager: "pnpm" }).get("package.json")!) as { scripts: Record<string, string> };

    expect(root.scripts).toEqual({ "build:library": "cd packages/acme-ui && pnpm build", "check:library": "cd packages/acme-ui && pnpm check", playground: "cd playground && pnpm dev" });

    // pnpm 11 stops an install on a dependency's build script nobody approved; esbuild's is optional, so the workspace says so
    expect(planLibrary({ name: "acme-ui", dir: "/x/ui", packageManager: "pnpm" }).get("pnpm-workspace.yaml")).toContain("allowBuilds:\n  esbuild: false");
  });

  it("refuses a directory that has something in it", () => {
    const dir = mkdtempSync(join(tmpdir(), "vlx-library-"));

    made.push(dir);
    writeFileSync(join(dir, "x"), "");

    expect(() => scaffoldLibrary({ name: "acme-ui", dir, packageManager: "npm" })).toThrow(/not empty/);
  });
});

describe("vlx library build and check", () => {
  it("build writes dist/ (JavaScript, declarations, the template as source); check passes, on both targets", { timeout: 180_000 }, async () => {
    const { lib } = workspace();

    expect(await checkLibrary(lib)).toSatisfy((found: ReadonlyArray<{ readonly code: string }>) => codes(found).includes("library-entry"));

    const built = buildLibrary(lib);

    expect(built.diagnostics).toEqual([]);
    expect(built.copied).toEqual(["greeting.mprx"]);
    expect(existsSync(join(lib, "dist", "index.js"))).toBe(true);
    expect(readFileSync(join(lib, "dist", "index.d.ts"), "utf8")).toContain("greeting");
    expect(readFileSync(join(lib, "dist", "greeting.mprx"), "utf8")).toContain("<heading>");
    // the compiled entry still imports the template as a file: the consumer's build compiles it
    expect(readFileSync(join(lib, "dist", "greeting.js"), "utf8")).toContain('./greeting.mprx"');
    expect(await checkLibrary(lib)).toEqual([]);

    // a file left in dist/ by an earlier build (a component renamed or removed) is not shipped by this one
    writeFileSync(join(lib, "dist", "removed.mprx"), "<column></column>\n");
    expect(buildLibrary(lib).diagnostics).toEqual([]);
    expect(existsSync(join(lib, "dist", "removed.mprx"))).toBe(false);
  });

  it("is found when a package is not marked, or offers a way around the marker", { timeout: 180_000 }, async () => {
    const { lib } = workspace();

    buildLibrary(lib);
    edit(join(lib, "package.json"), (text) => text.replace('"valance": "./dist/index.js"', '"valance": "./dist/index.js",\n      "default": "./dist/other.js"'));
    expect(codes(await checkLibrary(lib))).toContain("library-default");

    edit(join(lib, "package.json"), (text) => text.replaceAll('valance": "./dist/index.js', 'main": "./dist/index.js'));
    expect(codes(await checkLibrary(lib))).toContain("library-unmarked");
  });

  it("finds a peer dependency that was dropped, and stylesheets a bundler would drop", { timeout: 180_000 }, async () => {
    const { lib } = workspace();

    buildLibrary(lib);
    edit(join(lib, "package.json"), (text) => {
      const manifest = JSON.parse(text) as Record<string, any>;

      delete manifest["peerDependencies"]["@valancex/common"];
      manifest["sideEffects"] = ["./dist/index.js"];
      manifest["valance"]["styles"] = ["./dist/x.css"];

      return JSON.stringify(manifest, null, 2);
    });
    writeFileSync(join(lib, "dist", "x.css"), ".x { color: red; }\n");

    const found = codes(await checkLibrary(lib));

    expect(found).toContain("library-peer");
    expect(found).toContain("library-side-effects");
  });

  it("holds every template to every declared target, through the playground: a component written for the web only, declared for both, is found", { timeout: 180_000 }, async () => {
    const { lib } = workspace();

    edit(join(lib, "src", "greeting.mprx"), () => '<div class="greeting"><text>{title}</text><text>{message}</text><button on.click={dismiss()}>Dismiss</button></div>\n');
    expect(buildLibrary(lib).diagnostics).toEqual([]);

    const found = await checkLibrary(lib);

    expect(found.filter((each) => each.file.startsWith("../../playground") || each.file.includes("greeting.mprx")).length).toBeGreaterThan(0);
    expect(found.map((each) => each.message).join("\n")).toMatch(/div/);

    // declared for the web alone, the same library is clean on the target it declares and says nothing about the other
    edit(join(lib, "package.json"), (text) => text.replace('"targets": ["web", "desktop"]', '"targets": ["web"]'));
    edit(join(lib, "..", "..", "playground", "src", "main.ts"), (text) => text.replace("targets: { desktop: { layout: component(desktopLayout) } },", ""));

    expect((await checkLibrary(lib)).filter((each) => each.code === "library-playground-target")).toEqual([]);
  });

  it("finds a playground that does not build a target the package declares, and a template it never writes", { timeout: 180_000 }, async () => {
    const { lib, app } = workspace();

    buildLibrary(lib);
    rmSync(join(app, "valance.desktop.json"));
    expect(codes(await checkLibrary(lib))).toContain("library-playground-target");

    writeFileSync(join(app, "valance.desktop.json"), "{}");
    edit(join(app, "src", "layout.mprx"), () => "<column><text>nothing</text></column>\n");
    edit(join(app, "src", "desktop", "layout.mprx"), () => "<column><text>nothing</text></column>\n");

    expect(codes(await checkLibrary(lib))).toContain("library-unused");
  });
});
