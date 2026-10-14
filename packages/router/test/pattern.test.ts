import { describe, expect, it } from "vitest";

import { buildPath, LIMITS, matchSegments, parsePattern, RouteDefinitionError, segmentsOf } from "../src/pattern.js";

const match = (pattern: string, path: string) => {
  const segments = segmentsOf(path);

  return segments === undefined ? undefined : matchSegments(parsePattern(pattern), segments);
};

describe("a path pattern", () => {
  it("is literal segments, :parameters and a trailing *", () => {
    expect(parsePattern("/").segments).toEqual([]);
    expect(parsePattern("/inbox/:id").names).toEqual(["id"]);
    expect(parsePattern("/files/*").names).toEqual(["rest"]);
    expect(parsePattern("/files/*path").names).toEqual(["path"]);
    expect(parsePattern("/a/:x/b/:y").shape).toBe("/a/:/b/:");
  });

  it("refuses what would be ambiguous or unreadable, naming the path", () => {
    for (const bad of ["inbox", "/inbox/", "/a//b", "/a/:", "/a/:1x", "/a/:id/:id", "/a/*/b", "/a/b*", "/a/b c", "/a?x", "/a#x", ""]) {
      expect(() => parsePattern(bad), bad).toThrow(RouteDefinitionError);
    }
  });
});

describe("matching an address", () => {
  it("takes parameters as strings, for a Schema to decode", () => {
    expect(match("/inbox/:id", "/inbox/42")).toEqual({ id: "42" });
    expect(match("/u/:name/posts/:n", "/u/ada/posts/3")).toEqual({ name: "ada", n: "3" });
    expect(match("/", "/")).toEqual({});
  });

  it("compares literals exactly, and the number of segments", () => {
    expect(match("/inbox/:id", "/Inbox/42")).toBeUndefined();
    expect(match("/inbox/:id", "/inbox")).toBeUndefined();
    expect(match("/inbox/:id", "/inbox/42/extra")).toBeUndefined();
  });

  it("treats a trailing slash as the same address", () => {
    expect(match("/inbox/:id", "/inbox/42/")).toEqual({ id: "42" });
    expect(match("/", "//")).toBeUndefined();
  });

  it("decodes each segment once", () => {
    expect(match("/search/:q", "/search/a%20b")).toEqual({ q: "a b" });
    expect(match("/search/:q", "/search/a%2Fb")).toEqual({ q: "a/b" });
    expect(match("/search/:q", "/search/%252F")).toEqual({ q: "%2F" });
  });

  it("refuses a segment that is malformed or holds a control character", () => {
    expect(match("/s/:q", "/s/%E0%A4%A")).toBeUndefined();
    expect(match("/s/:q", "/s/a%00b")).toBeUndefined();
    expect(match("/s/:q", "/s/a%0Ab")).toBeUndefined();
    expect(match("/s/:q", "/s/%7F")).toBeUndefined();
  });

  it("takes the rest for a * and needs at least one segment", () => {
    expect(match("/files/*path", "/files/a/b/c.txt")).toEqual({ path: "a/b/c.txt" });
    expect(match("/files/*", "/files/x")).toEqual({ rest: "x" });
    expect(match("/files/*", "/files")).toBeUndefined();
  });

  it("is bounded: an address longer or deeper than the limits is not read", () => {
    expect(segmentsOf(`/${"a".repeat(LIMITS.path)}`)).toBeUndefined();
    expect(segmentsOf(`/${Array.from({ length: LIMITS.segments + 1 }, () => "a").join("/")}`)).toBeUndefined();
    expect(segmentsOf(`/${"a".repeat(LIMITS.segment + 1)}`)).toBeUndefined();
    expect(segmentsOf("inbox")).toBeUndefined();
  });

  it("does not let a parameter named like a prototype key do anything", () => {
    const values = match("/x/:constructor", "/x/1") as Record<string, string>;

    expect(Object.getPrototypeOf(values)).toBeNull();
    expect(values["constructor"]).toBe("1");
  });
});

describe("building an address", () => {
  it("encodes each value, and the pieces of a rest one by one", () => {
    expect(buildPath(parsePattern("/search/:q"), { q: "a b/c?d#e" })).toBe("/search/a%20b%2Fc%3Fd%23e");
    expect(buildPath(parsePattern("/files/*path"), { path: "a b/c.txt" })).toBe("/files/a%20b/c.txt");
    expect(buildPath(parsePattern("/"), {})).toBe("/");
  });

  it("refuses a missing or empty value: a path with a hole is not an address", () => {
    expect(() => buildPath(parsePattern("/inbox/:id"), {})).toThrow(RouteDefinitionError);
    expect(() => buildPath(parsePattern("/inbox/:id"), { id: "" })).toThrow(RouteDefinitionError);
  });

  it("round-trips through matching", () => {
    for (const value of ["plain", "a b", "a/b", "100%", "ünï", "a+b", "x?y=1", ".."]) {
      const path = buildPath(parsePattern("/s/:q"), { q: value });
      const segments = segmentsOf(path);

      expect(segments === undefined ? undefined : matchSegments(parsePattern("/s/:q"), segments), value).toEqual({ q: value });
    }
  });
});
