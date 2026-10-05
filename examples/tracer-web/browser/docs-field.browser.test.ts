// Controlled field through the real site, real Chromium: SSR value, hydration, typing, state-driven clearing and replacement, a focused caret. Needs @valancex/port-web >= 0.3.0 (`controlled`).
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { userEvent } from "@vitest/browser/context";
import { Effect } from "effect";
import { beforeAll, expect, inject, it } from "vitest";

import { application, stateFor, stateOf, urlOf } from "../src/docs-benchmark/app.js";
import { primitives } from "../src/docs-benchmark/web.js";

const served = inject("docs");
beforeAll(async () => { await init(wasmUrl); });
const calls: Array<{ resolve: (hits: ReadonlyArray<{ id: string; title: string }>) => void }> = [];
const searchDocs = () => new Promise<ReadonlyArray<{ id: string; title: string }>>((resolve) => { calls.push({ resolve }); });

it("server-rendered non-empty value, hydration, typing, clearing, replacement and a focused caret", async () => {
  history.replaceState(null, "", "/docs/guides/state");
  const base = stateFor("/docs/guides/state");
  const ssr = await Effect.runPromise(renderToHtml(application(served.programs, searchDocs), { primitives, state: { ...base, search: { ...base.search, query: "async", status: "done" as const, results: [] } } }));

  expect(ssr.html).toContain('<input value="async">');                                          // the server wrote the value as the attribute

  const root = document.createElement("div");
  root.innerHTML = ssr.html;
  document.body.append(root);
  const original = root.querySelector("input")!;
  const host = await Web.run(application(served.programs, searchDocs), { container: root, primitives, present: "hydrate", state: ssr.state, history: { window, urlOf, stateOf, navigate: "go" } });
  const state = async () => (await Effect.runPromise(host.handle.state as never)) as any;
  const box = root.querySelector("input")!;

  expect(host.mounted.hydration).toEqual({ adopted: true });                                    // hydration verified the same attribute
  expect(box).toBe(original);
  expect(box.value).toBe("async");                                                              // the property agrees with what the server rendered

  // typing: every character kept, state and box agree
  await userEvent.clear(box);
  await userEvent.type(box, "documentation-search");
  await expect.poll(async () => (await state()).search.query).toBe("documentation-search");
  expect(box.value).toBe("documentation-search");

  // state-driven replacement: the application changes the query (a command, not the user); the box follows; a focused caret in the middle keeps its place
  await userEvent.clear(box);
  await userEvent.type(box, "abXc");
  box.focus();
  box.setSelectionRange(3, 3);
  Effect.runFork(host.handle.invoke("app/search", [{ value: "abYc" }]) as never);              // the application changes the text (same length); an invoked waiting command is not awaited here
  await expect.poll(() => box.value).toBe("abYc");
  expect(document.activeElement).toBe(box);
  expect(box.selectionStart).toBe(3);

  // state-driven clearing: picking a page closes the search
  await userEvent.click([...root.querySelectorAll("a")].find((a) => a.textContent === "Reference: API")!);
  await expect.poll(async () => (await state()).page).toBe("api");
  expect(box.value).toBe("");
  expect(root.querySelector("input")).toBe(box);
  await host.stop();
  root.remove();
});
