// The failure tracer in real Chromium: real clicks, the browser's own timers and promise scheduling.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import { userEvent } from "@vitest/browser/context";
import { beforeAll, inject } from "vitest";

import { describeFailure } from "./failure.spec.js";
import type { Driver } from "./scenarios.js";

beforeAll(async () => { await init(wasmUrl); });

describeFailure((): Driver => {
  const container = document.createElement("main");

  document.body.append(container);

  return {
    program: inject("asyncProgram"),
    container,
    press: (index) => userEvent.click(container.querySelectorAll("button")[index]!),
  };
});
