import { describe, expect, it } from "vitest";

import { outline, tagsOf } from "../src/outline.js";

describe("the outline of a template", () => {
  it("lists the elements written, with where, repeats included, closing tags and text not counted", () => {
    const source = '<shell>\n  <theme-toggle theme={theme} />\n  <para>a < b</para>\n  <theme-toggle theme="x" />\n</shell>\n';
    const found = outline(source);

    expect(found.tags.map((tag) => tag.name)).toEqual(["shell", "theme-toggle", "para", "theme-toggle"]);
    expect(source.slice(found.tags[1]!.offset, found.tags[1]!.offset + 13)).toBe("<theme-toggle");
    expect([...tagsOf(source).keys()]).toEqual(["shell", "theme-toggle", "para"]);
  });

  it("does not read a tag in an expression, a quoted value or a comment", () => {
    const source = `<a href="x<y>z" title='<b>' label={n <c} on.click={go("<d>")}>{#if n <e}<f />{/if}<!-- <g /> --></a>`;

    expect(outline(source).tags.map((tag) => tag.name)).toEqual(["a", "f"]);
  });

  it("finds the slots a template places and the slots its elements fill", () => {
    const found = outline('<card><mesh-slot name="header" /><mesh-slot /></card><x><mesh-fill slot="footer">hi</mesh-fill></x>');

    expect(found.slots).toEqual(["header", ""]);
    expect(found.fills).toEqual(["footer"]);
  });

  it("goes past a `>` inside an expression in a start tag", () => {
    expect(outline('<a on.click={f(a > b)} x="1"><b /></a>').tags.map((tag) => tag.name)).toEqual(["a", "b"]);
  });
});
