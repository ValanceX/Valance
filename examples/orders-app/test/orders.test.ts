import { build } from "@valancex/cli/node";
import type { Browser, Page, Route } from "playwright";
import { chromium } from "playwright";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The second reference application, built and served the way a static host serves it (a client route's address answered by the shell, from `_redirects`), with the backend answered by the test.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist/web");

let browser: Browser;
let server: Server;
let origin: string;

const ORDERS = [
  { id: "1", customer: "Ada", status: "open", total: 40, note: "gift" },
  { id: "2", customer: "Grace", status: "paid", total: 75, note: "" },
  { id: "3", customer: "Linus", status: "shipped", total: 12, note: "" },
];
const rowOf = (order: (typeof ORDERS)[number]) => ({ id: order.id, customer: order.customer, status: order.status, total: order.total });

beforeAll(async () => {
  await build(root);

  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };
  const rules = readFileSync(join(dist, "_redirects"), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.trim().split(/\s+/) as [string, string, string]);

  server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://x").pathname);
    const file = [join(dist, path), join(dist, path, "index.html")].find((each) => existsSync(each) && /\.[a-z0-9]+$/.test(each));
    const rule = rules.find(([from]) =>
      new RegExp(
        `^${from
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/:[A-Za-z_]+/g, "[^/]+")
          .replace(/\*/g, ".*")}/?$`,
      ).test(path),
    );

    if (file === undefined && rule !== undefined) {
      response.setHeader("content-type", "text/html");
      response.end(readFileSync(join(dist, rule[1].replace(/^\//, ""))));
      return;
    }

    response.statusCode = file === undefined ? 404 : 200;
    response.setHeader("content-type", types[(file ?? "x.html").slice((file ?? "x.html").lastIndexOf("."))] ?? "application/octet-stream");
    response.end(readFileSync(file ?? join(dist, "404.html")));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  server?.close();
});

interface Backend {
  readonly page: Page;
  readonly calls: Array<string>;
  readonly errors: Array<string>;
  /** What PATCH answers: a status and a JSON body. */
  patch: { status: number; body: unknown };
}

const open = async (address: string): Promise<Backend> => {
  const page = await browser.newPage();
  const backend: Backend = { page, calls: [], errors: [], patch: { status: 200, body: undefined } };

  page.on("pageerror", (error) => backend.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !/status of (404|422|500)/.test(message.text())) {
      backend.errors.push(message.text());
    }
  });
  await page.route("**/api/orders**", (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = /\/orders\/(\w+)$/.exec(url.pathname)?.[1];

    backend.calls.push(`${request.method()} ${url.pathname}${url.search}`);

    if (request.method() === "PATCH") {
      const given = (request.postDataJSON() as { status: string }).status;
      const body = backend.patch.body ?? { ...ORDERS.find((order) => order.id === id), status: given };

      return route.fulfill({ status: backend.patch.status, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (id !== undefined) {
      const found = ORDERS.find((order) => order.id === id);

      return route.fulfill({ status: found === undefined ? 404 : 200, contentType: "application/json", body: JSON.stringify(found ?? {}) });
    }

    const status = url.searchParams.get("status");

    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ORDERS.filter((order) => status === null || order.status === status).map(rowOf)) });
  });
  await page.goto(`${origin}${address}`);
  await page.waitForSelector('#app[data-valance="running"]');

  return backend;
};

const rows = (page: Page) => page.locator(".rows li .row").allTextContents();

describe("the orders screen", () => {
  it("loads the list when the page opens, and the filter is the address", async () => {
    const { page, calls, errors } = await open("/orders");

    await page.waitForSelector(".rows li");
    expect(await rows(page)).toEqual(["#1 Ada", "#2 Grace", "#3 Linus"]);
    expect(await page.textContent(".hint")).toBe("Pick an order from the list.");
    await page.click('a.filter[href="/orders?status=paid"]');
    await page.waitForFunction(() => document.querySelectorAll(".rows li").length === 1);
    expect(await rows(page)).toEqual(["#2 Grace"]);
    expect(new URL(page.url()).search).toBe("?status=paid");
    expect(await page.getAttribute('a.filter[href="/orders?status=paid"]', "aria-current")).toBe("page");
    expect(calls).toEqual(["GET /api/orders", "GET /api/orders?status=paid"]);
    expect(errors).toEqual([]);
    await page.close();
  });

  it("opens an order beside the list, and the list is neither fetched again nor drawn again (the shell and its rows stay)", async () => {
    const { page, calls } = await open("/orders");

    await page.waitForSelector(".rows li");
    await page.evaluate(() => {
      const w = window as unknown as { __list: Element | null; __row: Element | null };

      w.__list = document.querySelector(".orders-shell .list");
      w.__row = document.querySelector(".rows li");
    });
    await page.click('a.row[href="/orders/2"]');
    await page.waitForSelector(".order-detail h2");
    expect(await page.textContent(".order-detail h2")).toBe("Order 2: Grace");
    expect(calls).toEqual(["GET /api/orders", "GET /api/orders/2"]); // the list was not asked for again
    expect(await page.evaluate(() => (window as unknown as { __list: Element | null }).__list === document.querySelector(".orders-shell .list"))).toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __row: Element | null }).__row === document.querySelector(".rows li"))).toBe(true);
    expect(await page.locator(".list .state").count()).toBe(0); // no "Loading orders…" came back
    await page.close();
  });

  it("opens straight on an order's address: the shell answers, and the list and the order both load", async () => {
    const { page, calls } = await open("/orders/3");

    await page.waitForSelector(".order-detail h2");
    expect(await page.textContent(".order-detail h2")).toBe("Order 3: Linus");
    expect(await rows(page)).toEqual(["#1 Ada", "#2 Grace", "#3 Linus"]);
    expect([...calls].sort()).toEqual(["GET /api/orders", "GET /api/orders/3"]);
    expect(await page.title()).toBe("Order 3 · Orders");
    await page.close();
  });

  it("changes a status, saves it, and the list shows it", async () => {
    const { page } = await open("/orders/1");

    await page.waitForSelector(".order-detail h2");
    expect(await page.isDisabled("button.save")).toBe(true);
    await page.getByRole("radio", { name: "Paid" }).check();
    expect(await page.isDisabled("button.save")).toBe(false);
    await page.click("button.save");
    await page.waitForFunction(() => document.querySelector(".order-detail .now")?.textContent === "paid");
    expect(await page.isDisabled("button.save")).toBe(true);
    expect(await page.locator(".rows li .status").first().textContent()).toBe("paid");
    await page.close();
  });

  it("shows the server's own reason when it would not make the change", async () => {
    const backend = await open("/orders/1");

    backend.patch = { status: 422, body: { error: "Cannot ship: payment pending" } };
    await backend.page.waitForSelector(".order-detail h2");
    await backend.page.getByRole("radio", { name: "Shipped" }).check();
    await backend.page.click("button.save");
    await backend.page.waitForSelector("#save-error");
    expect(await backend.page.textContent("#save-error")).toBe("Cannot ship: payment pending"); // decoded by the `errors` Schema the request gave
    expect(await backend.page.textContent(".order-detail .now")).toBe("open"); // nothing changed
    await backend.page.close();
  });

  it("will not leave an order with a status picked and not saved for another order", async () => {
    const { page } = await open("/orders/1");

    await page.waitForSelector(".order-detail h2");
    await page.getByRole("radio", { name: "Paid" }).check();
    await page.click('a.row[href="/orders/2"]');
    await page.waitForTimeout(200);
    expect(new URL(page.url()).pathname).toBe("/orders/1");
    expect(await page.textContent(".order-detail h2")).toBe("Order 1: Ada");
    await page.close();
  });
});
