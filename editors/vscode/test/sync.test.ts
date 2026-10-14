import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { affectsProject, coalesced, debounced } from "../src/sync";

describe("one run at a time, none missed", () => {
  it("runs once for one ask", async () => {
    const work = vi.fn<() => Promise<void>>(async () => undefined);

    await coalesced(work)();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("never overlaps, and goes round once more for any number of asks made meanwhile", async () => {
    let active = 0;
    let most = 0;
    let release: () => void = () => undefined;
    const work = vi.fn(async () => {
      active += 1;
      most = Math.max(most, active);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      active -= 1;
    });
    const run = coalesced(work);
    const first = run();

    await Promise.resolve();

    const second = run();
    const third = run();

    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await Promise.all([first, second, third]);
    expect(work).toHaveBeenCalledTimes(2);
    expect(most).toBe(1);
  });

  it("can be asked again after it finished", async () => {
    const work = vi.fn<() => Promise<void>>(async () => undefined);
    const run = coalesced(work);

    await run();
    await run();
    expect(work).toHaveBeenCalledTimes(2);
  });
});

describe("debounced", () => {
  it("calls once, after the last of a burst", () => {
    vi.useFakeTimers();

    const work = vi.fn<() => void>();
    const call = debounced(work, 200);

    call();
    vi.advanceTimersByTime(150);
    call();
    vi.advanceTimersByTime(150);
    expect(work).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(work).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("what changes the generated files", () => {
  const root = join("/work", "app");

  it("is the author's content, templates, code and settings", () => {
    for (const file of ["content/index.md", "content/guide/a.md", "src/layout.mprx", "src/main.ts", "valance.json", "valance.web.json"]) {
      expect(affectsProject(root, join(root, file)), file).toBe(true);
    }
  });

  it("is not what vlx writes, what is installed, the built site, or anything outside the project", () => {
    for (const file of [
      ".valance/manifest.json",
      ".valance/types/x.d.mprx.ts",
      "node_modules/effect/package.json",
      "dist/index.html",
      ".git/config",
      "src/styles.css",
      "README.txt",
    ]) {
      expect(affectsProject(root, join(root, file)), file).toBe(false);
    }

    expect(affectsProject(root, join("/work", "other", "content/a.md"))).toBe(false);
    expect(affectsProject(root, root)).toBe(false);
  });
});
