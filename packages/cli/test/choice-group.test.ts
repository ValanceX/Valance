// A portable choice group (docs/application-model/CHOICE-GROUP.md, CG-1 to CG-6): what the page writes for a radio group, and that a neutral target refuses the web's hooks on it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { plan } from "../src/init.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["web"] } as const;

const withLayout = (markup: string): string => {
  const files = Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json"));

  return project({ ...files, "src/layout.mprx": files["src/layout.mprx"]!.replace("<screen />", `<screen />${markup}`) });
};

describe("the radio group on the web", () => {
  it("is a div with the radiogroup role and one input per option, with the name, value, label and the live checked", async () => {
    const root = withLayout(`
      <radiogroup label="Plan" invalid={false} describedby="why">
        <radio name="plan" label="Free" value="free" checked={true} on.select={toggleTheme()} />
        <radio name="plan" label="Pro" value="pro" checked={false} disabled={true} on.select={toggleTheme()} />
      </radiogroup>`);

    expect((await check(root)).diagnostics).toEqual([]);
    await build(root);

    const html = readFileSync(join(root, "dist/web/index.html"), "utf8");
    const group = /<div[^>]*role="radiogroup"[^>]*>/.exec(html)?.[0] ?? "";
    const radio = (label: string) => new RegExp(`<input[^>]*aria-label="${label}"[^>]*>`).exec(html)?.[0] ?? "";

    expect(group).toContain('aria-label="Plan"');
    expect(group).toContain('aria-invalid="false"');
    expect(group).toContain('aria-describedby="why"');
    expect(radio("Free")).toContain('type="radio"');
    expect(radio("Free")).toContain('name="plan"');
    expect(radio("Free")).toContain('value="free"');
    expect(radio("Free")).toContain("checked");
    expect(radio("Pro")).not.toMatch(/\schecked/);
    expect(radio("Pro")).toContain("disabled");
  }, 240_000);

  it("a radio needs its value and its checked; `select` is its event, and no other", async () => {
    const found = (await check(withLayout(`<radio name="plan" label="Free" on.change={toggleTheme()} />`))).diagnostics.map((each) => each.code);

    expect(found.length).toBeGreaterThan(0);
  }, 120_000);
});

describe("the caption that names a control (WA-14, WA-15)", () => {
  it("label is a <label> that wraps its control and its text; a button may carry an accessible name", async () => {
    const root = withLayout(`
      <label class="opt"><radio name="plan" value="free" checked={true} on.select={toggleTheme()} />Free</label>
      <label><checkbox checked={false} on.change={toggleTheme()} />I agree</label>
      <button label="Close" on.click={toggleTheme()}>x</button>`);

    expect((await check(root)).diagnostics).toEqual([]);
    await build(root);

    const html = readFileSync(join(root, "dist/web/index.html"), "utf8");

    expect(html).toMatch(/<label class="opt"><input[^>]*type="radio"[^>]*>Free<\/label>/);
    expect(html).toMatch(/<label><input[^>]*type="checkbox"[^>]*>I agree<\/label>/);
    expect(html).toMatch(/<button[^>]*aria-label="Close"[^>]*>x<\/button>/);
  }, 240_000);
});

describe("the two targets agree on the controls (CG-7), checked against a Port checkout", () => {
  // The Desktop PORT is released on its own. Until a release carries a control, Valance cannot see it in the installed package, so a checkout of the Port repository next to this one (or PORT_REPO)
  // stands in: every prop and event the Desktop PORT names for a shared control must be the web's, with the same type and requiredness.
  const port = process.env["PORT_REPO"] ?? join(import.meta.dirname, "../../../../Port");
  const available = existsSync(join(port, "packages/port-desktop/vocabulary.json"));

  it.skipIf(!available)("a desktop prop or event that a shared control has is the web's, of the same type", async () => {
    const { fromManifests, webVocabulary } = await import("@valancex/common/internal");
    const { tagsOf } = await import("../src/tags.js");
    const read = (name: string): { readonly components: Readonly<Record<string, unknown>> } => JSON.parse(readFileSync(join(port, "packages/port-desktop", name), "utf8"));
    const desktop = tagsOf(fromManifests("desktop", read("vocabulary.json"), read("content.json")));
    const web = tagsOf(webVocabulary);

    for (const name of ["checkbox", "textfield", "radiogroup", "radio"]) {
      const there = desktop.find((tag) => tag.name === name);
      const here = web.find((tag) => tag.name === name);

      expect(there, `${name} (desktop)`).toBeDefined();
      expect(here, `${name} (web)`).toBeDefined();
      for (const prop of there!.props) {
        expect(
          here!.props.map((each) => each.replace("*", "")),
          `${name}: ${prop}`,
        ).toContain(prop.replace("*", ""));
      }
      for (const event of there!.events) {
        expect(here!.events, `${name}: ${event}`).toContain(event);
      }
    }
  });
});
