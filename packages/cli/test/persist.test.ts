// `persist`: the state fields an application keeps between runs, through the platform's Store. Run for real: a project compiled the way `vlx` compiles it, started with a store of its own, twice.
import { init } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { application, storePlatform, webStore } from "@valancex/common/internal";
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

const MAIN = (persist: string) => `import { defineApp, field } from "@valancex/common";
import { Schema } from "effect";

export default defineApp({
  state: { notes: field(Schema.Array(Schema.String), []), scratch: field(Schema.String, "") },
  ${persist}
  commands: (command) => ({
    addNote: command(Schema.Struct({ text: Schema.String }), ({ text }, state) => ({ ...state, notes: [...state.notes, text] })),
    setScratch: command(Schema.Struct({ text: Schema.String }), ({ text }, state) => ({ ...state, scratch: text })),
  }),
});
`;

const storage = (): TextStorage & { readonly map: Map<string, string> } => {
  const map = new Map<string, string>();

  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) };
};

const compiled = async (main: string) => {
  const root = project({ "content/index.md": PAGE("Home"), "src/main.ts": main });
  const config = loadConfig(root);
  const loader = await createLoader(root, config);

  try {
    const author = await loadAuthor(loader, root);
    const built = await compileViews(root, author);

    return { app: application(readContent(root, config), built.program, author), root };
  } finally {
    await loader.close();
  }
};

const wait = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 200) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

/** Runs the application on `area` (or on no store) for as long as `use` takes. */
const running = async <A>(
  app: Awaited<ReturnType<typeof compiled>>["app"],
  area: TextStorage | undefined,
  use: (handle: Valance.ApplicationHandle<any, any>) => Promise<A>,
): Promise<A> => {
  await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

  const scope = await Effect.runPromise(Scope.make());

  try {
    const handle = await Effect.runPromise(Valance.start(app, area === undefined ? {} : { platform: storePlatform(webStore("Test", area)) }).pipe(Scope.extend(scope)));

    return await use(handle);
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
};

const invoke = (handle: Valance.ApplicationHandle<any, any>, key: string, ...values: ReadonlyArray<unknown>) =>
  Effect.runPromise(handle.invoke(key, values.map((value) => ({ value })) as never));
const state = (handle: Valance.ApplicationHandle<any, any>) => Effect.runPromise(handle.state) as Promise<{ readonly notes: ReadonlyArray<string>; readonly scratch: string }>;

describe("persist", () => {
  it("saves the fields it names when they change, and only those", async () => {
    const { app } = await compiled(MAIN('persist: ["notes"],'));
    const area = storage();

    await running(app, area, async (handle) => {
      await invoke(handle, "app/addNote", "milk");
      await invoke(handle, "app/setScratch", "typing…");
      await wait(() => area.map.has("valance:Test:state"));
    });
    expect(JSON.parse(area.map.get("valance:Test:state")!)).toEqual({ notes: ["milk"] });
  }, 120_000);

  it("loads them in the next run, and the fields it does not name start from their defaults", async () => {
    const { app } = await compiled(MAIN('persist: ["notes"],'));
    const area = storage();

    await running(app, area, async (handle) => {
      await invoke(handle, "app/addNote", "milk");
      await invoke(handle, "app/setScratch", "typing…");
      await wait(() => area.map.has("valance:Test:state"));
    });
    await running(app, area, async (handle) => {
      for (let tries = 0; tries < 100 && (await state(handle)).notes.length === 0; tries += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20)); // the load runs as the application starts
      }

      expect(await state(handle)).toMatchObject({ notes: ["milk"], scratch: "" });
    });
  }, 120_000);

  it("ignores what was stored and no longer fits, and the next change replaces it", async () => {
    const { app } = await compiled(MAIN('persist: ["notes"],'));
    const area = storage();

    area.map.set("valance:Test:state", '{"notes":5}');
    await running(app, area, async (handle) => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect((await state(handle)).notes).toEqual([]);
      await invoke(handle, "app/addNote", "bread");
      await wait(() => area.map.get("valance:Test:state") === '{"notes":["bread"]}');
    });
  }, 120_000);

  it("runs as it would without it where the platform has no store", async () => {
    const { app } = await compiled(MAIN('persist: ["notes"],'));

    await running(app, undefined, async (handle) => {
      await invoke(handle, "app/addNote", "milk");
      expect((await state(handle)).notes).toEqual(["milk"]);
    });
  }, 120_000);

  it("names fields that exist, and cannot take the framework's command name", async () => {
    await expect(compiled(MAIN('persist: ["nothing" as never],'))).rejects.toThrow(/not a state field/);
    await expect(compiled(MAIN("").replace("addNote:", "persist:").replace("persist: [", "persist: ["))).rejects.toThrow(/framework's command/);
  }, 120_000);
});
