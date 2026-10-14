// The Open capability: only the addresses a person expects a link to open are opened, and they are handed to the system as data, never through a shell.
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { OPENABLE, refusal, webOpen } from "../src/open.js";
import { openerFor, systemOpen } from "../src/open-system.js";

describe("which addresses are opened", () => {
  it("are web pages and mail: an absolute address with an openable scheme, on one line", () => {
    for (const address of ["https://example.com/a?b=c#d", "http://example.com", "mailto:someone@example.com"]) {
      expect(refusal(address), address).toBeUndefined();
    }

    expect(OPENABLE).toEqual(["https:", "http:", "mailto:"]);
  });

  it("are not scripts, files, programs' own schemes, relative or odd addresses, nor anything with a space or control character in it", () => {
    for (const address of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "vscode://x",
      "data:text/html,x",
      "/relative",
      "example.com",
      "",
      "https://a b",
      "https://a\nb",
      "https://a\u0000b",
      `https://example.com/${"a".repeat(2100)}`,
      "--help",
      "-flag",
    ]) {
      expect(refusal(address), JSON.stringify(address).slice(0, 40)).toBeDefined();
    }
  });
});

describe("the desktop's opener", () => {
  it("is each system's own program, given the address as an argument", () => {
    expect(openerFor("https://x.test", "linux")).toEqual({ program: "xdg-open", args: ["https://x.test"] });
    expect(openerFor("https://x.test", "darwin")).toEqual({ program: "open", args: ["https://x.test"] });
    expect(openerFor("https://x.test", "win32")).toEqual({ program: "rundll32", args: ["url.dll,FileProtocolHandler", "https://x.test"] });
  });

  it("runs it for an address it may open, and for nothing else", async () => {
    const started: Array<readonly [string, ReadonlyArray<string>]> = [];
    const opener = systemOpen((program, args) => {
      started.push([program, args]);

      return { on: () => undefined, unref: () => undefined };
    }, "linux");

    expect(await Effect.runPromise(Effect.exit(opener.open("https://example.com")))).toEqual(Exit.succeed(undefined));
    expect(started).toEqual([["xdg-open", ["https://example.com"]]]);

    const refused = await Effect.runPromise(Effect.exit(opener.open("file:///etc/passwd")));

    expect(Exit.isFailure(refused)).toBe(true);
    expect(started).toHaveLength(1);
  });

  it("says so when the system's program is not there", async () => {
    const opener = systemOpen(() => {
      throw new Error("ENOENT");
    }, "linux");
    const exit = await Effect.runPromise(Effect.exit(opener.open("https://example.com")));

    expect(Exit.isFailure(exit) && String(exit.cause)).toContain("could not be started");
  });
});

describe("the page's opener", () => {
  it("opens a tab with no link back to the page, for an address it may open", async () => {
    const calls: Array<ReadonlyArray<string>> = [];
    const opener = webOpen({ open: (...args) => void calls.push(args) });

    await Effect.runPromise(opener.open("https://example.com"));
    expect(calls).toEqual([["https://example.com", "_blank", "noopener,noreferrer"]]);
    expect(Exit.isFailure(await Effect.runPromise(Effect.exit(opener.open("javascript:1"))))).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
