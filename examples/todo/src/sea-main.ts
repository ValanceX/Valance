// The engine as one executable (Node's single executable application): the programs and the MESH runtime's module are assets inside it, so nothing is read from disk. Bundled to one CommonJS
// file by `scripts/package.mjs`, which is why it is a function and not a top-level await.
import { getRawAsset } from "node:sea";

import type { Programs } from "./app.js";
import { run } from "./engine.js";

const programs = JSON.parse(Buffer.from(getRawAsset("programs.json")).toString("utf8")) as Programs;
const wasm = new Uint8Array(getRawAsset("mesh-runtime.wasm"));

run({ programs, wasm }, process.argv[2] ?? "/").then(
  () => process.exit(0),
  (error: unknown) => {
    console.error("the engine stopped:", error);
    process.exit(1);
  },
);
