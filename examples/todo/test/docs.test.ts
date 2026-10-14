// The Learn page's code is the application's code: each block marked `**File:**` must appear, line for line (indentation aside), in that file. A page that drifts from the example fails here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const page = readFileSync(new URL("docs/learn/desktop-application.md", root), "utf8");
const lines = (text: string): ReadonlyArray<string> => text.split("\n").map((line) => line.trim());
const blocks = [...page.matchAll(/\*\*File:\*\* `([^`]+)`\n\n```[a-z]*\n([\s\S]*?)\n```/g)].map((match) => ({ file: match[1]!, code: match[2]! }));

describe("docs/learn/desktop-application.md", () => {
  it("has the code blocks it promises", () => {
    expect(blocks.map((block) => block.file)).toEqual([
      "examples/todo/src/screens/notFound.mprx",
      "examples/todo/src/screens/lists.mprx",
      "examples/todo/src/app.ts",
      "examples/todo/src/routes.ts",
      "examples/todo/src/app.ts",
    ]);
  });

  for (const block of blocks) {
    it(`${block.file}: the block is a contiguous piece of the file`, () => {
      const file = lines(readFileSync(new URL(block.file, root), "utf8"));
      const wanted = lines(block.code);
      const at = file.findIndex((_, start) => wanted.every((line, offset) => file[start + offset] === line));

      expect(at, `the block is not in ${block.file}`).toBeGreaterThanOrEqual(0);
    });
  }

  it("names the seven words the vocabulary declares, and no other", () => {
    const declared = Object.keys((JSON.parse(readFileSync(new URL("examples/todo/src/desktop-vocabulary.json", root), "utf8")) as { components: object }).components).sort();
    const table = page.slice(page.indexOf("## The seven words"), page.indexOf("## 1. A screen"));
    const named = [...table.matchAll(/`([a-z]+)`/g)].map((match) => match[1]!).filter((word) => declared.includes(word));

    expect([...new Set(named)].sort()).toEqual(declared);
  });
});
