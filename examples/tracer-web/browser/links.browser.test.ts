// Links in real Chromium: a real click on a real anchor of the server's page is the application's navigation (the document is not navigated: the page is alive afterwards),
// the URL is pushed, and the browser's real Back and Forward follow. Modified clicks, target, download and foreign origins are covered where their default action can be
// observed (test/links.test.ts, jsdom): a real Ctrl-click here would open a tab.
import * as Web from "@valancex/valance/web";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { userEvent } from "@vitest/browser/context";
import { beforeAll, expect, inject, it } from "vitest";

import { application, primitives, stateOf, urlOf } from "../test/links-fixture.js";

const served = inject("links");

beforeAll(async () => { await init(wasmUrl); });

it("hydrate the server's page; a real click navigates the application, not the document; Back and Forward follow", async () => {
  history.replaceState(null, "", "/app/home");                           // "the server served this URL"
  (window as unknown as { __alive?: boolean }).__alive = true;           // survives only if the document itself is never navigated

  const root = document.createElement("div");

  root.innerHTML = served.html;
  document.body.append(root);

  const about = [...root.querySelectorAll("a")].find((a) => a.textContent === "About")!;
  const title = () => root.querySelector("span")!.textContent;
  const host = await Web.run(application(served.program), { container: root, primitives, present: "hydrate", state: served.state, history: { window, urlOf, stateOf, navigate: "go" } });

  expect(host.mounted.hydration).toEqual({ adopted: true });
  expect(root.querySelectorAll("a")[1]).toBe(about);                      // the server's own anchor was adopted
  await userEvent.click(about);
  await expect.poll(() => title()).toBe("page about");
  expect(location.pathname).toBe("/app/about");
  expect((window as unknown as { __alive?: boolean }).__alive).toBe(true);
  history.back();
  await expect.poll(() => title()).toBe("page home");
  history.forward();
  await expect.poll(() => title()).toBe("page about");
  await host.stop();
  root.remove();
});

it("a plain link click starts at the top, as a page load does; the browser's Back restores the position it left", async () => {
  history.replaceState(null, "", "/app/home");

  const tall = document.createElement("style");

  tall.textContent = "body{margin:0} div{min-height:4000px}";
  document.head.append(tall);

  const root = document.createElement("div");

  root.innerHTML = served.html;
  document.body.append(root);

  const title = () => root.querySelector("span")!.textContent;
  const host = await Web.run(application(served.program), { container: root, primitives, present: "hydrate", state: served.state, history: { window, urlOf, stateOf, navigate: "go" } });

  console.log("SCROLLDBG height", document.documentElement.scrollHeight, "inner", window.innerHeight, "overflow", getComputedStyle(document.documentElement).overflow, getComputedStyle(document.body).overflow, "root h", root.getBoundingClientRect().height);
  window.scrollTo(0, 800);
  await expect.poll(() => window.scrollY).toBe(800);
  [...root.querySelectorAll("a")].find((a) => a.textContent === "About")!.click();   // a script click: a real one would first scroll the link into view
  await expect.poll(() => title()).toBe("page about");
  await expect.poll(() => window.scrollY).toBe(0);                        // a native link would have started at the top
  window.scrollTo(0, 1500);
  history.back();
  await expect.poll(() => title()).toBe("page home");
  await expect.poll(() => window.scrollY).toBe(800);                      // restored by the browser, not by VALANCE
  await host.stop();
  root.remove();
  tall.remove();
});
