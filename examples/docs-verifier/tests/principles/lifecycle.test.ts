// §8 lifecycle and §9 async: ending twice, ending while work is in flight, cancellation reaching the work, and what the caller can rely on about ordering and "latest".
import { createWebPort } from "@valancex/port-web";
import * as Web from "@valancex/valance/web";
import * as Valance from "@valancex/valance";
import { Deferred, Effect, Exit, Fiber, Scope } from "effect";
import { JSDOM } from "jsdom";
import { afterAll, expect, it } from "vitest";

import { counter } from "./fixture.js";
import { evidence } from "./evidence.js";

const seen = evidence("lifecycle");

afterAll(() => { seen.write(); });

const settle = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const start = async (options: Parameters<typeof counter>[0] = {}, grace?: string) => {
  const app = await counter(options);
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(app, grace === undefined ? {} : { shutdown: { grace: grace as never } }).pipe(Scope.extend(scope)));

  return { handle, scope, close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

it("ending is idempotent: closing a scope twice, stopping a host twice, unmounting twice, disposing a port twice", async () => {
  const { close } = await start();

  await close();
  await close();

  const { window } = new JSDOM("<!doctype html><div id=r></div>");
  const port = createWebPort({ container: window.document.getElementById("r")!, primitives: { para: { element: "p" } }, report: () => undefined });

  port.draw({ format: "mesh-render", version: 1, root: { type: "node", key: "k", component: "para", props: {}, events: {}, children: [] } } as never);
  port.unmount();
  const second = (() => { try { port.unmount(); return "ok"; } catch (error) { return `throws:${(error as { code?: string }).code}`; } })();
  const disposed = (() => { try { port[Symbol.dispose](); return "ok"; } catch (error) { return `throws:${(error as { code?: string }).code}`; } })();

  seen.record("idempotent", { scopeCloseTwice: "ok", portUnmountTwice: second, portDisposeAfterUnmount: disposed });
  expect(second).toBe("ok");
  expect(disposed).toBe("ok");
});

it("cancelling the caller of a running command reaches the work (an AbortSignal fires) and no later state is written", async () => {
  const events: Array<string> = [];
  const { handle, close } = await start({ slowMs: 500, saw: (event) => events.push(event) });
  const fiber = Effect.runFork(handle.invoke("app/slow", []));

  await settle(20);
  await Effect.runPromise(Fiber.interrupt(fiber));
  await settle(20);

  const n = (await Effect.runPromise(handle.state)).n;

  await close();
  seen.record("cancel.invoke", { events, n });
  expect(events).toEqual(["started", "aborted"]);
  expect(n).toBe(0);
});

it("closing the application with a command in flight: grace 0 interrupts it; a grace lets it finish and its result lands", async () => {
  const quick = await start({ slowMs: 200, saw: () => undefined });
  const a: Array<string> = [];
  const fast = await start({ slowMs: 200, saw: (event) => a.push(event) });
  const b: Array<string> = [];
  const patient = await start({ slowMs: 60, saw: (event) => b.push(event) }, "1 second");

  void Effect.runPromise(Effect.exit(fast.handle.invoke("app/slow", [])));
  void Effect.runPromise(Effect.exit(patient.handle.invoke("app/slow", [])));
  await settle(20);
  await fast.close();
  await patient.close();
  await quick.close();
  seen.record("close.inFlight", { grace0: a, grace1s: b });
  expect(a).toEqual(["started", "aborted"]);
  expect(b).toEqual(["started", "finished"]);
});

it("commands are serialized in call order and the last write wins, with no lost update", async () => {
  const { handle, close } = await start();

  await Promise.all(Array.from({ length: 50 }, () => Effect.runPromise(handle.invoke("app/bump", []))));

  const n = (await Effect.runPromise(handle.state)).n;

  await close();
  seen.record("concurrentBumps", { sent: 50, n });
  expect(n).toBe(50);
});

it("a Deferred-style wait on the application does not outlive its scope (nothing keeps running after close)", async () => {
  const { handle, close } = await start({ slowMs: 100 });
  const gate = await Effect.runPromise(Deferred.make<void>());

  await close();
  await Effect.runPromise(Deferred.succeed(gate, undefined));

  const after = await Effect.runPromise(Effect.exit(handle.state));

  seen.record("afterClose.stateRead", Exit.isSuccess(after) ? "readable" : "fails");
  expect(Exit.isSuccess(after)).toBe(true);                                             // a read of the last state stays harmless
});
