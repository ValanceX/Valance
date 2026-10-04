// Stage 16: a rapid navigation burst with the REAL browser history, under latest-state presentation. History follows the application's committed states in its own
// subscription (`Web.history`, C17), not the mount: every changed application URL is pushed whether or not the mount presented the state in between. The navigate
// command is the application's own (src/app.ts "app/navigate").
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Effect } from "effect";
import { beforeAll, expect, inject, it } from "vitest";

import { application, primitives, stateFor, urlOf } from "../src/app.js";

const { programs } = inject("page");

beforeAll(async () => { await init(wasmUrl); });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it("four navigations in one burst: four history pushes in order, the mount ends on the final view, Back is the same navigation", async () => {
  const container = document.createElement("main");
  const writes: Array<string> = [];
  const push = window.history.pushState.bind(window.history);
  const startUrl = "/tracer/?tab=overview";

  document.body.append(container);
  window.history.replaceState(null, "", startUrl);
  window.history.pushState = (data: unknown, unused: string, target?: string | URL | null) => { writes.push(String(target)); push(data, unused, target); };

  try {
    const outcome = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(application(programs), { state: stateFor(startUrl) });

      yield* Valance.mount(handle, Web.target({ container, primitives }));
      yield* Web.history(handle, { window, urlOf, stateOf: (url) => ({ path: url.pathname.endsWith("/about") ? "/about" : "/", tab: url.searchParams.get("tab") ?? "overview" }), navigate: "app/navigate" });
      yield* Effect.sleep("60 millis");

      const go = (path: string, tab: string) => handle.invoke("app/navigate", [{ value: { path, tab } }]);

      yield* Effect.gen(function* () { yield* go("/about", "overview"); yield* go("/", "overview"); yield* go("/about", "details"); yield* go("/", "details"); });   // one burst
      yield* Effect.sleep("300 millis");
      const afterBurst = { writes: [...writes], url: window.location.pathname + window.location.search, state: yield* handle.state, text: container.textContent };

      window.history.back();                                                      // Back: the browser's popstate → the same navigate command
      yield* Effect.sleep("300 millis");

      return { afterBurst, afterBack: { url: window.location.pathname + window.location.search, state: yield* handle.state, text: container.textContent } };
    })));

    expect(outcome.afterBurst.writes).toEqual(["/tracer/about?tab=overview", "/tracer/?tab=overview", "/tracer/about?tab=details", "/tracer/?tab=details"]);   // every changed URL
    expect(outcome.afterBurst.url).toBe("/tracer/?tab=details");
    expect(outcome.afterBurst.state).toMatchObject({ path: "/", tab: "details" });
    expect(outcome.afterBurst.text).toContain("clicks");                           // the final view (the counter) is what is presented
    expect(outcome.afterBack.url).toBe("/tracer/about?tab=details");
    expect(outcome.afterBack.state).toMatchObject({ path: "/about", tab: "details" });
    expect(outcome.afterBack.text).toContain("About");
    expect(writes).toHaveLength(4);                                                // Back wrote nothing
  } finally {
    window.history.pushState = push;
    window.history.forward();                                                     // leave no forward entry behind: the next page's push would truncate it (the joint session history is shared)
    await sleep(150);
    window.history.replaceState(null, "", startUrl);
    container.remove();
  }
});
