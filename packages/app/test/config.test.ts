import { afterEach, describe, expect, it } from "vitest";

import { AppError } from "../src/diagnostics.js";
import { findRoot, loadConfig } from "../src/config.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

const problems = (root: string): ReadonlyArray<string> => {
  try { loadConfig(root); } catch (error) { if (error instanceof AppError) { return error.diagnostics.map(({ file, line, code }) => `${file}:${line} ${code}`); } throw error; }

  return [];
};

describe("valance.json and valance.web.json", () => {
  it("resolves defaults: the web target is served at / with no published address", () => {
    expect(loadConfig(project({}))).toEqual({ name: "Test", web: { base: "/", url: "" } });
  });

  it("reads the target's settings from valance.web.json", () => {
    const root = project({ "valance.web.json": '{ "version": 1, "base": "/docs/", "url": "https://example.com" }' });

    expect(loadConfig(root).web).toEqual({ base: "/docs/", url: "https://example.com" });
  });

  it("names the line of an unknown setting, and lists the known ones", () => {
    const root = project({ "valance.json": '{\n  "name": "x",\n  "titel": "y"\n}' });

    expect(problems(root)).toEqual(["valance.json:3 config-unknown"]);
    expect(() => loadConfig(root)).toThrow(/known: \$schema, version, name/);
  });

  it("requires a name, and refuses a base that is not a directory address", () => {
    expect(problems(project({ "valance.json": "{}" }))).toEqual(["valance.json:1 config-missing"]);
    expect(problems(project({ "valance.web.json": '{ "base": "docs" }' }))).toEqual(["valance.web.json:1 config-value"]);
    expect(problems(project({ "valance.web.json": '{ "url": "https://example.com/" }' }))).toEqual(["valance.web.json:1 config-value"]);
    expect(problems(project({ "valance.json": '{ "name": "x", "version": 2 }' }))).toEqual(["valance.json:1 config-value"]);
  });

  it("reports both files at once, and invalid JSON as a diagnostic, not a crash", () => {
    expect(problems(project({ "valance.json": "{}", "valance.web.json": '{ "nope": 1 }' }))).toEqual(["valance.json:1 config-missing", "valance.web.json:1 config-unknown"]);
    expect(problems(project({ "valance.json": "{ nope" }))).toEqual(["valance.json:1 config-syntax"]);
  });

  it("finds the project from a directory inside it, and says what to do when there is none", () => {
    const root = project({ "src/deep/file.txt": "" });

    expect(findRoot(`${root}/src/deep`)).toBe(root);
    expect(() => findRoot("/")).toThrow(/no valance\.json/);
  });
});
