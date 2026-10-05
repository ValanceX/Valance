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
  const host = await Web.run(application(served.program), { container: root, primitives, present: "hydrate", state: served.state, history: { window, urlOf, stateOf, navigate: "app/navigate" } });

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
