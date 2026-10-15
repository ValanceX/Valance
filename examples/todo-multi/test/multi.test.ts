// One application, two targets: build both from this project, then use the site's page and the desktop engine the way a person would. The state and the commands are written once (src/main.ts);
// the checks below are what each target makes of them.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

      // Enter in the field is the same as pressing Add
      await page.fill('input[placeholder="What needs doing?"]', "Bread");
      await page.press('input[placeholder="What needs doing?"]', "Enter");
      await page.waitForFunction(() => document.querySelectorAll(".todo-list li").length === 2);
      expect(await page.inputValue('input[placeholder="What needs doing?"]')).toBe("");

      // Escape in the field backs out of what was typed
      await page.fill('input[placeholder="What needs doing?"]', "Never mind");
      await page.press('input[placeholder="What needs doing?"]', "Escape");
      await page.waitForFunction(() => (document.querySelector('input[placeholder="What needs doing?"]') as HTMLInputElement).value === "");
      expect(await page.locator(".todo-list li").count()).toBe(2);

      // the items outlive the page: reloaded, they are back (the page's storage, through the Store capability)
      await page.reload();
      await page.waitForSelector('#app[data-valance="running"]');
      await page.waitForSelector(".todo-list li");
      expect(await page.textContent(".todo-list li")).toContain("Milk");

      await page.check('.todo-list li:first-child input[type="checkbox"]');
      await page.waitForFunction(() => document.querySelector(".todo-summary")?.textContent === "1 of 2 open");
      await page.click('button:text-is("Clear done")');
      await page.waitForFunction(() => document.querySelectorAll(".todo-list li").length === 1); // Bread is left
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });
});

describe("the system's colors, in the browser", () => {
  it("follows the system until the person chooses, then keeps the choice", async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage({ colorScheme: "dark" });

    try {
      await page.goto(`${origin}/`);
      await page.waitForSelector('#app[data-valance="running"]');
      await page.waitForFunction(() => document.querySelector("#app > [data-theme]")?.getAttribute("data-theme") === "dark");

      await page.emulateMedia({ colorScheme: "light" });
      await page.waitForFunction(() => document.querySelector("#app > [data-theme]")?.getAttribute("data-theme") === "light");

      await page.click(".theme-toggle"); // the person chooses: dark, whatever the system says
      await page.waitForFunction(() => document.querySelector("#app > [data-theme]")?.getAttribute("data-theme") === "dark");
      await page.emulateMedia({ colorScheme: "dark" });
      await page.emulateMedia({ colorScheme: "light" });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await page.getAttribute("#app > [data-theme]", "data-theme")).toBe("dark");
    } finally {
      await browser.close();
    }
  });
});

type Message = { readonly op: string; readonly [key: string]: unknown };

const engine = (dataHome: string = mkdtempSync(join(tmpdir(), "vlx-data-"))) => {
  const child = spawn(process.execPath, [join(root, "dist/desktop/engine.mjs")], {
    stdio: ["pipe", "pipe", "inherit"],
    env: { ...process.env, ...(dataHome === undefined ? {} : { XDG_DATA_HOME: dataHome }) },
  });
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

      // Enter in the field reports `submit`: the same command as Add
      window.send({ op: "event", handler: named(window.seen, "textfield")[0]!.events!["change"]!, payload: "Eggs" });
      await window.until(() => named(window.seen, "textfield")[0]?.props?.["value"] === "Eggs");
      window.send({ op: "event", handler: named(window.seen, "textfield")[0]!.events!["submit"]! });
      await window.until(() => named(window.seen, "checkbox").length === 2);

      // Escape reports `cancel`: the entry is cleared, nothing is added
      window.send({ op: "event", handler: named(window.seen, "textfield")[0]!.events!["change"]!, payload: "Never mind" });
      await window.until(() => named(window.seen, "textfield")[0]?.props?.["value"] === "Never mind");
      window.send({ op: "event", handler: named(window.seen, "textfield")[0]!.events!["cancel"]! });
      await window.until(() => named(window.seen, "textfield")[0]?.props?.["value"] === "");
      expect(named(window.seen, "checkbox").length).toBe(2);

      // ticking reports `change` with a boolean; removing is a click
      window.send({ op: "event", handler: named(window.seen, "checkbox")[0]!.events!["change"]!, payload: true });
      await window.until(() => named(window.seen, "checkbox")[0]?.props?.["checked"] === true);
      window.send({ op: "event", handler: buttonLabelled(window.seen, "Clear done")!.events!["click"]! });
      await window.until(() => named(window.seen, "checkbox").length === 1);
    } finally {
      await window.close();
    }
  });
});

describe("the system's colors, in the window", () => {
  it("are told to the application, and the application's appearance is asked of the window", async () => {
    const window = engine();

    try {
      await window.until(() => window.seen.some((message) => message.op === "draw") && window.seen.some((message) => message.op === "appearance"));
      expect(window.seen.find((message) => message.op === "appearance")).toMatchObject({ appearance: "system" });
      expect(window.seen.findIndex((message) => message.op === "appearance")).toBeLessThan(window.seen.findIndex((message) => message.op === "draw"));

      // the window tells the engine the system is dark; the application's state follows (it is `colorScheme` to a layout), and nothing is drawn differently here, so ask for it
      window.send({ op: "scheme", scheme: "dark" });
      await window.until(() => buttonLabelled(window.seen, "Appearance: system") !== undefined);
      window.send({ op: "event", handler: buttonLabelled(window.seen, "Appearance: system")!.events!["click"]! });
      await window.until(() => window.seen.some((message) => message.op === "appearance" && message["appearance"] === "light"));
      await window.until(() => buttonLabelled(window.seen, "Appearance: light") !== undefined); // the screen follows the appearance message
      window.send({ op: "event", handler: buttonLabelled(window.seen, "Appearance: light")!.events!["click"]! });
      await window.until(() => window.seen.some((message) => message.op === "appearance" && message["appearance"] === "dark"));
    } finally {
      await window.close();
    }
  });
});

describe("what outlives a run", () => {
  it("is kept by the web's storage and by the desktop's data directory alike: an item added to the window is there when the engine starts again", async () => {
    const dataHome = mkdtempSync(join(tmpdir(), "vlx-data-"));
    const first = engine(dataHome);

    try {
      await first.until(() => buttonLabelled(first.seen, "Clear done") !== undefined);
      first.send({ op: "event", handler: named(first.seen, "textfield")[0]!.events!["change"]!, payload: "Eggs" });
      await first.until(() => named(first.seen, "textfield")[0]?.props?.["value"] === "Eggs");
      first.send({ op: "event", handler: buttonLabelled(first.seen, "Add")!.events!["click"]! });
      await first.until(() => all(treeOf(first.seen)).some((node) => node.text === "Eggs"));
      await first.until(() => existsSync(join(dataHome, "todo-multi", "state.json")));
    } finally {
      await first.close();
    }

    expect(JSON.parse(readFileSync(join(dataHome, "todo-multi", "state.json"), "utf8"))).toMatchObject({ items: [{ title: "Eggs", done: false }] });

    const second = engine(dataHome);

    try {
      await second.until(() => all(treeOf(second.seen)).some((node) => node.text === "Eggs"));
      expect(named(second.seen, "textfield")[0]?.props?.["value"]).toBe(""); // the draft is not kept
    } finally {
      await second.close();
    }
  });
});
