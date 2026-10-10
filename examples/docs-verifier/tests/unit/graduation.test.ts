// Graduation readiness (GRADUATION.md): each external that is a stand-in here becomes a package when its contract is stable. What it would take with it is its import closure, so the
// closure is pinned: if a file starts to depend on something it should not, the candidate stops being extractable, and this says so before anyone tries.
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));

/** Every file of this project that `entries` need, by relative imports, and every package they import. */
const closure = (entries: ReadonlyArray<string>): { readonly files: ReadonlyArray<string>; readonly packages: ReadonlyArray<string> } => {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string): void => {
    if (files.has(file)) { return; }

    files.add(file);

    const text = readFileSync(join(root, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

    for (const found of text.matchAll(/(?:^|\n)\s*(?:import|export)[^"';]*?from\s+"([^"]+)"|import\("([^"]+)"\)/g)) {
      const specifier = found[1] ?? found[2]!;

      if (specifier.startsWith(".")) {
        const target = relative(root, resolve(dirname(join(root, file)), specifier)).replace(/\.js$/, ".ts").split("\\").join("/");

        if (/\.(ts)$/.test(target)) { visit(target); }
      } else {
        packages.add(specifier.startsWith("node:") ? "node:*" : specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!);
      }
    }
  };

  entries.forEach(visit);

  return { files: [...files].sort(), packages: [...packages].sort() };
};

describe("X2, the content pipeline: markdown, highlighting, collections, links, the search index", () => {
  const { files, packages } = closure(["build/content/site.ts", "build/content/search.ts"]);

  it("needs the model and itself, and nothing of the application, the views or the target", () => {
    expect(files).toEqual(["build/content/highlight.ts", "build/content/markdown.ts", "build/content/search.ts", "build/content/site.ts", "src/model/search.ts", "src/model/site.ts", "src/model/slug.ts", "src/model/ui.ts"]);
    expect(packages).toEqual(["effect", "node:*"]);
  });
});

describe("X1, the router: routes, variants, aliases, canonical and alternate addresses", () => {
  const { files, packages } = closure(["src/app/routes.ts", "src/app/variants.ts"]);

  it("needs the model and the application's state shape, and nothing of a target or of Valance", () => {
    // `state.ts` is here because a route reads `state.page`; extracting it means the route table is generic in a state with a `page`, which is the one change it needs.
    expect(files).toEqual(["src/app/routes.ts", "src/app/state.ts", "src/app/variants.ts", "src/model/search.ts", "src/model/site.ts"]);
    expect(packages).toEqual(["effect"]);
  });
});

describe("X3, the site generator: documents, content files, aliases, the 404 page, the sitemap, robots.txt, the feed", () => {
  const { files, packages } = closure(["build/export.ts"]);

  it("needs the application it renders and the target libraries; it is the part that composes everything, so it is the last to leave", () => {
    expect(files).toContain("src/app/application.ts");
    expect(files).toContain("build/document.ts");
    expect(packages).toEqual(expect.arrayContaining(["@valancex/valance", "@valancex/nexus", "@valancex/mesh-compiler", "effect", "node:*"]));
    expect(files.some((file) => file.startsWith("build/content/"))).toBe(false);                    // it renders a site; it does not read one
  });
});

describe("X7, the web platform: the clipboard, a store, the search index and the pages", () => {
  const { files, packages } = closure(["src/web/platform.ts"]);

  it("needs the capabilities' contracts and the model, nothing of the views, and NEXUS", () => {
    expect(files).toEqual(["src/app/capabilities.ts", "src/app/routes.ts", "src/app/state.ts", "src/app/variants.ts", "src/model/search.ts", "src/model/site.ts", "src/web/built.ts", "src/web/platform.ts"]);
    expect(packages).toEqual(["@valancex/nexus", "@valancex/valance", "effect"]);
  });
});

describe("X6, the kit: the views, the styles and the tags they use", () => {
  it("the views are data with no code, and the tags they use are one table", () => {
    const { files, packages } = closure(["src/web/primitives.ts", "src/web/plugins/kit.ts"]);

    expect(files).toEqual(["src/app/state.ts", "src/model/search.ts", "src/model/site.ts", "src/web/built.ts", "src/web/plugins/kit.ts", "src/web/primitives.ts"]);
    expect(packages).toEqual(["@valancex/valance", "effect"]);
  });
});
