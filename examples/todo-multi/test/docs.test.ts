// The tutorials' code is this application's code: each block marked `**File:**` must appear, line for line (indentation aside), in the file it names. A page that drifts from the example fails here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const example = new URL("examples/todo-multi/", root);
const lines = (text: string): ReadonlyArray<string> => text.split("\n").map((line) => line.trim());

// The reader's project keeps every template in src/ (as `vlx generate component` writes it); this one sorts them by target. Any other path is the same in both.
const here: Readonly<Record<string, string>> = {
  "src/layout.mprx": "src/web/layout.mprx",
  "src/todo-item.mprx": "src/shared/todo-item.mprx",
  "src/todo-item.ts": "src/shared/todo-item.ts",
  "src/todo-add.mprx": "src/shared/todo-add.mprx",
  "src/todo-add.ts": "src/shared/todo-add.ts",
};

for (const tutorial of ["02-state-views-and-events.md", "03-desktop-application.md"]) {
  const page = readFileSync(new URL(`docs/tutorials/${tutorial}`, root), "utf8");
  const blocks = [...page.matchAll(/\*\*File:\*\* `([^`]+)`\n\n```[a-z]*\n([\s\S]*?)\n```/g)].map((match) => ({ file: match[1]!, code: match[2]! }));

  describe(`docs/tutorials/${tutorial}`, () => {
    it("has code blocks to check", () => {
      expect(blocks.length).toBeGreaterThan(0);
    });

    for (const block of blocks) {
      it(`${block.file}: the block is a contiguous piece of the file`, () => {
        const file = lines(readFileSync(new URL(here[block.file] ?? block.file, example), "utf8"));
        const wanted = lines(block.code);
        const at = file.findIndex((_, start) => wanted.every((line, offset) => file[start + offset] === line));

        expect(at, `the block is not in ${here[block.file] ?? block.file}`).toBeGreaterThanOrEqual(0);
      });
    }
  });
}
