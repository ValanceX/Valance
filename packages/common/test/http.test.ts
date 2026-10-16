import { Effect, Exit, Fiber, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import * as Nexus from "@valancex/nexus";

import { addressOf, Http, request, webHttp, webPlatform } from "../src/http.js";
import type { HttpError } from "../src/http.js";
import { defineApp } from "../src/index.js";

const Item = Schema.Struct({ id: Schema.Number, name: Schema.String });
const json = (body: unknown, init: ResponseInit = {}): Response => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });
const fail = async <A>(effect: Effect.Effect<A, HttpError>): Promise<HttpError> => {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    throw new Error("expected a failure");
  }

  return (exit.cause as { error: HttpError }).error;
};

describe("the address of a request", () => {
  it("joins the base and the path, and encodes the query", () => {
    expect(addressOf("/api", "/items", { q: "a b&c", page: 2, skip: undefined })).toEqual({ url: "/api/items?q=a+b%26c&page=2" });
    expect(addressOf("https://api.example.com/", "/v1/x?y=1", { z: true })).toEqual({ url: "https://api.example.com/v1/x?y=1&z=true" });
    expect(addressOf("", "/x", undefined)).toEqual({ url: "/x" });
  });

  it("refuses a path that could send the request somewhere else", () => {
    for (const path of ["x", "//evil.example/x", "/\\evil", "/a/../../b", "/x\n", "/https://evil.example"]) {
      expect(addressOf("/api", path, undefined), path).toHaveProperty("unsafe");
    }
  });
});

describe("the web client", () => {
  it("decodes the answer with the Schema, and sends the safe defaults", async () => {
    const send = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => json({ id: 1, name: "a" }));
    const item = await Effect.runPromise(webHttp({ base: "/api", fetch: send as never }).request({ path: "/items/1", response: Item }));

    expect(item).toEqual({ id: 1, name: "a" });
    expect(send.mock.calls[0]![0]).toBe("/api/items/1");

    const init = send.mock.calls[0]![1]!;

    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    expect(init.cache).toBe("no-store");
    expect(init.headers).toEqual({ accept: "application/json" });
  });

  it("marks an unsafe method, sends JSON, and gives a cross-origin backend no cookies unless asked", async () => {
    const send = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => json({ id: 2, name: "b" }));
    const client = webHttp({ base: "https://api.example.com", fetch: send as never });

    await Effect.runPromise(client.request({ method: "POST", path: "/items", body: { name: "b" }, response: Item }));
    expect(send.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      body: '{"name":"b"}',
      credentials: "omit",
      headers: { accept: "application/json", "content-type": "application/json", "x-requested-with": "valance" },
    });
    await Effect.runPromise(webHttp({ base: "https://api.example.com", credentials: "include", fetch: send as never }).request({ path: "/items/2", response: Item }));
    expect(send.mock.calls[1]![1]).toMatchObject({ credentials: "include" });
  });

  it("is a typed failure for every way it can go wrong, naming the kind and not what it carried", async () => {
    const as = (respond: () => Promise<Response>, over: Partial<Parameters<typeof webHttp>[0]> = {}) => webHttp({ base: "", fetch: respond as never, ...over });
    const get = { path: "/x", response: Item };

    expect(await fail(as(async () => json({ error: "Bearer s3cr3t" }, { status: 401 })).request(get))).toEqual({ _tag: "Status", status: 401 });
    expect(await fail(as(async () => json({ id: "one" })).request(get))).toEqual({ _tag: "Decode" });
    expect(await fail(as(async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } })).request(get))).toEqual({ _tag: "Decode" });
    expect(await fail(as(async () => new Response("{", { headers: { "content-type": "application/json" } })).request(get))).toEqual({ _tag: "Decode" });
    expect(await fail(as(async () => Promise.reject(new TypeError("Failed to fetch https://x?token=s3cr3t"))).request(get))).toEqual({ _tag: "Offline" });
    expect(await fail(as(async () => json({ id: 1, name: "x".repeat(50) }), { maxResponse: 20 }).request(get))).toEqual({ _tag: "TooLarge" });
    expect(await fail(as(async () => json({})).request({ path: "//evil.example", response: Item }))).toMatchObject({ _tag: "Unsafe" });
    expect(await fail(as(async () => json({})).request({ path: "/x", body: {}, response: Item }))).toMatchObject({ _tag: "Unsafe" });
  });

  it("times out, and is aborted when the application ends", async () => {
    const hang = (_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)); // as fetch does: with the reason the signal was aborted with
      });
    const client = webHttp({ base: "", fetch: hang as never });

    expect(await fail(client.request({ path: "/slow", response: Item, timeoutMs: 20 }))).toEqual({ _tag: "Timeout" });

    const fiber = Effect.runFork(client.request({ path: "/slow", response: Item, timeoutMs: 5_000 }));

    await new Promise((resolve) => setTimeout(resolve, 10));
    await Effect.runPromise(Fiber.interrupt(fiber));
    expect(Exit.isInterrupted(await Effect.runPromise(Fiber.await(fiber)))).toBe(true);
  });

  it("accepts an answer with no content when the Schema is for nothing", async () => {
    const client = webHttp({ base: "", fetch: (async () => new Response(null, { status: 204 })) as never });

    expect(await Effect.runPromise(client.request({ method: "DELETE", path: "/x/1", response: Schema.Undefined }))).toBeUndefined();
  });
});

