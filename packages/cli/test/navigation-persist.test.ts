// `persist: ["navigation"]`: the pages visited, kept between runs where the engine keeps them (a window), and left alone where the browser does (a page). Run for real: a project compiled the way
// `vlx` compiles it, started with a store of its own, twice.
import { init } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { application, Navigation, platformOf, Store, webStore } from "@valancex/common/internal";
import type { TextStorage } from "@valancex/common/internal";
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

const MAIN = `import { defineApp } from "@valancex/common";

export default defineApp({ persist: ["navigation"] });
`;

const storage = (): TextStorage & { readonly map: Map<string, string> } => {
  const map = new Map<string, string>();

  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) };
};

const compiled = async () => {
  const root = project({ "content/index.md": PAGE("Home"), "content/a.md": PAGE("A"), "content/b.md": PAGE("B"), "src/main.ts": MAIN });
  const config = loadConfig(root);
  const loader = await createLoader(root, config);

  try {
    const author = await loadAuthor(loader, root);
    const built = await compileViews(root, author);

    return application(readContent(root, config), built.program, author);
  } finally {
    await loader.close();
  }
};

const wait = async (done: () => boolean | Promise<boolean>): Promise<void> => {
  for (let tries = 0; !(await done()); tries += 1) {
    if (tries > 200) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

/** Runs the application on `area`, as a window (the engine keeps the list) or as a page (the browser does). */
const running = async <A>(
  app: Awaited<ReturnType<typeof compiled>>,
  area: TextStorage,
  owner: "engine" | "browser",
  use: (handle: Valance.ApplicationHandle<any, any>) => Promise<A>,
): Promise<A> => {
  await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

  const scope = await Effect.runPromise(Scope.make());
  const platform = platformOf([[Store, webStore("Test", area)], ...(owner === "engine" ? [[Navigation, { owner: "engine" as const }] as const] : [])]);

  try {
    return await use(await Effect.runPromise(Valance.start(app, { platform }).pipe(Scope.extend(scope))));
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
};

const state = (handle: Valance.ApplicationHandle<any, any>) =>
  Effect.runPromise(handle.state) as Promise<{ readonly page: string; readonly trail: ReadonlyArray<string>; readonly cursor: number }>;
const go = (handle: Valance.ApplicationHandle<any, any>, id: string) => Effect.runPromise(handle.invoke("app/go", [{ value: id }] as never));

describe("persist: navigation", () => {
  it("is kept by an engine that owns the list, and the next run starts where the person was, with Back and Forward still there", async () => {
    const app = await compiled();
    const area = storage();

    await running(app, area, "engine", async (handle) => {
      await go(handle, "/a");
      await go(handle, "/b");
      await Effect.runPromise(handle.invoke("app/back", []));
      await wait(() => area.map.get("valance:Test:state") === '{"navigation":{"entries":["/","/a","/b"],"index":1}}');
    });
    await running(app, area, "engine", async (handle) => {
      await wait(async () => (await state(handle)).page === "/a");
      expect(await state(handle)).toMatchObject({ page: "/a", trail: ["/", "/a", "/b"], cursor: 1 });
    });
  }, 120_000);

  it("drops a page that is no longer one and follows the page that was shown; a list that does not fit starts again at the first page", async () => {
    const app = await compiled();
    const area = storage();

    area.map.set("valance:Test:state", '{"navigation":{"entries":["/","/gone","/b"],"index":2}}');
    await running(app, area, "engine", async (handle) => {
      await wait(async () => (await state(handle)).page === "/b");
      expect(await state(handle)).toMatchObject({ page: "/b", trail: ["/", "/b"], cursor: 1 });
    });

    const empty = storage();

    empty.map.set("valance:Test:state", '{"navigation":{"entries":["/gone"],"index":0}}');
    await running(app, empty, "engine", async (handle) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await state(handle)).toMatchObject({ page: "/", trail: ["/"], cursor: 0 });
    });
  }, 120_000);

  it("does nothing where the browser keeps the list: the address is the truth, and what was stored does not argue with it", async () => {
    const app = await compiled();
    const area = storage();

    area.map.set("valance:Test:state", '{"navigation":{"entries":["/","/a"],"index":1}}');
    await running(app, area, "browser", async (handle) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await state(handle)).toMatchObject({ page: "/", trail: ["/"], cursor: 0 });
      await go(handle, "/b");
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(area.map.get("valance:Test:state")).toBe('{"navigation":{"entries":["/","/a"],"index":1}}'); // not rewritten
  }, 120_000);
});
