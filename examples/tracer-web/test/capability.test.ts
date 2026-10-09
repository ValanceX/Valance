// Stage 19: an application-owned capability, supplied at start, resolved by ordinary commands, scoped to the application.
// The CONTRACT is the application's (../src/catalog/service.ts); the IMPLEMENTATION below is the external platform's.
import type { HydrationResult } from "@valancex/port-web";

import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { Cause, Effect, Exit, Fiber, FiberRef, Layer, Schema, Scope } from "effect";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { AppState } from "../src/catalog/app.js";
import { compilePrograms } from "../src/catalog/compile.js";
import { Catalog, type CatalogService } from "../src/catalog/service.js";
import { applicationWithCatalog } from "../src/catalog/with-service.js";
import { primitives } from "../src/catalog/web.js";
import { load, until } from "./helpers.js";

const items = [{ id: "A", name: "Alpha" }];
const start = { view: "home" as const, items };

/**
 * The external platform: an implementation of the application's contract, backed by something with a lifetime. It is
 * acquired when the application starts and released when the application's Scope closes (NEXUS: platform layers are
 * provided to the application-owned runtime scope). The application never sees any of this.
 */
const catalogPlatform = () => {
  const counts = { acquired: 0, released: 0 };
  const platform: Nexus.Application.Platform = Layer.scoped(Nexus.Capability.Environment, Effect.map(
    Effect.acquireRelease(
      Effect.sync((): CatalogService => { counts.acquired += 1; return { lookup: (id) => `item-${id}`, close: () => { counts.released += 1; } }; }),
      (service) => Effect.sync(() => { service.close(); })
    ),
    (implementation) => ({ resolutions: new Map([[Catalog.id, { _tag: "Available" as const, implementation }]]) })
  ));

  return { counts, platform };
};

const source = (file: string): string => readFileSync(new URL(`../src/catalog/${file}`, import.meta.url), "utf8");

describe("Tripwire A: the application owns the contract; nothing platform-shaped is needed to define or use it", () => {
  it("the contract imports only NEXUS; the application that uses it names no Web, PORT or MESH runtime", () => {
    const importsOf = (text: string) => [...text.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

    expect(importsOf(source("service.ts"))).toEqual(["@valancex/nexus"]);
    for (const file of ["service.ts", "with-service.ts"]) {
      expect(source(file), file).not.toMatch(/valance\/web|port-web|mesh-runtime|mesh-compiler|\bwindow\b|\bdocument\b/);
    }
  });
});

describe("the capability through the application's existing boundary", () => {
  it("B + C: the implementation supplied at start is used by a command; its resource is acquired at start and released with the Scope", async () => {
    const app = applicationWithCatalog(await compilePrograms());
    const { counts, platform } = catalogPlatform();
    const scope = await Effect.runPromise(Scope.make());

    expect(counts).toEqual({ acquired: 0, released: 0 });                             // before start

    const handle = await Effect.runPromise(Valance.start(app, { platform, state: start }).pipe(Scope.extend(scope)));

    expect(counts).toEqual({ acquired: 1, released: 0 });                             // running: acquired by start, not by first use
    await Effect.runPromise(handle.invoke("app/lookupItem", [{ value: "Z9" }]));
    expect((await Effect.runPromise(handle.state)).items).toEqual([...items, { id: "Z9", name: "item-Z9" }]);   // the implementation's result, as state
    expect(counts).toEqual({ acquired: 1, released: 0 });                             // still one resource, still held

    await Effect.runPromise(Scope.close(scope, Exit.void));

    expect(counts).toEqual({ acquired: 1, released: 1 });                             // after the Scope
  });

  it("D: without the implementation, the command fails with NEXUS's own CapabilityUnavailableError, and changes nothing", async () => {
    const app = applicationWithCatalog(await compilePrograms());

    for (const platform of [undefined, Nexus.Capability.EnvironmentLive(new Map())]) {
      const result = await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const handle = yield* Valance.start(app, platform === undefined ? { state: start } : { platform, state: start });
        const exit = yield* Effect.exit(handle.invoke("app/lookupItem", [{ value: "Z9" }]));

        return { exit, state: yield* handle.state };
      })));

      expect(Exit.isFailure(result.exit) && Cause.isFailType(result.exit.cause) && result.exit.cause.error).toMatchObject({ _tag: "CapabilityUnavailableError", id: "example/catalog" });
      expect(result.state).toEqual(start);
    }
  });

  it("E + F: command → capability → state → existing values → existing update; the handle is still only state and invoke", async () => {
    const app = applicationWithCatalog(await compilePrograms());
    const { counts, platform } = catalogPlatform();
    const page = load("");
    const operations: Array<string> = [];
    const target: Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> = (report) => {
      const port = Web.target({ container: page.container, primitives })(report);

      return { draw: (tree) => { operations.push("draw"); port.draw(tree); }, update: (tree) => { operations.push("update"); port.update(tree); }, hydrate: (tree) => port.hydrate(tree), unmount: () => { port.unmount(); } };
    };

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform, state: start });
      yield* Valance.mount(handle, target);
      const section = page.container.firstElementChild;
      const alpha = page.container.querySelector("div");

      yield* handle.invoke("app/lookupItem", [{ value: "Z9" }]);
      yield* Effect.promise(() => until(() => page.container.querySelectorAll("div").length === 2));

      // The capability's answer is on screen, rendered by the ordinary path: the same view, so an update, and keyed rows keep their elements.
      expect([...page.container.querySelectorAll("div span")].map((span) => span.textContent)).toEqual(["Alpha", "item-Z9"]);
      expect(operations).toEqual(["draw", "update"]);
      expect(page.container.firstElementChild).toBe(section);
      expect(page.container.querySelector("div")).toBe(alpha);

      // F: nothing was added to the application's face.
      expect(Object.keys(handle).sort()).toEqual(["invoke", "state"]);
    })));

    expect(counts).toEqual({ acquired: 1, released: 1 });
  });

  it("isolation intact: a command holding the capability is interrupted with its caller, the caller sees none of its FiberRefs, and the resource stays until the Scope closes", async () => {
    const probe = FiberRef.unsafeMake("initial");
    const hold = { started: false, interrupted: false };
    const base = applicationWithCatalog(await compilePrograms());
    const app = Valance.define({
      ...base,
      commands: (state: Nexus.State.StateHandle<AppState>) => ({
        ...base.commands(state),
        "app/hold": Nexus.Mesh.bind(Nexus.Command.define("t.hold", Schema.Struct({}), () => Effect.gen(function* () {
          yield* Nexus.Capability.require(Catalog);
          yield* FiberRef.set(probe, "written by the application");
          hold.started = true;
          yield* Effect.never;
        }).pipe(Effect.onInterrupt(() => Effect.sync(() => { hold.interrupted = true; })))), () => ({})),
      }),
    });
    const { counts, platform } = catalogPlatform();

    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const handle = yield* Valance.start(app, { platform, state: start });
      const event = yield* Effect.fork(handle.invoke("app/hold", []));

      yield* Effect.promise(() => until(() => hold.started));
      expect(yield* FiberRef.get(probe)).toBe("initial");                        // the application's write did not reach the caller
      yield* Fiber.interrupt(event);
      yield* Effect.promise(() => until(() => hold.interrupted));
      expect(counts).toEqual({ acquired: 1, released: 0 });                      // interrupting a command does not end the application's resource
    })));

    expect(counts).toEqual({ acquired: 1, released: 1 });
  });
});
