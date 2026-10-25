// A component's unit (direction Bet 8, WP5): state of one occurrence, declared with the component, invisible to the application. The acceptance: a disclosure's open state survives a re-sort of its
// list row and is absent from the application's state. Built with `vlx build` and drawn in a browser; the checks of the contract are `vlx check`'s.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { chromium } from "playwright";
import * as MeshRuntime from "@valancex/mesh-runtime";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { check } from "../src/check.js";
import { entryOf } from "../src/contract.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

// Units need a MESH runtime that has them (0.15).
const supported = typeof (MeshRuntime as { readonly raise?: unknown }).raise === "function";

const MAIN = (
  unit = "unit({ state: { open: field(Schema.Boolean, false) }, commands: { toggle: (state) => ({ open: !state.open }) } })",
): string => `import { component, defineApp, field, unit } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import disclosure from "./disclosure.mprx";

const Item = Schema.Struct({ id: Schema.String, name: Schema.String });

export default defineApp({
  state: { items: field(Schema.Array(Item), [{ id: "a", name: "Ann" }, { id: "b", name: "Bo" }, { id: "c", name: "Cy" }]) },
  commands: (command) => ({ reverse: command((state) => ({ ...state, items: [...state.items].reverse() })) }),
  layout: component(layout),
  components: [component(disclosure, { props: { label: Schema.String }, events: {}, unit: ${unit} })],
});
`;
const FILES = (main = MAIN()): Record<string, string> => ({
  "content/index.md": PAGE("Home", "Text."),
  "src/main.ts": main,
  "src/layout.mprx":
    '<shell class="x" theme="light">{#each items as item (item.id)}<disclosure label={item.name} />{/each}<button class="reverse" on.click={reverse()}>Reverse</button></shell>',
  "src/disclosure.mprx": '<div class="d"><button class="t" on.click={toggle()}>{label}</button>{#if open}<span class="body">open {label}</span>{/if}</div>',
});

describe("the model a unit makes", () => {
  it("joins the unit's state to the scope and its commands to the commands, with their types, defaults and parameters", async () => {
    const { Schema } = await import("effect");
    const { field, unit, unitCommand } = await import("@valancex/common");
    const declared = unit({
      state: { at: field(Schema.Number, 0), open: field(Schema.Boolean, false) },
      controllable: ["at"],
      commands: {
        toggle: (state) => ({ open: !state.open }),
        select: unitCommand({ params: { n: Schema.Number }, run: (_state: any, { n }: { n: number }) => ({ at: n }), raises: { change: (next: any) => next.at } }) as never,
      },
    });
    const { entry, problems } = entryOf({ props: { at: Schema.UndefinedOr(Schema.Number) }, events: { change: Schema.Number }, unit: declared });

    expect(problems).toEqual([]);
    expect(entry.unit).toEqual({
      state: { at: { type: { kind: "number" }, default: 0, controllable: true }, open: { type: { kind: "boolean" }, default: false } },
      commands: { toggle: { parameters: [] }, select: { parameters: [{ name: "n", type: { kind: "number" } }] } },
    });
  });

  it("refuses a controllable field with no prop of its name, at the declaration", async () => {
    const { Schema } = await import("effect");
    const { field, unit } = await import("@valancex/common");
    const { problems } = entryOf({ props: {}, events: {}, unit: unit({ state: { at: field(Schema.Number, 0) }, controllable: ["at"], commands: {} }) });

    expect(problems.map((each) => `${each.kind} ${each.name}`)).toEqual(["unit at"]);
    expect(problems[0]!.reason).toContain("prop of the same name");
  });
});

describe.skipIf(!supported)("a unit in a project", () => {
  it("checks clean, and a template that reads a state name the unit does not have is a diagnostic at that template", async () => {
    expect((await check(project(FILES()))).diagnostics).toEqual([]);

    const wrong = { ...FILES(), "src/disclosure.mprx": FILES()["src/disclosure.mprx"]!.replace("{#if open}", "{#if opened}") };
    const found = (await check(project(wrong))).diagnostics.map(({ file, code }) => `${file} ${code}`);

    expect(found).toEqual(["src/disclosure.mprx unknown-reference"]);
  });
});

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
const browserAvailable = await chromium
  .launch()
  .then(async (browser) => {
    await browser.close();

    return true;
  })
  .catch(() => false);

describe.runIf(browserAvailable && supported)("built and drawn in a browser", () => {
  it("a disclosure's open state follows its row when the list is re-sorted, and is not application state", async () => {
    const root = project(FILES());

    await build(root);

    const dist = normalize(join(root, "dist/web"));
    const server = createServer((request, response) => {
      void (async () => {
        const url = new URL(request.url ?? "/", "http://x").pathname;
        const path = normalize(join(dist, url.endsWith("/") ? `${url}index.html` : url));

        if (!path.startsWith(dist + sep)) {
          response.writeHead(403).end();
          return;
        }

        try {
          response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(await readFile(path));
        } catch {
          response.writeHead(404).end();
        }
      })();
    });

    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));

    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const browser = await chromium.launch();

    try {
      const page = await browser.newPage();
      const errors: Array<string> = [];

      page.on("pageerror", (error) => void errors.push(error.message));
      await page.goto(`${origin}/`);
      await page.waitForSelector('#app[data-valance="running"], #app[data-valance="failed"]');
      expect(await page.getAttribute("#app", "data-valance")).toBe("running");
      expect(await page.locator(".t").allTextContents()).toEqual(["Ann", "Bo", "Cy"]);
      expect(await page.locator(".body").count()).toBe(0);

      await page.locator(".t").nth(1).click();
      await page.waitForSelector(".body");
      expect(await page.locator(".d").allTextContents()).toEqual(["Ann", "Boopen Bo", "Cy"]);

      await page.click(".reverse");
      await page.waitForFunction(() => document.querySelector(".t")?.textContent === "Cy");
      // The same row is open, now in the middle by chance of three; reverse again after adding nothing: the order is Cy, Bo, Ann and the open one is Bo.
      expect(await page.locator(".d").allTextContents()).toEqual(["Cy", "Boopen Bo", "Ann"]);

      await page.locator(".t").nth(0).click();
      await page.waitForFunction(() => document.querySelectorAll(".body").length === 2);
      await page.click(".reverse");
      await page.waitForFunction(() => document.querySelector(".t")?.textContent === "Ann");
      expect(await page.locator(".d").allTextContents()).toEqual(["Ann", "Boopen Bo", "Cyopen Cy"]);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      server.close();
    }
  }, 120_000);
});
