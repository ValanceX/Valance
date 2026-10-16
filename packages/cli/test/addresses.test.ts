// A template writes a site address without the base, as Markdown does; the build puts the base in front. The layout cannot do it itself: MPRX has no string concatenation, by design.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { underBase } from "../src/addresses.js";
import { build } from "../src/build.js";
import { addressesIn } from "../src/outline.js";
import { plan } from "../src/init.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

describe("the addresses a template writes", () => {
  it("are the literal src of an image and the literal href of a link, and nothing built from an expression", () => {
    const source =
      '<image class="x" src="/logo.svg" alt="Logo"><a href="/guide/a" on.click={go()}>x</a><link class="c" href={home} current="false">y</link><span class="/not">z</span>';

    expect(addressesIn(source).map((each) => each.value)).toEqual(["/logo.svg", "/guide/a"]);
  });

  it("go under the base; an address elsewhere, a fragment, a mailto and a protocol-relative one do not", () => {
    const source =
      '<a href="/a">1</a><a href="/">2</a><a href="https://x.dev/a">3</a><a href="#top">4</a><a href="mailto:a@b.c">5</a><a href="//cdn.x/a">6</a><image src="/i.png" alt="i">';

    expect(underBase(source, "/docs/")).toBe(
      '<a href="/docs/a">1</a><a href="/docs/">2</a><a href="https://x.dev/a">3</a><a href="#top">4</a><a href="mailto:a@b.c">5</a><a href="//cdn.x/a">6</a><image src="/docs/i.png" alt="i">',
    );
    expect(underBase(source, "/")).toBe(source);
  });
});

describe("a layout under a base", () => {
  const answers = { name: "Notes", dir: "/unused", web: { base: "/docs/", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;

  it("names a file and a page of the site with the base written for it", async () => {
    const files = Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json"));
    const layout = files["src/layout.mprx"]!.replace(
      '<header class="bar">',
      '<header class="bar"><image class="picture" src="/logo.svg" alt="Logo" loading="lazy"></image><link class="brand" href="/guide/getting-started" current="false">Start</link>',
    );
    const root = project({ ...files, "src/layout.mprx": layout, "public/logo.svg": "<svg xmlns='http://www.w3.org/2000/svg'/>" });

    await build(root);

    const html = readFileSync(join(root, "dist/web/index.html"), "utf8");

    expect(html).toContain('src="/docs/logo.svg"');
    expect(html).toContain('href="/docs/guide/getting-started"');
    expect(html).not.toContain('src="/logo.svg"');
  }, 180_000);
});
