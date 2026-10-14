// The content layer on a native vocabulary. The hypothesis (docs/application-model/NATIVE-VOCABULARY.md): what Markdown produces is a closed set (six blocks, five inlines) whose names are ARIA's,
// so a project can draw a whole content site from the controls vocabulary plus ten content components, with the application model unchanged. This builds such a project the way `vlx` would: its own
// layout, the built-in views overridden by native templates, compiled against a native vocabulary, run with no DOM and no PORT Web, and navigated by the application's own `go` command.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as Web from "@valancex/valance/web";
import { application, routes, type Vocabulary } from "@valancex/common/internal";
import { init } from "@valancex/mesh-runtime";
import type { RenderTree } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { Effect, Exit, Scope } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { loadAuthor } from "../src/author.js";
import { compileViews } from "../src/compile.js";
import { loadConfig } from "../src/config.js";
import { readContent } from "../src/content.js";
import { createLoader } from "../src/vite.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

/**
 * The vocabulary, as the tag table the build derives a manifest from. It is the web's *shape* (`Vocabulary.tags` is PORT Web's realization table) with no web in it: the element names are
 * never used, only which props and events each component has. That the type is the web's is itself a finding (see the investigation): a native vocabulary is a MESH manifest, as data.
 */
const nativeVocabulary: Vocabulary = {
  target: "native-experiment",
  tags: {
    // controls and layout (the Desktop PORT's own)
    column: { element: "div" },
    row: { element: "div" },
    text: { element: "span" },
    button: { element: "button", events: { click: { type: "click" } } },
    // the content layer, named by ARIA
    heading: { element: "h1", props: { level: Web.property("level", "number") } },
    paragraph: { element: "p" },
    list: { element: "ul", props: { ordered: Web.booleanAttribute("data-ordered") } },
    listitem: { element: "li" },
    code: { element: "code" },
    blockquote: { element: "blockquote" },
    image: { element: "img", props: { src: Web.attribute("src"), label: Web.attribute("alt") } },
    strong: { element: "strong" },
    emphasis: { element: "em" },
    link: { element: "a", props: { href: Web.attribute("href") } },
  },
};

const MAIN = `import { component, defineApp } from "@valancex/common";
import layout from "./layout.mprx";
import blocks from "./blocks.mprx";
import block from "./block.mprx";
import runs from "./runs.mprx";
import inline from "./inline.mprx";
import listBlock from "./list-block.mprx";
import listItems from "./list-items.mprx";

export default defineApp({
  layout: component(layout),
  override: [component(blocks), component(block), component(runs), component(inline), component(listBlock), component(listItems)],
});
`;

const TEMPLATES: Readonly<Record<string, string>> = {
  "src/layout.mprx": `<column>
  <link href={home}>{site}</link>
  {#each sections as s (s.id)}
    <column>
      {#if s.title != ""}<text>{s.title}</text>{/if}
      <list ordered={false}>
        {#each s.items as n (n.id)}<listitem><link href={n.href}>{n.label}</link></listitem>{/each}
      </list>
    </column>
  {/each}
  <blocks items={blocks} />
  <row>
    {#if prev.href != ""}<link href={prev.href}>{prev.label}</link>{/if}
    {#if next.href != ""}<link href={next.href}>{next.label}</link>{/if}
  </row>
</column>
`,
  "src/blocks.mprx": `<mesh-fragment>
  {#each items as b (b.id)}<block b={b} />{/each}
</mesh-fragment>
`,
  "src/block.mprx": `<mesh-fragment>
  {#if b.kind == "heading"}<heading level={b.level}><runs spans={b.spans} /></heading>{:else if b.kind == "list"}<list-block ordered={b.ordered} items={b.items} />{:else if b.kind == "code"}<code>{b.text}</code>{:else if b.kind == "quote"}<blockquote><runs spans={b.spans} /></blockquote>{:else if b.kind == "image"}<image src={b.src} label={b.alt} />{:else}<paragraph><runs spans={b.spans} /></paragraph>{/if}
</mesh-fragment>
`,
  "src/runs.mprx": `<mesh-fragment>
  {#each spans as s (s.id)}<inline kind={s.kind} text={s.text} href={s.href} />{/each}
</mesh-fragment>
`,
  "src/inline.mprx": `<mesh-fragment>
  {#if kind == "strong"}<strong>{text}</strong>{:else if kind == "emphasis"}<emphasis>{text}</emphasis>{:else if kind == "code"}<code>{text}</code>{:else if kind == "link"}<link href={href}>{text}</link>{:else}<mesh-fragment>{text}</mesh-fragment>{/if}
</mesh-fragment>
`,
  "src/list-block.mprx": `<mesh-fragment>
  <list ordered={ordered}><list-items items={items} /></list>
</mesh-fragment>
`,
  "src/list-items.mprx": `<mesh-fragment>
  {#each items as i (i.id)}<listitem><runs spans={i.spans} /></listitem>{/each}
</mesh-fragment>
`,
};

