// The Store capability and its two implementations: the web's over a page's storage, the desktop's over a file in the data directory. A value comes out decoded by the Schema the caller states.
import { Effect, Exit, Schema } from "effect";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { MAX_STORED, StoreError, webStore } from "../src/store.js";
import type { StoreClient, TextStorage } from "../src/store.js";
import { fileStore, userDataDir } from "../src/store-file.js";

const Items = Schema.Array(Schema.Struct({ id: Schema.String, done: Schema.Boolean }));
const run = <A>(effect: Effect.Effect<A, StoreError>) => Effect.runPromise(Effect.exit(effect));
const memory = (): TextStorage & { readonly map: Map<string, string> } => {
  const map = new Map<string, string>();

  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value), removeItem: (key) => void map.delete(key) };
};

/** The behavior every store has, whatever it keeps its values in. */
const behaves = (name: string, make: () => StoreClient) =>
  describe(`${name}: the contract`, () => {
    it("gives back what was stored, decoded; nothing for a key never stored; forgets on remove", async () => {
      const store = make();

      expect(await run(store.get("items", Items))).toEqual(Exit.succeed(undefined));
      expect(await run(store.set("items", Items, [{ id: "a", done: true }]))).toEqual(Exit.succeed(undefined));
      expect(await run(store.get("items", Items))).toEqual(Exit.succeed([{ id: "a", done: true }]));
      await run(store.remove("items"));
      expect(await run(store.get("items", Items))).toEqual(Exit.succeed(undefined));
    });

    it("does not hand back what no longer fits the Schema asked for: it is Decode", async () => {
      const store = make();

      await run(store.set("items", Schema.Array(Schema.String), ["x"]));

      const read = await run(store.get("items", Items));

      expect(Exit.isFailure(read) && String(read.cause)).toContain("no longer fits");
    });

    it("refuses a key that is more than a word, and a value that does not fit its own type", async () => {
      const store = make();

      for (const key of ["", "../x", "a/b", "a b", ".hidden", "x".repeat(81)]) {
        expect(Exit.isFailure(await run(store.get(key, Items))), key).toBe(true);
        expect(Exit.isFailure(await run(store.set(key, Items, []))), key).toBe(true);
      }

      expect(Exit.isFailure(await run(store.set("items", Items, [{ id: 1 }] as never)))).toBe(true);
      expect(Exit.isFailure(await run(store.set("items", Schema.String, "x".repeat(MAX_STORED + 1))))).toBe(true);
    });
  });

behaves("the web's store", () => webStore("Notes", memory()));
behaves("the desktop's store", () => fileStore(mkdtempSync(join(tmpdir(), "vlx-store-"))));

describe("the web's store", () => {
  it("keeps each application's values apart, under valance:<name>:<key>", async () => {
    const area = memory();

    await run(webStore("Notes", area).set("items", Items, []));
    await run(webStore("Other", area).set("items", Items, [{ id: "z", done: false }]));
    expect([...area.map.keys()].sort()).toEqual(["valance:Notes:items", "valance:Other:items"]);
    expect(await run(webStore("Notes", area).get("items", Items))).toEqual(Exit.succeed([]));
  });

  it("is Unavailable where the page has no storage or the storage refuses, never a throw", async () => {
    const refusing: TextStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const get = await run(webStore("Notes", refusing).get("items", Items));
    const set = await run(webStore("Notes", refusing).set("items", Items, []));

    expect(Exit.isFailure(get) && String(get.cause)).toContain("refused");
    expect(Exit.isFailure(set)).toBe(true);
    expect(Exit.isFailure(await run(webStore("Notes").get("items", Items)))).toBe(true); // no localStorage in this process
  });
});

describe("the desktop's store", () => {
  it("writes one JSON file per key, whole or not at all, and leaves no temporary file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vlx-store-"));
    const store = fileStore(join(dir, "app"));

    await run(store.set("items", Items, [{ id: "a", done: false }]));
    expect(readdirSync(join(dir, "app"))).toEqual(["items.json"]);
    expect(JSON.parse(readFileSync(join(dir, "app", "items.json"), "utf8"))).toEqual([{ id: "a", done: false }]);
    writeFileSync(join(dir, "app", "items.json"), "{ not json");
    expect(Exit.isFailure(await run(store.get("items", Items)))).toBe(true);
  });

  it("keeps an application's data where the platform says: XDG_DATA_HOME or ~/.local/share, %APPDATA%, Application Support", () => {
    expect(userDataDir("Notes", { XDG_DATA_HOME: "/data" }, "linux")).toBe(join("/data", "Notes"));
    expect(userDataDir("Notes", { APPDATA: "C:\\Users\\x\\AppData\\Roaming" }, "win32")).toBe(join("C:\\Users\\x\\AppData\\Roaming", "Notes"));
    expect(userDataDir("Notes", {}, "darwin")).toMatch(/Library[\\/]Application Support[\\/]Notes$/);
    expect(userDataDir("../../etc", { XDG_DATA_HOME: "/data" }, "linux")).toBe(join("/data", "etc")); // a name is a name, never a path
  });
});
