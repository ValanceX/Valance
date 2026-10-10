// What an author sees when the browser's MESH runtime was never initialized (`init(wasmUrl)` not called) and cannot load its packaged module itself, as under a Vite development server that
// prebundles the runtime away from its .wasm (the setup this suite runs in): the failure `Web.run` rejects with. Since MESH 0.10 the runtime tries to load its module first; where that works, `init` is optional.
import * as Web from "@valancex/valance/web";
import { expect, inject, it } from "vitest";

import { application } from "../src/docs-benchmark/app.js";
import { primitives } from "../src/docs-benchmark/web.js";

const served = inject("docs");

it("Web.run without init(wasmUrl) rejects; the message is what the author is told", async () => {
  const root = document.createElement("div");
  const error = await Web.run(application(served.programs, () => new Promise(() => undefined)), { container: root, primitives, present: "mount" }).then(() => undefined, (failure: unknown) => failure);

  expect(String(error)).toContain("Pass the URL of mesh-runtime.wasm to init()");   // a MESH-level message that says exactly what to do
  expect((error as { code?: string }).code).toBe("module-unavailable");
});
