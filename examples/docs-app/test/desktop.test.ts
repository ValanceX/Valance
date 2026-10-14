// The same application, a second target: the documentation site's content, state and commands are untouched; `vlx generate target desktop` added a layout of its own. Its built engine draws the
// pages in the window's vocabulary and follows a link by the application's own `go` command, as the browser's click does.
import { build } from "@valancex/cli/node";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

type Message = { readonly op: string; readonly [key: string]: unknown };

beforeAll(async () => {
  await build(root, { targets: ["desktop"] });
}, 180_000);

const text = (message: Message | undefined): string => JSON.stringify(message ?? {});

describe("the documentation site in a window", () => {
  it("draws the home page and a guide page, titled as the web titles them, and follows a link", async () => {
    const child = spawn(process.execPath, [join(root, "dist/desktop/engine.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
    const seen: Array<Message> = [];

    createInterface({ input: child.stdout }).on("line", (line) => void seen.push(JSON.parse(line) as Message));

    const until = async (done: () => boolean): Promise<void> => {
      for (let tries = 0; !done(); tries += 1) {
        if (tries > 1000) {
          throw new Error(`timed out; saw ${JSON.stringify(seen).slice(0, 300)}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    };

    try {
      await until(() => seen.some((message) => message.op === "draw"));
      expect(seen.find((message) => message.op === "title")).toMatchObject({ title: "Notes" });
      expect(text(seen.find((message) => message.op === "draw"))).toContain("Getting started");

      child.stdin.write(`${JSON.stringify({ op: "link", href: "/guide/getting-started" })}\n`);
      await until(() => seen.some((message) => message.op === "title" && String(message["title"]).startsWith("Getting started")));
      expect([...seen].reverse().find((message) => message.op === "title")).toMatchObject({ title: "Getting started · Notes" });

      // Back goes to where the person was, and Forward to where they came from: the trail, for a window with no browser history
      const button = (label: string) => {
        const found: Array<{ readonly component?: string; readonly events?: Record<string, string>; readonly children?: ReadonlyArray<unknown>; readonly text?: string }> = [];
        const walk = (node: { readonly component?: string; readonly events?: Record<string, string>; readonly children?: ReadonlyArray<never> }): void => {
          found.push(node);
          node.children?.forEach(walk);
        };
        const latest = [...seen].reverse().find((message) => message.op === "draw" || message.op === "update") as unknown as { readonly tree: { readonly root: never } };

        walk(latest.tree.root);

        return found.find((node) => node.component === "button" && JSON.stringify(node.children).includes(`"text":"${label}"`));
      };

      child.stdin.write(`${JSON.stringify({ op: "event", handler: button("Back")!.events!["click"]! })}\n`);
      await until(() => [...seen].reverse().find((message) => message.op === "title")?.["title"] === "Notes");
      child.stdin.write(`${JSON.stringify({ op: "event", handler: button("Forward")!.events!["click"]! })}\n`);
      await until(() => [...seen].reverse().find((message) => message.op === "title")?.["title"] === "Getting started · Notes");
    } finally {
      child.stdin.write('{"op":"close"}\n');
      await new Promise((resolve) => child.on("exit", resolve));
    }
  }, 120_000);
});

describe.skipIf(process.platform !== "linux")("a link to an address elsewhere", () => {
  it("goes to the system's opener when it is a web page, and to nothing when it is not", async () => {
    const bin = mkdtempSync(join(tmpdir(), "vlx-bin-"));
    const log = join(bin, "opened.log");

    // a stand-in for the system's opener, first on the engine's PATH
    writeFileSync(join(bin, "xdg-open"), `#!/bin/sh\necho "$1" >> ${JSON.stringify(log)}\n`);
    chmodSync(join(bin, "xdg-open"), 0o755);

    const child = spawn(process.execPath, [join(root, "dist/desktop/engine.mjs")], {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}` },
    });
    const seen: Array<Message> = [];

    createInterface({ input: child.stdout }).on("line", (line) => void seen.push(JSON.parse(line) as Message));

    try {
      for (let tries = 0; !seen.some((message) => message.op === "draw"); tries += 1) {
        if (tries > 1000) {
          throw new Error("timed out");
        }

        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      for (const href of ["https://example.com/docs", "file:///etc/passwd", "javascript:alert(1)"]) {
        child.stdin.write(`${JSON.stringify({ op: "link", href })}\n`);
      }

      for (let tries = 0; !existsSync(log) && tries < 200; tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["https://example.com/docs"]);
    } finally {
      child.stdin.write('{"op":"close"}\n');
      await new Promise((resolve) => child.on("exit", resolve));
    }
  }, 120_000);
});
