import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { main } from "../src/cli.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const quiet = () => ({ out: vi.spyOn(console, "log").mockImplementation(() => undefined), err: vi.spyOn(console, "error").mockImplementation(() => undefined) });

describe("the valance command", () => {
  it("check: 0 for a sound project, 1 with the diagnostics for a broken one, as text or as JSON", async () => {
    const { out, err } = quiet();

    expect(await main(["check"], project({ "content/index.md": PAGE() }))).toBe(0);
    expect(out.mock.calls.flat().join("\n")).toMatch(/1 pages, \d+ components, no problems/);

    const broken = project({ "content/index.md": PAGE("Home", "[x](/nowhere)") });

    expect(await main(["check"], broken)).toBe(1);
    expect(err.mock.calls.flat().join("\n")).toContain("content/index.md:7 link-broken");

    out.mockClear();
    expect(await main(["check", "--json"], broken)).toBe(1);
    expect(JSON.parse(out.mock.calls.flat().join("\n"))).toEqual([{ file: "content/index.md", line: 7, column: 0, code: "link-broken", message: expect.stringContaining("/nowhere") }]);
  });

  it("works from a directory inside the project, and says what to do outside one", async () => {
    const { err } = quiet();
    const root = project({ "content/index.md": PAGE(), "src/deep/x.txt": "" });

    expect(await main(["check"], `${root}/src/deep`)).toBe(0);
    expect(await main(["check"], "/")).toBe(1);
    expect(err.mock.calls.flat().join("\n")).toContain("no valance.json");
  });

  it("refuses an unknown command (2) and prints help for none", async () => {
    const { out, err } = quiet();

    expect(await main(["serve"])).toBe(2);
    expect(err.mock.calls.flat().join("\n")).toContain('unknown command "serve"');
    expect(await main([])).toBe(0);
    expect(out.mock.calls.flat().join("\n")).toContain("valance <command>");
  });
});

describe("the schemas editors read", () => {
  const load = (name: string) => JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url), "utf8")) as { properties: Record<string, unknown>; required?: Array<string> };

  it("list exactly the settings the tools accept", () => {
    expect(Object.keys(load("valance.schema.json").properties)).toEqual(["$schema", "version", "name"]);
    expect(load("valance.schema.json").required).toEqual(["name"]);
    expect(Object.keys(load("valance.web.schema.json").properties)).toEqual(["$schema", "version", "base", "url"]);
  });
});
