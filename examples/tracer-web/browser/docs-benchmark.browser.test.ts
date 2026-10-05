// The documentation-site benchmark in real Chromium: the server's guide page (rendered in Node by ./docs-benchmark-setup.ts) is hydrated by `Web.run`; real clicks on real
// anchors, real typing into the search box, the browser's real history. A gate per search makes the stale-answer case deterministic. The application is src/docs-benchmark/app.ts.
import * as Web from "@valancex/valance/web";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { userEvent } from "@vitest/browser/context";
import { beforeAll, expect, inject, it } from "vitest";

import { application, stateOf, urlOf, type SearchDocs } from "../src/docs-benchmark/app.js";
import { primitives } from "../src/docs-benchmark/web.js";

const served = inject("docs");

beforeAll(async () => { await init(wasmUrl); });

type Hit = ReadonlyArray<{ readonly id: string; readonly title: string }>;
const calls: Array<{ readonly query: string; readonly resolve: (hits: Hit) => void; readonly reject: (reason: string) => void; aborted: boolean }> = [];
const searchDocs: SearchDocs = (query, signal) => new Promise<Hit>((resolve, reject) => {
  const call = { query, resolve, reject, aborted: false };

  signal.addEventListener("abort", () => { call.aborted = true; });
  calls.push(call);
});

const until = async (check: () => boolean) => { await expect.poll(check, { timeout: 4000 }).toBe(true); };

it("a hydrated guide: sidebar and prev/next navigation keep keyed identity, the browser's Back/Forward follow, search shows loading/results/failure and drops a stale answer", async () => {
  history.replaceState(null, "", "/docs/guides/state");                  // "the server served this URL"

  const root = document.createElement("div");

  root.innerHTML = served.guide.html;
  document.body.append(root);

  const adopted = [...root.querySelectorAll("nav > ul > li")];
  const link = (label: string) => [...root.querySelectorAll("a")].find((candidate) => candidate.textContent === label)!;
  const title = () => root.querySelector("main > h1")!.textContent;
  const status = () => root.querySelector("header > span")?.textContent;
  const results = () => [...root.querySelectorAll("header ul a")].map((a) => a.textContent).join();
  const host = await Web.run(application(served.programs, searchDocs), { container: root, primitives, present: "hydrate", state: served.guide.state, history: { window, urlOf, stateOf, navigate: "app/navigate" } });

  // hydration adopted the server's elements, and the document is still this page after real clicks on real anchors
  expect(host.mounted.hydration).toMatchObject({ adopted: true });
  expect([...root.querySelectorAll("nav > ul > li")]).toEqual(adopted);

  await userEvent.click(link("Reference: API"));
  await until(() => title() === "API");
  expect(location.pathname).toBe("/docs/reference/api");                // pushed by history; the document itself was not navigated
  expect([...root.querySelectorAll("nav > ul > li")]).toEqual(adopted); // keyed identity: the same <li> elements after navigation
  await userEvent.click(link("Configuration →"));
  await until(() => title() === "Configuration");
  history.back();
  await until(() => title() === "API");
  history.forward();
  await until(() => title() === "Configuration");

  // search: loading, then a newer query's answer wins over an older query's late one; then a failure
  const box = root.querySelector("input")!;

  await userEvent.type(box, "a");
  await until(() => calls.length === 1 && status() === "Searching…");
  await userEvent.type(box, "s");
  await until(() => calls.length === 2);
  calls[1]!.resolve([{ id: "async-work", title: "Async Work" }]);
  await until(() => results() === "Async Work");
  calls[0]!.resolve([{ id: "api", title: "API" }]);                     // the stale one, late
  await new Promise((r) => setTimeout(r, 50));
  expect(results()).toBe("Async Work");

  await userEvent.type(box, "z");
  await until(() => calls.length === 3);
  calls[2]!.reject("offline");
  await until(() => status() === "Search failed: offline");

  await userEvent.click(link("Guides: State"));                         // picking a page closes the search
  await until(() => title() === "State" && status() === undefined);
  await host.stop();
  root.remove();
});
