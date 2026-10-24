// The generated-UI cases (Bet 13): they pass on the data in `generated/`, and each is shown failing against a deliberately wrong value, so a case that stopped checking would be found.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { dataDirectory, runGenerated } from "../src/generated.js";

const copies: string[] = [];
const copy = (): string => {
  const directory = mkdtempSync(join(tmpdir(), "vlx-generated-data-"));

  cpSync(dataDirectory, directory, { recursive: true });
  copies.push(directory);

  return directory;
};

afterEach(() => copies.splice(0).forEach((each) => rmSync(each, { recursive: true, force: true })));

describe("the generated-UI cases", () => {
  it("pass on the data: every page streams to its last preview, close() is the batch check, every planted mistake is heard in time and nothing is drawn after it", { timeout: 120_000 }, async () => {
    const run = await runGenerated();

    expect(run.failures).toEqual([]);
    expect(run.pages.map((each) => each.name)).toEqual(["branches", "form", "greeting", "list"]);
    expect(run.previews.length).toBeGreaterThan(80);
    expect(run.mistakes.length).toBe(6);
    expect(run.heard).toBe(true);
    expect(run.refusesUnchecked).toBe(true);
  });

  it("find a planted mistake that is given the wrong code (the control: the case reports it)", { timeout: 120_000 }, async () => {
    const directory = copy();
    const mistakes = JSON.parse(readFileSync(join(directory, "mistakes.json"), "utf8")) as Array<{ code: string }>;

    mistakes[0]!.code = "unknown-component";
    writeFileSync(join(directory, "mistakes.json"), JSON.stringify(mistakes));

    const run = await runGenerated(directory);

    expect(run.heard).toBe(false);
    expect(run.failures.join("\n")).toContain("variant-not-in-the-set");
  });

  it("find a page that uses what the profile does not offer (a tag, a command): it is reported, not drawn", { timeout: 120_000 }, async () => {
    const directory = copy();

    writeFileSync(join(directory, "pages", "greeting.mprx"), "<column>\n  <text>Hi</text>\n  <button on.click={wipe()}>Wipe</button>\n</column>\n");

    const run = await runGenerated(directory);

    expect(run.failures.join("\n")).toMatch(/greeting: a page that is right was reported: unknown-command/);
    expect(run.pages.map((each) => each.name)).not.toContain("greeting");
  });

  it("find a mistake that is heard late: a source whose error only the whole text shows is not heard within 20 bytes", { timeout: 120_000 }, async () => {
    const directory = copy();
    // an unclosed element is a mistake the end of the text decides; it starts at 0 and is reported at the end
    const mistakes = [{ name: "never-closed", code: "missing-closing-tag", source: `<column>\n${"  <text>filler to push the end well past twenty bytes</text>\n".repeat(3)}` }];

    writeFileSync(join(directory, "mistakes.json"), JSON.stringify(mistakes));

    const run = await runGenerated(directory);

    expect(run.heard).toBe(false);
    expect(run.failures.join("\n")).toContain("never-closed");
  });
});
