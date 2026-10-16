import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { tagReference, TAGS_BEGIN, TAGS_END, tagsOf } from "../src/tags.js";
import { TARGETS } from "../src/targets.js";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

describe("the tag reference", () => {
  it("names every primitive of every target, with the form controls the guide used to leave out", () => {
    const web = tagsOf(TARGETS.find((each) => each.id === "web")!.vocabulary).map((each) => each.name);

    expect(web).toEqual(expect.arrayContaining(["textfield", "checkbox", "button", "column", "row", "heading", "text", "link"]));
    expect(tagsOf(TARGETS.find((each) => each.id === "desktop")!.vocabulary).map((each) => each.name)).toEqual(expect.arrayContaining(["textfield", "checkbox", "paragraph"]));
  });

  it("is what the CLI guide says: the guide's table is regenerated with `pnpm docs:tags` when a vocabulary changes", () => {
    const from = readme.indexOf(TAGS_BEGIN);
    const to = readme.indexOf(TAGS_END);

    expect(from).toBeGreaterThan(0);
    expect(readme.slice(from + TAGS_BEGIN.length, to).trim()).toBe(tagReference().trim());
  });
});
