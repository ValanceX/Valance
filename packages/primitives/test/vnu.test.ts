// The HTML each tag draws on the server is conforming HTML, by the checker the HTML Standard's own tests use (the Nu Html Checker, `vnu-jar`): no error, for each tag in the context its specification
// gives. A warning is not an error here, and the ones that remain are listed in the test with the reason. Needs Java; the test says so rather than pass when it is missing.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { realizeHtml } from "@valancex/port-web/server";
import * as Web from "@valancex/valance/web";
import { describe, expect, it } from "vitest";

import { loadSpecifications, loadWeb, webTable } from "../src/index.js";
import { treeOf } from "./tree.js";

const specifications = loadSpecifications();
const realizations = loadWeb();
const table = webTable(realizations, Web as never);
const jar = join(createRequire(import.meta.url).resolve("vnu-jar/package.json"), "..", "build", "dist", "vnu.jar");

const page = (body: string): string =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>A primitive</title>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

const check = (documents: Record<string, string>): Array<{ file: string; type: string; message: string }> => {
  const directory = mkdtempSync(join(tmpdir(), "vnu-"));

  try {
    for (const [name, html] of Object.entries(documents)) {
      writeFileSync(join(directory, `${name}.html`), html);
    }

    const run = spawnSync("java", ["-jar", jar, "--format", "json", directory], { encoding: "utf8" });

    if (run.error !== undefined) {
      throw new Error(`the Nu Html Checker needs Java: ${run.error.message}`);
    }

    const report = JSON.parse(run.stderr.slice(run.stderr.indexOf("{"))) as { messages: Array<{ url: string; type: string; subType?: string; message: string }> };

    return report.messages.map((each) => ({ file: each.url.split("/").pop()!, type: each.subType ?? each.type, message: each.message }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe("the HTML the web tags draw", () => {
  it("has no error from the Nu Html Checker", { timeout: 180_000 }, () => {
    const documents: Record<string, string> = {};

    for (const [tag, realization] of Object.entries(realizations.primitives)) {
      const specification = specifications[realization.primitive]!;

      // a primitive that lives inside another is checked inside its container's example (a list's items, a radio group's radios)
      if (specification.within === undefined) {
        documents[tag] = page(realizeHtml(treeOf(realizations, tag, specification.example), table));
      }
    }

    const found = check(documents).filter((each) => each.type === "error");

    expect(found).toEqual([]);
  });

  it(
    "checks the layers' own constructs: a dialog written open and a popover with its mode are valid, a wrong mode or a second `open` value is an error",
    { timeout: 60_000 },
    () => {
      const good = check({ good: page(`<dialog open aria-label="Sure?"><p>Sure?</p></dialog><div popover="manual" role="group" aria-label="Details"><p>More</p></div>`) });
      const bad = check({
        mode: page(`<div popover="sometimes"><p>More</p></div>`),
        open: page(`<dialog open="false" aria-label="Sure?"><p>Sure?</p></dialog>`),
      });

      expect(good.filter((each) => each.type === "error")).toEqual([]);
      expect(
        bad
          .filter((each) => each.type === "error")
          .map((each) => each.file)
          .sort(),
      ).toEqual(["mode.html", "open.html"]);
    },
  );

  it("does report a real error (the checker is running)", { timeout: 60_000 }, () => {
    const found = check({ bad: page(`<ul><span>not an item</span></ul>`) });

    expect(found.some((each) => each.type === "error")).toBe(true);
  });
});
