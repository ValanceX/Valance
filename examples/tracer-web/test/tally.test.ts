// The authoring pressure test: a small realistic application (src/tally), driven ONLY through the public API: Valance.define/start/mount/hydrate/
// invoke, Web.target/history, renderToHtml, with NEXUS for behavior. This file imports nothing from `./internal` and observes nothing of PORT:
// what it asserts is what a user sees (text, aria-label, the URL) and whether the elements stayed (a DOM fact, not a PORT operation).
//
//   three views, one state, one platform capability, SSR → hydrate, a second mount, URL ↔ path through history, Back.
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect, Layer } from "effect";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { Ticker, application, stateFor, stateOf, urlOf } from "../src/tally/app.js";
import { compilePrograms } from "../src/tally/compile.js";
import { primitives } from "../src/tally/web.js";
import { until } from "./helpers.js";

/** The platform: a Ticker backed by something with a lifetime, acquired at start and released with the application. */
const tickerPlatform = () => {
  const counts = { acquired: 0, released: 0 };
  const platform: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.map(
    Effect.acquireRelease(
      Effect.sync(() => { counts.acquired += 1; let n = 0; return { next: () => { n += 1; return n; } }; }),
      () => Effect.sync(() => { counts.released += 1; })
    ),
    (implementation) => ({ resolutions: new Map([[Ticker.id, { _tag: "Available" as const, implementation }]]) })
  ));

  return { counts, platform };
};

const source = (file: string): string => readFileSync(new URL(`../src/tally/${file}`, import.meta.url), "utf8");

describe("the authoring boundary", () => {
  it("the application definition imports only the public Valance entry, NEXUS (behavior) and effect; the Web table imports only the Web entry", () => {
    const importsOf = (text: string) => [...text.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

    expect(importsOf(source("app.ts")).sort()).toEqual(["@valancex/nexus", "@valancex/nexus", "@valancex/valance", "effect"]);
    expect(importsOf(source("web.ts"))).toEqual(["@valancex/valance/web"]);
  });

  it("three views, shared state, a capability, SSR → hydrate, two mounts and history, through the public API alone", async () => {
    const app = application(await compilePrograms());
    const served = await Effect.runPromise(renderToHtml(app, { primitives, state: stateFor("/tally/details") }));
    const dom = new JSDOM(`<!doctype html><main id="one">${served.html}</main><main id="two"></main>`, { url: "http://localhost/tally/details" });
    const win = dom.window as unknown as Window;
    const [one, two] = [dom.window.document.getElementById("one")!, dom.window.document.getElementById("two")!];
    const { counts, platform } = tickerPlatform();
    const writes: Array<string> = [];
    const push = win.history.pushState.bind(win.history);

    win.history.pushState = (data, unused, target) => { writes.push(String(target)); push(data, unused, target); };

    const text = (container: Element): string => container.querySelector("span")?.textContent ?? "";
    const section = (container: Element): Element | null => container.firstElementChild;
    const press = (container: Element, label: string): void => {
      [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    };
    const both = (expected: string, label?: string) => Effect.promise(() => until(() => text(one) === expected && text(two) === expected && (label === undefined || (section(one)?.getAttribute("aria-label") === label && section(two)?.getAttribute("aria-label") === label))));
    const trace: Array<{ step: string; one: string; two: string; sameSections: boolean; url: string }> = [];

    const final = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform, state: served.state });
      const adopted = yield* Valance.hydrate(handle, Web.target({ container: one, primitives }));
      yield* Valance.mount(handle, Web.target({ container: two, primitives }));
      yield* Web.history(handle, { window: win, urlOf, stateOf, navigate: "app/navigate" });
      yield* Effect.sleep("40 millis");
      expect(adopted.hydration).toEqual({ adopted: true });

      let before = [section(one), section(two)];
      const step = (name: string) => Effect.sync(() => {
        const now = [section(one), section(two)];
        trace.push({ step: name, one: text(one), two: text(two), sameSections: now[0] === before[0] && now[1] === before[1], url: win.location.pathname });
        before = now;
      });

      yield* step("served /details");
      press(one, "+1");                                  // a same-view change, from the hydrated mount
      yield* both("Details: 1 (tick 1)");
      yield* step("+1 on details");
      press(two, "Rename");                              // a same-view change, from the second mount
      yield* both("Details: 1 (tick 1)", "Totals");
      yield* step("rename");
      press(two, "Settings");                            // a view change, from the second mount
      yield* both("Settings: 1");
      yield* step("to settings");
      press(one, "+1");
      yield* both("Settings: 2");
      yield* step("+1 on settings");
      press(one, "Home");
      yield* both("Home: 2 (tick 2)", "Totals");
      yield* step("to home");
      win.history.back();                                // the browser's Back: the same navigation
      yield* both("Settings: 2", "Totals");
      yield* step("Back");

      return yield* handle.state;
    })));

    expect(trace).toEqual([
      { step: "served /details", one: "Details: 0 (tick 0)", two: "Details: 0 (tick 0)", sameSections: true, url: "/tally/details" },
      { step: "+1 on details", one: "Details: 1 (tick 1)", two: "Details: 1 (tick 1)", sameSections: true, url: "/tally/details" },
      { step: "rename", one: "Details: 1 (tick 1)", two: "Details: 1 (tick 1)", sameSections: true, url: "/tally/details" },
      { step: "to settings", one: "Settings: 1", two: "Settings: 1", sameSections: false, url: "/tally/settings" },
      { step: "+1 on settings", one: "Settings: 2", two: "Settings: 2", sameSections: true, url: "/tally/settings" },
      { step: "to home", one: "Home: 2 (tick 2)", two: "Home: 2 (tick 2)", sameSections: false, url: "/tally/" },
      { step: "Back", one: "Settings: 2", two: "Settings: 2", sameSections: false, url: "/tally/settings" },
    ]);
    expect(writes).toEqual(["/tally/settings", "/tally/"]);                          // Back wrote nothing
    expect(final).toEqual({ path: "/settings", label: "Totals", count: 2, tick: 2 });
    expect(counts).toEqual({ acquired: 1, released: 1 });
  });
});
