// The primitive vectors through the Web PORT in a real browser (Chromium, through Playwright): real clicks, real key presses, a real top layer. Nothing is declared unsupported here; a vector that
// fails is the PORT's, or the vector's, and the report says which.
import { primitives } from "@valancex/common/internal";
import { createWebPort } from "@valancex/port-web";
import portPackage from "@valancex/port-web/package.json" with { type: "json" };
import { userEvent } from "vitest/browser";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import vectors from "../vectors/primitives.vectors.json" with { type: "json" };
import { webAdapter } from "../src/adapters/web.js";
import { run } from "../src/run.js";
import type { VectorFile } from "../src/vectors.js";

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => container.remove());

const keyName = (key: string): string => (key.length === 1 ? key : `{${key}}`);

describe("the Web PORT, in Chromium", () => {
  it("passes every primitive vector, with nothing declared unsupported", async () => {
    const adapter = webAdapter({
      create: (report) => createWebPort({ container, primitives, report }),
      container,
      version: (portPackage as { version: string }).version,
      press: (key) => userEvent.keyboard(keyName(key)),
      can: ["layers"],
    });
    const report = await run(adapter, vectors as unknown as VectorFile, {
      adapter: "chromium",
    });
    const failing = report.results.filter((each) => each.result === "fail").map((each) => `${each.primitive}/${each.case}: ${each.detail}`);

    expect(failing).toEqual([]);
    expect(report.summary.unsupported).toBe(0);
    expect(report.summary.pass).toBe((vectors as unknown as VectorFile).vectors.length);
  });

  it("finds a PORT that ignores `disabled`, in the browser too", async () => {
    const real = webAdapter({
      create: (report) => createWebPort({ container, primitives, report }),
      container,
      version: "control",
      press: (key) => userEvent.keyboard(keyName(key)),
    });
    const wrong = {
      ...real,
      observe: async (key: string) => ({
        ...(await real.observe(key))!,
        enabled: true,
      }),
    };
    const report = await run(wrong, vectors as unknown as VectorFile, {
      adapter: "chromium-control",
      only: ["button"],
    });

    expect(report.results.filter((each) => each.result === "fail").map((each) => each.case)).toContain("state:disabled=true");
  });
});
