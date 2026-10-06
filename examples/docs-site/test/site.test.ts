// The site without a browser: the document the server renders, its title, the search the browser calls, and the application's commands against a service the test supplies.
import * as Valance from "@valancex/valance";
import { Effect, Exit, Scope } from "effect";
import { expect, it } from "vitest";

import { application, initial, titleOf } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import { renderDocument } from "../src/document.js";
import { searchPages } from "../src/serve.js";

it("a page is rendered on the server: the title follows the state, the links are anchors, the search box is a field", async () => {
  const html = await renderDocument("/docs/guides/state", "/assets/page.js");

  expect(html).toContain("<title>State · Valance</title>");
  expect(html).toContain('<a href="/docs/guides/async-work"');
  expect(html).toMatch(/<input[^>]*value=""/);
  expect(html).toContain("Commands are the only way to change it.");
  expect(html).toContain('<script type="module" src="/assets/page.js"></script>');
  expect(html).toMatch(/id="valance-boot"/);
});

it("the home page and an unknown page", async () => {
  expect(await renderDocument("/", "/assets/page.js")).toContain("<title>Valance</title>");
  expect(titleOf({ ...initial, page: "nowhere" })).toBe("Valance");
});

it("search finds pages by title or text, and nothing for an empty query", () => {
  expect(searchPages("async").map(({ id }) => id)).toContain("async-work");
  expect(searchPages("  ")).toEqual([]);
  expect(searchPages("zzzz")).toEqual([]);
});

it("the search command shows loading, then results; a newer search wins; going to a page discards the answer still in flight", async () => {
  const programs = await compilePrograms();
  const gates = new Map<string, (answer: ReadonlyArray<{ id: string; title: string }>) => void>();
  const app = application(programs, (query) => new Promise((resolve) => { gates.set(query, resolve); }));
  const scope = Effect.runSync(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
  const state = () => Effect.runSync(handle.state as never) as typeof initial;
  const until = async (done: () => boolean) => { for (let turn = 0; turn < 200 && !done(); turn += 1) { await new Promise((resolve) => setTimeout(resolve, 5)); } };

  void Effect.runFork(handle.invoke("app/search", [{ value: "sta" }]) as never);
  await until(() => gates.has("sta"));
  expect(state().search.status).toBe("loading");

  void Effect.runFork(handle.invoke("app/search", [{ value: "state" }]) as never);
  await until(() => gates.has("state"));
  gates.get("sta")!([{ id: "introduction", title: "Introduction" }]);                 // the older answer arrives after the newer search began
  gates.get("state")!([{ id: "state", title: "State" }]);
  await until(() => state().search.status === "done");
  expect(state().search.results).toEqual([{ id: "state", label: "State" }]);

  void Effect.runFork(handle.invoke("app/search", [{ value: "api" }]) as never);
  await until(() => gates.has("api"));
  await Effect.runPromise(handle.invoke("app/go", [{ value: "api" }]) as never);
  gates.get("api")!([{ id: "api", title: "API" }]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(state().page).toBe("api");
  expect(state().search.status).toBe("idle");                                            // the stale answer did not land

  await Effect.runPromise(Scope.close(scope, Exit.void));
});