describe("the capability", () => {
  it("is asked for by a command and supplied by the platform; without a platform it is unavailable, not a silent no-op", async () => {
    const platform = webPlatform({ base: "/api", fetch: (async () => json({ id: 3, name: "c" })) as never });
    const found = await Effect.runPromise(request({ path: "/items/3", response: Item }).pipe(Effect.provide(platform)));

    expect(found).toEqual({ id: 3, name: "c" });
    expect(Http.id).toBe("valance/http");

    const missing = await Effect.runPromiseExit(request({ path: "/x", response: Item }).pipe(Effect.provide(Nexus.Capability.EnvironmentLive(new Map()))));

    expect(Exit.isFailure(missing)).toBe(true);
  });

  it("types in a command that waits: the work is an Effect needing the capability, and the response is the Schema's type", () => {
    const State = Schema.Struct({ item: Schema.NullOr(Item), failed: Schema.String });
    const app = defineApp({
      commands: (command) => ({
        load: command.waiting(Schema.Struct({}), {
          work: () => request({ path: "/items/1", response: Item }),
          wanted: () => true,
          settle: (outcome, _input, current) => ({ ...current, ...(outcome.ok ? { item: outcome.value } : {}) }),
        }),
      }),
    });

    expect(typeof app.commands).toBe("function");
    expect(State).toBeDefined();
  });
});

describe("what a failed status may carry (COMMAND-SURFACE.md C-4 to C-7)", () => {
  const Refusal = Schema.Struct({ error: Schema.String, field: Schema.optional(Schema.String) });
  const client = (response: () => Response) => webHttp({ base: "/api", fetch: (async () => response()) as never });
  const asked = (c: ReturnType<typeof client>, errors?: typeof Refusal) =>
    fail(c.request({ method: "POST", path: "/x", response: Item, ...(errors === undefined ? {} : { errors }) }) as never);

  it("decodes a JSON body of a failed status with the Schema the request gave, and keeps nothing else", async () => {
    const failure = await asked(
      client(() => json({ error: "Cannot ship: payment pending", secret: "t0ken" }, { status: 422 })),
      Refusal,
    );

    expect(failure).toEqual({ _tag: "Status", status: 422, body: { error: "Cannot ship: payment pending" } }); // `secret` is not in the Schema, so it is not kept
  });

  it("leaves the bare status without `errors`, for a body of another shape, a body that is not JSON, and an empty one", async () => {
    expect(await asked(client(() => json({ error: "x" }, { status: 409 })))).toEqual({ _tag: "Status", status: 409 });
    expect(
      await asked(
        client(() => json({ nope: 1 }, { status: 422 })),
        Refusal,
      ),
    ).toEqual({ _tag: "Status", status: 422 });
    expect(
      await asked(
        client(() => new Response("<html>oops</html>", { status: 500, headers: { "content-type": "text/html" } })),
        Refusal,
      ),
    ).toEqual({ _tag: "Status", status: 500 });
    expect(
      await asked(
        client(() => new Response("{not json", { status: 500, headers: { "content-type": "application/json" } })),
        Refusal,
      ),
    ).toEqual({ _tag: "Status", status: 500 });
    expect(
      await asked(
        client(() => new Response("", { status: 500, headers: { "content-type": "application/json" } })),
        Refusal,
      ),
    ).toEqual({ _tag: "Status", status: 500 });
  });

  it("an interceptor still sees the raw failed response", async () => {
    let seen = "";
    const http = webHttp({
      base: "/api",
      fetch: (async () => json({ error: "no" }, { status: 422 })) as never,
      interceptors: [
        (next) => (request) =>
          Effect.tap(next(request), (response) => {
            seen = response.text;
          }),
      ],
    });

    await fail(http.request({ path: "/x", response: Item, errors: Refusal }) as never);
    expect(seen).toBe('{"error":"no"}');
  });
});
