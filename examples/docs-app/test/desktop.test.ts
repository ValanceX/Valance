// The same application, a second target: the documentation site's content, state and commands are untouched; `vlx generate target desktop` added a layout of its own. Its built engine draws the
// pages in the window's vocabulary and follows a link by the application's own `go` command, as the browser's click does.
import { build } from "@valancex/cli/node";
import { spawn } from "node:child_process";
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
    } finally {
      child.stdin.write('{"op":"close"}\n');
      await new Promise((resolve) => child.on("exit", resolve));
    }
  }, 120_000);
});
