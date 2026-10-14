// An image's address as the window can use it: a file under the project's `public/` becomes its absolute path; anything else is left alone.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { assetPath, withAssets } from "../src/desktop.js";

const assets = mkdtempSync(join(tmpdir(), "vlx-assets-"));

mkdirSync(join(assets, "img"));
writeFileSync(join(assets, "dot.png"), "x");
writeFileSync(join(assets, "img", "a b.png"), "x");

describe("assetPath", () => {
  it("names the file an address on the site stands for", () => {
    expect(assetPath(assets, "/dot.png")).toBe(join(assets, "dot.png"));
    expect(assetPath(assets, "/img/a%20b.png?v=2#x")).toBe(join(assets, "img", "a b.png"));
  });

  it("leaves alone what is not a file under it: a network address, a path out of it, a missing file, a relative path", () => {
    for (const src of ["https://example.com/dot.png", "//example.com/dot.png", "/../dot.png", "/img/../../dot.png", "/missing.png", "dot.png", "/img", ""]) {
      expect(assetPath(assets, src), src).toBeUndefined();
    }
  });
});

describe("withAssets", () => {
  it("turns each image's address into its file, anywhere in the tree, and touches nothing else", () => {
    const tree = {
      format: "mesh-render",
      version: 1,
      root: {
        type: "node",
        key: "a",
        component: "column",
        props: {},
        events: {},
        children: [
          { type: "node", key: "b", component: "image", props: { src: "/dot.png", label: "dot" }, events: {}, children: [] },
          { type: "node", key: "c", component: "image", props: { src: "https://example.com/x.png", label: "far" }, events: {}, children: [] },
          { type: "text", key: "d", text: "/dot.png" },
        ],
      },
    };
    const out = withAssets(tree as never, assets) as unknown as {
      readonly root: { readonly children: ReadonlyArray<{ readonly props?: { readonly src?: string }; readonly text?: string }> };
    };

    expect(out.root.children[0]!.props!.src).toBe(join(assets, "dot.png"));
    expect(out.root.children[1]!.props!.src).toBe("https://example.com/x.png");
    expect(out.root.children[2]!.text).toBe("/dot.png");
    expect((tree.root.children[0] as { props: { src: string } }).props.src).toBe("/dot.png"); // the original is not changed
  });
});
