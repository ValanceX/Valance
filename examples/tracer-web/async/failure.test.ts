// The failure tracer in jsdom (the fast loop). The same scenarios run in Chromium (failure.browser.test.ts).
import { describeFailure } from "./failure.spec.js";
import { compileProgram } from "./compile.js";
import type { Driver } from "./scenarios.js";
import { load } from "../test/helpers.js";

describeFailure(async (): Promise<Driver> => {
  const page = load("");

  return {
    program: await compileProgram(),
    container: page.container,
    press: (index) => { page.click(page.container.querySelectorAll("button")[index]!); return Promise.resolve(); },
  };
});