const CONTENT: Readonly<Record<string, string>> = {
  "content/index.md": `---
title: Notes
---

# Notes

Welcome to **the notes**, written in *Markdown*, with \`inline code\` and a [guide](/guide/start).

- one
- two

1. first
2. second

> A quotation.

\`\`\`
const answer = 42;
\`\`\`

![A logo](/logo.svg)
`,
  "content/guide/start.md": `---
title: Getting started
---

# Getting started

## Install

Run the command, then come [back home](/).
`,
};

type Node = RenderTree["root"]["children"][number];
type Element = Exclude<Node, { readonly type: "text" }>;

const walk = (node: Node, into: Array<Element> = []): Array<Element> => {
  if (node.type !== "text") {
    into.push(node);
    node.children.forEach((child) => walk(child, into));
  }

  return into;
};

const textOf = (node: Node): string => (node.type === "text" ? node.text : node.children.map(textOf).join(""));

/** The project, compiled against the native vocabulary and started with a target that keeps the last tree. */
const started = async () => {
  const root = project({ ...CONTENT, ...TEMPLATES, "public/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>', "src/main.ts": MAIN });
  const config = loadConfig(root);
  const loader = await createLoader(root, config);
  const author = await loadAuthor(loader, root).finally(() => loader.close());
  const built = await compileViews(root, author, nativeVocabulary);
  const content = readContent(root, config);

  await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(application(content, built.program, author)).pipe(Scope.extend(scope)));
  let tree: RenderTree | undefined;

  await Effect.runPromise(
    Valance.mount(handle, () => ({ draw: (next) => void (tree = next), update: (next) => void (tree = next), unmount: () => undefined })).pipe(Scope.extend(scope)),
  );
  await new Promise((resolve) => setTimeout(resolve, 30));

  // For the PORT's own tests and for running this site in a window: `NATIVE_READER_OUT=/some/dir pnpm vitest run test/native-content.test.ts` writes the compiled site and the tree of its first page.
  const out = process.env["NATIVE_READER_OUT"];

  if (out !== undefined && tree !== undefined) {
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/content.json`, JSON.stringify(content));
    writeFileSync(`${out}/program.json`, JSON.stringify(built.program));
    writeFileSync(`${out}/reader-index.json`, `${JSON.stringify(tree, null, 2)}\n`);
  }

  return {
    content,
    handle,
    nodes: () => walk(tree!.root),
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
};

describe("a content site drawn from a native vocabulary", () => {
  it("compiles against the vocabulary with no web tag in it, and renders", async () => {
    const app = await started();
    const used = new Set(app.nodes().map((node) => node.component));

    // Every component that reached the screen is one of the vocabulary's: nothing is a `div`, a `para` or a `shell`.
    expect([...used].every((name) => name in nativeVocabulary.tags)).toBe(true);
    // Every block and inline kind the content model has was drawn, through components named by ARIA.
    for (const name of ["heading", "paragraph", "list", "listitem", "code", "blockquote", "image", "strong", "emphasis", "link"]) {
      expect(used.has(name), name).toBe(true);
    }

    await app.close();
  }, 120_000);

  it("draws the page's own words: a heading with its level, and text as text", async () => {
    const app = await started();
    const headings = app.nodes().filter((node) => node.component === "heading");

    expect(headings.map((node) => [(node.props as Record<string, unknown>)["level"], textOf(node)])).toEqual([[1, "Notes"]]);
    expect(
      app
        .nodes()
        .filter((node) => node.component === "blockquote")
        .map(textOf),
    ).toEqual(["A quotation."]);
    expect(
      app
        .nodes()
        .filter((node) => node.component === "code")
        .map(textOf),
    ).toContain("const answer = 42;");
    expect(
      app
        .nodes()
        .filter((node) => node.component === "list")
        .map((node) => (node.props as Record<string, unknown>)["ordered"]),
    ).toContain(true);

    await app.close();
  }, 120_000);

  it("has links that carry an address and no event, so the PORT has nothing to report but the address", async () => {
    const app = await started();
    const links = app.nodes().filter((node) => node.component === "link");

    expect(links.length).toBeGreaterThan(0);
    expect(links.every((node) => typeof (node.props as Record<string, unknown>)["href"] === "string" && Object.keys(node.events).length === 0)).toBe(true);
    expect(links.map((node) => (node.props as Record<string, unknown>)["href"])).toContain("/guide/start");

    await app.close();
  }, 120_000);

  it("moves between pages with the application's own command, given the address a link carries", async () => {
    const app = await started();
    const table = routes(app.content);
    const href = "/guide/start";

    await Effect.runPromise(app.handle.invoke("app/go", [{ value: (table.stateOf(new URL(href, "http://app.invalid/")) as { readonly id: string }).id }] as never));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(
      app
        .nodes()
        .filter((node) => node.component === "heading")
        .map(textOf),
    ).toEqual(["Getting started", "Install"]);
    expect(
      app
        .nodes()
        .filter((node) => node.component === "heading")
        .map((node) => (node.props as Record<string, unknown>)["level"]),
    ).toEqual([1, 2]);

    await app.close();
  }, 120_000);
});
