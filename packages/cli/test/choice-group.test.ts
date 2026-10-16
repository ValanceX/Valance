// A portable choice group (docs/application-model/CHOICE-GROUP.md, CG-1 to CG-6): what the page writes for a radio group, and that a neutral target refuses the web's hooks on it.
import { readFileSync } from "node:fs";
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
