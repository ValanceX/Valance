// The application ends with the page's lifetime: `shutdown.grace` is part of `start`, so `Web.run` takes it. Closing a started application with a grace resolves, and takes no longer than nothing running requires.
import { Effect, Exit, Scope } from "effect";
import { expect, it } from "vitest";
import { start } from "@valancex/valance";

import { application } from "../app/application.js";
import { compilePage } from "../web/compile.js";
import { initial } from "../app/state.js";
import { siteDir } from "./sites.js";
import { readSite } from "../tooling/content.js";
import { mapOf } from "../model/site.js";
import { fileURLToPath } from "node:url";

it("start takes shutdown.grace, and closing the application resolves at once when nothing is running", async () => {
  const site = readSite(siteDir("docs"));
  const program = await compilePage();
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(start(application(program, mapOf(site)), { shutdown: { grace: "5 seconds" } }).pipe(Scope.extend(scope)));
  const before = Date.now();

  await Effect.runPromise(handle.invoke("app/toggleMenu", []));
  await Effect.runPromise(Scope.close(scope, Exit.void));

  expect(Date.now() - before).toBeLessThan(1000);
  expect(await Effect.runPromise(handle.state)).toEqual({ ...initial, menu: true });
});
