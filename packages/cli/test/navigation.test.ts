// The trail: where the person has been, for a target with no browser history of its own. `go` adds a page after the one shown, `back` and `forward` move along it, and a layout knows whether
// there is anywhere to go (`canGoBack`, `canGoForward`).
import { init } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { application } from "@valancex/common/internal";
import { Effect, Exit, Scope } from "effect";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

import { loadAuthor } from "../src/author.js";
import { compileViews } from "../src/compile.js";
import { readContent } from "../src/content.js";
import { loadConfig } from "../src/config.js";
import { createLoader } from "../src/vite.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const started = async (main?: string) => {
  const root = project({ "content/index.md": PAGE("Home"), "content/a.md": PAGE("A"), "content/b.md": PAGE("B"), ...(main === undefined ? {} : { "src/main.ts": main }) });
  const config = loadConfig(root);
  const loader = await createLoader(root, config);

  try {
    const author = await loadAuthor(loader, root);
    const built = await compileViews(root, author);
    const app = application(readContent(root, config), built.program, author);

    await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

    const scope = await Effect.runPromise(Scope.make());
    const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));
    const state = () => Effect.runPromise(handle.state) as Promise<{ readonly page: string; readonly trail: ReadonlyArray<string>; readonly cursor: number }>;
    const run = (key: string, ...values: ReadonlyArray<unknown>) => Effect.runPromise(handle.invoke(key, values.map((value) => ({ value })) as never));
    const canGo = async () => {
      const current = (await state()) as never;
      const view = (app as unknown as { views: { layout: { scope: (state: never) => { canGoBack: boolean; canGoForward: boolean } } } }).views.layout.scope(current);

      return [view.canGoBack, view.canGoForward];
    };

    return { state, run, canGo, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
  } finally {
    await loader.close();
  }
};

describe("the trail", () => {
  it("starts at the page it opened on, with nowhere to go", async () => {
    const t = await started();

    expect(await t.state()).toMatchObject({ page: "/", trail: ["/"], cursor: 0 });
    expect(await t.canGo()).toEqual([false, false]);
    await t.run("app/back");
    await t.run("app/forward");
    expect(await t.state()).toMatchObject({ page: "/", cursor: 0 }); // nothing to go to is not an error
    await t.close();
  }, 120_000);

  it("grows with `go`, moves with `back` and `forward`, and drops what was ahead when the person goes somewhere new", async () => {
    const t = await started();

    await t.run("app/go", "/a");
    await t.run("app/go", "/b");
    await t.run("app/go", "/b"); // the page already shown is not a new place
    expect(await t.state()).toMatchObject({ page: "/b", trail: ["/", "/a", "/b"], cursor: 2 });
    expect(await t.canGo()).toEqual([true, false]);

    await t.run("app/back");
    expect(await t.state()).toMatchObject({ page: "/a", cursor: 1 });
    expect(await t.canGo()).toEqual([true, true]);
    await t.run("app/back");
    expect(await t.canGo()).toEqual([false, true]);
    await t.run("app/forward");
    expect(await t.state()).toMatchObject({ page: "/a", cursor: 1 });

    await t.run("app/go", "/");
    expect(await t.state()).toMatchObject({ page: "/", trail: ["/", "/a", "/"], cursor: 2 }); // /b was ahead and is gone
    expect(await t.canGo()).toEqual([true, false]);
    await t.close();
  }, 120_000);
});

const GUARDED = (guard: string) => `import { defineApp } from "@valancex/common";
import { redirect } from "@valancex/router";

export const seen: Array<string> = [];

export default defineApp({
  guard: ${guard},
});
`;

describe("a guard on moving between pages", () => {
  it("is asked before go, back and forward, told why, and a move it stops changes nothing", async () => {
    const t = await started(
      GUARDED(`({ from, to, kind }) => {
    seen.push(\`\${kind}:\${from?.name}>\${to.name}\`);
    return to.name !== "/b";
  }`),
    );

    await t.run("app/go", "/a");
    await t.run("app/go", "/b"); // stopped
    expect(await t.state()).toMatchObject({ page: "/a", trail: ["/", "/a"], cursor: 1 });
    await t.run("app/back");
    expect(await t.state()).toMatchObject({ page: "/", cursor: 0 });
    await t.run("app/forward");
    expect(await t.state()).toMatchObject({ page: "/a", cursor: 1 });
    await t.close();
  }, 120_000);

  it("stops Back but not Go when it tells them apart, and a guard that throws stops the move", async () => {
    const t = await started(GUARDED(`({ kind }) => { if (kind === "history") { throw new Error("no"); } return true; }`));

    await t.run("app/go", "/a");
    await t.run("app/back");
    expect(await t.state()).toMatchObject({ page: "/a", cursor: 1 }); // the throw stopped it
    await t.run("app/go", "/b");
    expect(await t.state()).toMatchObject({ page: "/b", cursor: 2 });
    await t.close();
  }, 120_000);

  it("can send a move to another page, which is added after the page shown", async () => {
    const t = await started(GUARDED(`({ to }) => (to.name === "/b" ? redirect("/a") : true)`));

    await t.run("app/go", "/b");
    expect(await t.state()).toMatchObject({ page: "/a", trail: ["/", "/a"], cursor: 1 });
    await t.close();
  }, 120_000);

  it("is not asked about a move that goes nowhere (the page already shown, or the end of the list)", async () => {
    const t = await started(GUARDED(`() => { throw new Error("asked"); }`));

    await t.run("app/go", "/"); // already there
    await t.run("app/back"); // nowhere to go
    await t.run("app/forward");
    expect(await t.state()).toMatchObject({ page: "/", trail: ["/"], cursor: 0 });
    await t.close();
  }, 120_000);
});
