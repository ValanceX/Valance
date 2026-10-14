// One application, two targets: build both from this project, then use the site's page and the desktop engine the way a person would. The state and the commands are written once (src/main.ts);
// the checks below are what each target makes of them.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { build } from "@valancex/cli/node";
import type { Server } from "node:http";
import { chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serveStatic } from "./serve.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let server: Server | undefined;
let origin = "";

beforeAll(async () => {
  await build(root);
  ({ origin, server } = await serveStatic(join(root, "dist/web")));
});

afterAll(() => {
  server?.close();
});

describe("the web target", () => {
  it("draws the page with the to-do controls as the web's own elements", () => {
    const html = readFileSync(join(root, "dist/web/index.html"), "utf8");

    expect(html).toContain("To do");
    expect(html).toMatch(/<input[^>]*placeholder="What needs doing\?"/);
    expect(html).toContain("Clear done");
    expect(html).toContain("0 of 0 open");
    expect(html).toContain("<script");
  });
});

describe("the web target, in a browser", () => {
  it("hydrates, and the same commands change the page: typing, adding, ticking, clearing", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const errors: Array<string> = [];

    page.on("pageerror", (error) => void errors.push(error.message));

    try {
      await page.goto(`${origin}/`);
      await page.waitForSelector('#app[data-valance="running"], #app[data-valance="failed"]');
      expect(await page.getAttribute("#app", "data-valance")).toBe("running");

      await page.fill('input[placeholder="What needs doing?"]', "Milk");
      await page.click('button:text-is("Add")');
      await page.waitForSelector(".todo-list li");
      expect(await page.textContent(".todo-summary")).toBe("1 of 1 open");
      expect(await page.inputValue('input[placeholder="What needs doing?"]')).toBe("");
      expect(await page.textContent(".todo-list li")).toContain("Milk");

      await page.check('.todo-list input[type="checkbox"]');
      await page.waitForFunction(() => document.querySelector(".todo-summary")?.textContent === "0 of 1 open");
      await page.click('button:text-is("Clear done")');
      await page.waitForFunction(() => document.querySelectorAll(".todo-list li").length === 0);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});

type Message = { readonly op: string; readonly [key: string]: unknown };

const engine = () => {
  const child = spawn(process.execPath, [join(root, "dist/desktop/engine.mjs")], { stdio: ["pipe", "pipe", "inherit"] });
  const seen: Array<Message> = [];

  createInterface({ input: child.stdout }).on("line", (line) => void seen.push(JSON.parse(line) as Message));

  return {
    seen,
    send: (message: Message) => void child.stdin.write(`${JSON.stringify(message)}\n`),
    until: async (done: () => boolean) => {
      for (let tries = 0; !done(); tries += 1) {
        if (tries > 1000) {
          throw new Error(`timed out; saw ${JSON.stringify(seen).slice(0, 300)}`);
        }

        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
    close: async () => {
      child.stdin.write('{"op":"close"}\n');
      await new Promise((resolve) => child.on("exit", resolve));
    },
  };
};

interface Node {
  readonly component?: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly events?: Readonly<Record<string, string>>;
  readonly text?: string;
  readonly children?: ReadonlyArray<Node>;
}

/** The newest tree the engine has sent. */
const treeOf = (seen: ReadonlyArray<Message>): Node | undefined =>
  ([...seen].reverse().find((message) => message.op === "draw" || message.op === "update") as unknown as { readonly tree: { readonly root: Node } } | undefined)?.tree.root;
const all = (node: Node | undefined): ReadonlyArray<Node> => (node === undefined ? [] : [node, ...(node.children ?? []).flatMap(all)]);
const textOf = (node: Node): string => node.text ?? (node.children ?? []).map(textOf).join("");
const named = (seen: ReadonlyArray<Message>, component: string): ReadonlyArray<Node> => all(treeOf(seen)).filter((node) => node.component === component);
const buttonLabelled = (seen: ReadonlyArray<Message>, label: string): Node | undefined => named(seen, "button").find((node) => textOf(node) === label);

describe("the desktop target", () => {
  it("draws the same application in the desktop's vocabulary, and the same commands change it", async () => {
    const window = engine();

    try {
      await window.until(() => buttonLabelled(window.seen, "Clear done") !== undefined);
      expect(named(window.seen, "textfield")).toHaveLength(1);
      expect(named(window.seen, "checkbox")).toHaveLength(0);
      expect(all(treeOf(window.seen)).some((node) => node.text === "0 of 0 open")).toBe(true);

      // an image in the content is the file shipped beside the engine, by its absolute path: that is what the window decodes
      expect(named(window.seen, "image")[0]?.props).toMatchObject({ src: join(root, "dist/desktop/public/dot.png"), label: "A red square" });

      // typing reports `change` with the new text; the application owns the value
      window.send({ op: "event", handler: named(window.seen, "textfield")[0]!.events!["change"]!, payload: "Milk" });
      await window.until(() => named(window.seen, "textfield")[0]?.props?.["value"] === "Milk");
      window.send({ op: "event", handler: buttonLabelled(window.seen, "Add")!.events!["click"]! });
      await window.until(() => named(window.seen, "checkbox").length === 1);
      expect(named(window.seen, "textfield")[0]!.props!["value"]).toBe("");
      expect(all(treeOf(window.seen)).some((node) => node.text === "Milk")).toBe(true);
      expect(all(treeOf(window.seen)).some((node) => node.text === "1 of 1 open")).toBe(true);

      // ticking reports `change` with a boolean; removing is a click
      window.send({ op: "event", handler: named(window.seen, "checkbox")[0]!.events!["change"]!, payload: true });
      await window.until(() => named(window.seen, "checkbox")[0]?.props?.["checked"] === true);
      window.send({ op: "event", handler: buttonLabelled(window.seen, "Clear done")!.events!["click"]! });
      await window.until(() => named(window.seen, "checkbox").length === 0);
    } finally {
      await window.close();
    }
  });
});
