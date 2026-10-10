// §11 security and trust: the defaults a consumer gets without thinking about it. Untrusted data must stay data (text stays text, a URL cannot run code), and a secret a failure carries
// must not be written to a log by the library on the consumer's behalf.
import * as Web from "@valancex/valance/web";
import { createWebPort } from "@valancex/port-web";
import * as Valance from "@valancex/valance";
import { Effect, Exit, Scope } from "effect";
import { JSDOM } from "jsdom";
import { afterAll, expect, it, vi } from "vitest";

import { counter } from "./fixture.js";
import { evidence } from "./evidence.js";

const seen = evidence("security");

afterAll(() => { seen.write(); });

const tree = (component: string, props: Record<string, unknown>, children: ReadonlyArray<unknown> = []) =>
  ({ format: "mesh-render", version: 1, root: { type: "node", key: "k", component, props, events: {}, children } }) as never;

const draw = (component: string, props: Record<string, unknown>, children: ReadonlyArray<unknown> = []) => {
  const { window } = new JSDOM("<!doctype html><div id=r></div>");
  const container = window.document.getElementById("r")!;
  const port = createWebPort({ container, primitives: { link: Web.link, para: { element: "p" } }, report: () => undefined });

  port.draw(tree(component, props, children));

  return container;
};

it("text from data is text: markup in a value is shown, never parsed", () => {
  const container = draw("para", {}, [{ type: "text", key: "t", text: "<img src=x onerror=alert(1)><script>alert(1)</script>" }]);

  seen.record("text.html", container.innerHTML);
  expect(container.querySelector("img")).toBeNull();
  expect(container.querySelector("script")).toBeNull();
  expect(container.textContent).toContain("<script>");
});

it.fails("a link whose destination is data: a javascript: URL is not left live (§11 secure defaults)", () => {
  const container = draw("link", { href: "javascript:alert(1)" }, [{ type: "text", key: "t", text: "x" }]);
  const href = container.querySelector("a")?.getAttribute("href") ?? null;

  seen.record("link.javascriptUrl", { href, html: container.innerHTML });
  expect(href === null || !/^\s*javascript:/i.test(href)).toBe(true);
});

it("a secret in a command's failure is returned to the caller and is not written to the console by Valance", async () => {
  const lines: Array<string> = [];
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((name) => vi.spyOn(console, name).mockImplementation((...args: Array<unknown>) => { lines.push(args.map(String).join(" ")); }));
  const app = await counter({ secret: "s3cr3t-token" });
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
  const failure = await Effect.runPromise(Effect.flip(handle.invoke("app/leak", [])));

  await Effect.runPromise(Scope.close(scope, Exit.void));
  spies.forEach((spy) => spy.mockRestore());
  seen.record("secret.returnedToCaller", JSON.stringify(failure));
  seen.record("secret.consoleLines", lines);
  expect(JSON.stringify(failure)).toContain("s3cr3t-token");                          // the caller owns it
  expect(lines.join("\n")).not.toContain("s3cr3t-token");
});

it.fails("a secret in the failure of start-time work: where does it go?", async () => {
  const lines: Array<string> = [];
  const spies = (["log", "info", "warn", "error", "debug"] as const).map((name) => vi.spyOn(console, name).mockImplementation((...args: Array<unknown>) => { lines.push(args.map(String).join(" ")); }));
  const app = await counter({ secret: "s3cr3t-token" }, "leak");
  const scope = await Effect.runPromise(Scope.make());
  const started = await Effect.runPromise(Effect.exit(Valance.start(app).pipe(Scope.extend(scope))));

  await Effect.runPromise(Scope.close(scope, Exit.void));
  spies.forEach((spy) => spy.mockRestore());
  seen.record("startSecret.exit", Exit.isFailure(started) ? "failure" : "success");
  seen.record("startSecret.consoleLines", lines);
  expect(lines.join("\n")).not.toContain("s3cr3t-token");                              // §11: a library does not log what a failure carries
});
