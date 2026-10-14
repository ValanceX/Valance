// The engine's startup, shared by the two ways it is run: from files (`main.ts`, in development) and as one executable carrying its programs and the MESH runtime (`sea-main.ts`).
import { init } from "@valancex/mesh-runtime";
import { Effect } from "effect";

import { application, initial, starting, titleOf } from "./app.js";
import { router } from "./routes.js";
import type { Programs } from "./app.js";
import { serve } from "./host.js";

export interface Parts {
  /** The compiled screens, as `build.ts` wrote them. */
  readonly programs: Programs;
  /** The MESH runtime's WebAssembly module, when it is not next to its code (a single executable). */
  readonly wasm?: Uint8Array;
}

/** Serves the application on stdin and stdout, opened at `address`, until the renderer closes. */
export const run = async ({ programs, wasm }: Parts, address: string): Promise<void> => {
  if (wasm !== undefined) {
    await init(wasm);
  }

  const start = await starting(initial(), address);

  process.stdin.setEncoding("utf8");
  await Effect.runPromise(serve(application(programs, start), { input: process.stdin, output: process.stdout }, { mayClose: (state) => router.mayLeave(state), titleOf }));
};
