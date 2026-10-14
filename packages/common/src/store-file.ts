// The desktop's store: one JSON file per key in the user's data directory for the application. Node only (the page never loads this). A write goes to a temporary file and is renamed over the
// real one, so a crash leaves the old value or the new one, never half of one.
import { Effect } from "effect";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { checkKey, decodeStored, encodeStored, MAX_STORED, StoreError } from "./store.js";
import type { StoreClient } from "./store.js";

/** Where an application keeps its data on this machine: `$XDG_DATA_HOME` (else `~/.local/share`) on Linux, `%APPDATA%` on Windows, `~/Library/Application Support` on macOS, then the application's name. */
export const userDataDir = (name: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string => {
  const app = name.replace(/[^\w.-]+/g, "-").replace(/^[.-]+/, "") || "app";
  const base =
    platform === "win32"
      ? (env["APPDATA"] ?? join(homedir(), "AppData", "Roaming"))
      : platform === "darwin"
        ? join(homedir(), "Library", "Application Support")
        : (env["XDG_DATA_HOME"] ?? join(homedir(), ".local", "share"));

  return join(base, app);
};

const unavailable = (): StoreError => new StoreError("Unavailable", "the data directory refused");

export const fileStore = (dir: string): StoreClient => {
  const file = (key: string): string => join(dir, `${key}.json`);

  return {
    get: (key, schema) =>
      Effect.flatMap(checkKey(key), (safe) =>
        Effect.flatMap(
          Effect.try({
            try: () => {
              try {
                return readFileSync(file(safe), "utf8");
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                  return null;
                }

                throw error;
              }
            },
            catch: unavailable,
          }),
          (text) => (text === null ? Effect.succeed(undefined) : decodeStored(text, schema)),
        ),
      ),
    set: (key, schema, value) =>
      Effect.flatMap(checkKey(key), (safe) =>
        Effect.flatMap(encodeStored(value, schema), (text) =>
          text.length > MAX_STORED
            ? Effect.fail(new StoreError("Full", "the value is larger than a store holds"))
            : Effect.try({
                try: () => {
                  mkdirSync(dir, { recursive: true });

                  const temporary = `${file(safe)}.${process.pid}.tmp`;

                  writeFileSync(temporary, text);
                  renameSync(temporary, file(safe));
                },
                catch: unavailable,
              }),
        ),
      ),
    remove: (key) => Effect.flatMap(checkKey(key), (safe) => Effect.try({ try: () => rmSync(file(safe), { force: true }), catch: unavailable })),
  };
};
