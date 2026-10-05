// What an author sees when the browser's MESH runtime was never initialized (`init(wasmUrl)` not called): the failure `Web.run` rejects with.
import * as Web from "@valancex/valance/web";
import { expect, inject, it } from "vitest";

import { application } from "../src/docs-benchmark/app.js";
import { primitives } from "../src/docs-benchmark/web.js";

const served = inject("docs");

it("Web.run without init(wasmUrl) rejects; the message is what the author is told", async () => {
  const root = document.createElement("div");
  const error = await Web.run(application(served.programs, () => new Promise(() => undefined)), { container: root, primitives, present: "mount" }).then(() => undefined, (failure: unknown) => failure);

  expect(String(error)).toContain("call init() with the URL of mesh-runtime.wasm");   // a MESH-level message that says exactly what to do
});
