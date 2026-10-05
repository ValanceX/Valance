// The items pressure test in real Chromium: the server's detail page (rendered in Node by ./items-setup.ts) is hydrated by `Web.run`, with real clicks and the real
// browser history. A gate per fetch makes the stale-result case deterministic. The application is src/items/app.ts; nothing here is specific to a browser except the host.
import * as Web from "@valancex/valance/web";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { userEvent } from "@vitest/browser/context";
import { beforeAll, expect, inject, it } from "vitest";

import { application, stateOf, urlOf, type FetchDetail } from "../src/items/app.js";
import { primitives } from "../src/items/web.js";

const served = inject("items");

beforeAll(async () => { await init(wasmUrl); });

const calls: Array<{ readonly id: string; readonly resolve: (text: string) => void; readonly reject: (reason: string) => void; aborted: boolean }> = [];
const fetchDetail: FetchDetail = (id, signal) => new Promise<string>((resolve, reject) => {
  const call = { id, resolve, reject, aborted: false };

  signal.addEventListener("abort", () => { call.aborted = true; });
  calls.push(call);
});

const until = async (check: () => boolean) => { await expect.poll(check, { timeout: 4000 }).toBe(true); };

it("deep link hydrates, loads, fails and recovers; overlapping picks keep the latest; the browser's Back supersedes; stop aborts", async () => {
  history.replaceState(null, "", "/items?item=b");                      // "the server served this URL"

  const main = document.createElement("main");

  main.innerHTML = served.detail.html;
  document.body.append(main);

  const original = main.firstElementChild!;
  const texts = () => [...main.querySelectorAll("span")].map((span) => span.textContent);
  const labels = () => [...main.querySelectorAll("button")].map((button) => button.textContent).join();
  const button = (label: string) => [...main.querySelectorAll("button")].find((candidate) => candidate.textContent === label)!;
  const host = await Web.run(application(served.programs, fetchDetail), { container: main, primitives, present: "hydrate", state: served.detail.state, history: { window, urlOf, stateOf, navigate: "app/navigate" } });

  // 1. hydration adopted the server's elements; the application's own start work fetches what the server could not
  expect(host.mounted.hydration).toMatchObject({ adopted: true });
  expect(main.firstElementChild).toBe(original);
  await until(() => calls.length === 1);
  expect(calls[0]!.id).toBe("b");
  calls[0]!.resolve("beta text");
  await until(() => texts()[1] === "beta text");

  // 2. Back (a click): the list, and the URL follows state
  await userEvent.click(button("Back"));
  await until(() => labels() === "Alpha,Beta,Gamma" && location.search === "");

  // 3. overlap: pick Alpha, then Gamma; Gamma completes, then Alpha: Gamma stays
  await userEvent.click(button("Alpha"));
  await until(() => calls.length === 2 && texts()[1] === "Loading…");
  history.back();                                                       // the browser's Back, mid-flight: popstate → the application's navigate → the list
  await until(() => labels() === "Alpha,Beta,Gamma");
  await userEvent.click(button("Gamma"));
  await until(() => calls.length === 3 && texts()[0] === "Gamma");
  calls[2]!.resolve("gamma text");
  await until(() => texts()[1] === "gamma text");
  calls[1]!.resolve("alpha text");                                      // the stale one, late
  await new Promise((r) => setTimeout(r, 50));
  expect(texts()).toEqual(["Gamma", "gamma text"]);
  expect(calls[1]!.aborted).toBe(false);                                // delivery dropped; the work itself was left alone

  // 4. failure is state and a view; Reload recovers
  await userEvent.click(button("Reload"));
  await until(() => calls.length === 4);
  calls[3]!.reject("offline");
  await until(() => texts()[1] === "Failed: offline");
  await userEvent.click(button("Reload"));
  await until(() => calls.length === 5);

  // 5. stopping the page ends the application: the request in flight is aborted
  await host.stop();
  await until(() => calls[4]!.aborted);
  main.remove();
});
