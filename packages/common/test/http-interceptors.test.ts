// Interceptors: one shape (`Transport` in, `Transport` out), chained by composition, installed for the whole application or scoped to a piece of work or a single request.
import { Effect, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import { bearer, chain, only, refreshOn401, retryGet, webHttp, withInterceptors } from "../src/http.js";
import type { HttpError, Interceptor, Transport, TransportRequest } from "../src/http.js";

type Fetch = typeof fetch;

const Item = Schema.Struct({ id: Schema.Number });
const ok = (): Response => new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { "content-type": "application/json" } });
const status = (code: number): Response => new Response("{}", { status: code, headers: { "content-type": "application/json" } });
const headersOf = (init: RequestInit | undefined): Record<string, string> => (init?.headers ?? {}) as Record<string, string>;
const get = <A>(effect: Effect.Effect<A, HttpError>): Promise<A> => Effect.runPromise(effect);
const item = { path: "/items/1", response: Item } as const;

/** An interceptor that only records that it ran, and in what order. */
const mark =
  (log: Array<string>, name: string): Interceptor =>
  (next) =>
  (request) => {
    log.push(`${name}>`);

    return Effect.tap(next(request), () => Effect.sync(() => void log.push(`<${name}`)));
  };

describe("one shape", () => {
  it("chains the first listed outermost, and `chain` is itself an interceptor", async () => {
    const log: Array<string> = [];
    const wire = vi.fn<Fetch>(async () => (log.push("wire"), ok()));

    await get(webHttp({ base: "", fetch: wire, interceptors: [chain(mark(log, "a"), mark(log, "b")), mark(log, "c")] }).request(item));
    expect(log).toEqual(["a>", "b>", "c>", "wire", "<c", "<b", "<a"]);
  });

  it("sees the request after the client checked it and the answer before the client decodes it", async () => {
    const seen: Array<TransportRequest> = [];
    const tap: Interceptor = (next) => (request) => (seen.push(request), next(request));
    const wire = vi.fn<Fetch>(async () => ok());

    await get(webHttp({ base: "/api", fetch: wire, interceptors: [tap] }).request({ ...item, query: { q: "x" } }));
    expect(seen[0]).toMatchObject({ method: "GET", url: "/api/items/1?q=x", headers: { accept: "application/json" } });

    // an answer an interceptor replaced is decoded like any other: it cannot get past the Schema
    const bad: Interceptor = () => () => Effect.succeed({ status: 200, headers: { "content-type": "application/json" }, text: '{"id":"no"}' });
    const exit = await Effect.runPromiseExit(webHttp({ base: "", fetch: wire, interceptors: [bad] }).request(item));

    expect(exit._tag).toBe("Failure");
  });

  it("cannot be made to skip the path check", async () => {
    const wire = vi.fn<Fetch>(async () => ok());
    const never = vi.fn<Interceptor>((next) => next);
    const exit = await Effect.runPromiseExit(webHttp({ base: "/api", fetch: wire, interceptors: [never] }).request({ path: "//evil.example/x", response: Item }));

    expect(exit._tag).toBe("Failure");
    expect(never).not.toHaveBeenCalled();
    expect(wire).not.toHaveBeenCalled();
  });

  it("refuses a request an interceptor sent outside the API's origin, whatever it did", async () => {
    const wire = vi.fn<Fetch>(async () => ok());
    const redirect: Interceptor = (next) => (request) => next({ ...request, url: "https://evil.example/steal" });
    const exit = await Effect.runPromiseExit(webHttp({ base: "/api", fetch: wire, interceptors: [redirect] }).request(item));

    expect(exit._tag).toBe("Failure");
    expect(wire).not.toHaveBeenCalled();
  });
});

describe("the helpers", () => {
  it("adds a credential to requests for the API's origin and to no other", async () => {
    const seen: Array<Record<string, string>> = [];
    const wire = vi.fn<Fetch>(async (_input, init) => (seen.push(headersOf(init)), ok()));

    await get(webHttp({ base: "/api", fetch: wire, interceptors: [bearer("/api", () => "t0ken")] }).request(item));
    expect(seen[0]).toMatchObject({ authorization: "Bearer t0ken" });

    // a request for another origin never gets the token, even if the interceptor is asked to run on it
    const other = webHttp({ base: "https://api.other.example", fetch: wire, interceptors: [bearer("/api", () => "t0ken")] });

    await get(other.request(item));
    expect(seen[1]).not.toHaveProperty("authorization");
  });

  it("refreshes an expired session once for several requests that failed together, and retries each once", async () => {
    let valid = false;
    const refresh = vi.fn<() => Promise<void>>(async () => void (valid = true));
    const wire = vi.fn<Fetch>(async () => (valid ? ok() : status(401)));
    const client = webHttp({ base: "", fetch: wire, interceptors: [refreshOn401(refresh)] });
    const results = await Promise.all([1, 2, 3].map(() => get(client.request(item))));

    expect(results).toHaveLength(3);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(wire).toHaveBeenCalledTimes(6);
  });

  it("retries a GET that failed on the server, and never a POST", async () => {
    let calls = 0;
    const flaky = vi.fn<Fetch>(async () => (++calls < 3 ? status(503) : ok()));

    await get(webHttp({ base: "", fetch: flaky, interceptors: [retryGet(3)] }).request(item));
    expect(flaky).toHaveBeenCalledTimes(3);

    const post = vi.fn<Fetch>(async () => status(503));
    const exit = await Effect.runPromiseExit(webHttp({ base: "", fetch: post, interceptors: [retryGet(3)] }).request({ method: "POST", path: "/items", body: {}, response: Item }));

    expect(post).toHaveBeenCalledTimes(1);
    expect(exit._tag).toBe("Failure");
  });
});

describe("scopes", () => {
  const client = (log: Array<string>, globals: ReadonlyArray<Interceptor> = []): ReturnType<typeof webHttp> =>
    webHttp({ base: "", fetch: vi.fn<Fetch>(async () => ok()), interceptors: globals.length > 0 ? globals : [mark(log, "global")] });

  it("applies an interceptor to the requests inside `withInterceptors` and to none outside it", async () => {
    const log: Array<string> = [];
    const http = client(log);

    await get(withInterceptors(http.request(item), mark(log, "scoped")));
    expect(log).toEqual(["global>", "scoped>", "<scoped", "<global"]);

    log.length = 0;
    await get(http.request(item));
    expect(log).toEqual(["global>", "<global"]);
  });

  it("nests: the outer scope sees the request first, the request's own interceptors last, and every request inside is covered", async () => {
    const log: Array<string> = [];
    const http = client(log);
    const work = withInterceptors(Effect.zipRight(http.request({ ...item, interceptors: [mark(log, "request")] }), http.request(item)), mark(log, "inner"));

    await get(withInterceptors(work, mark(log, "outer")));
    expect(log).toEqual(["global>", "outer>", "inner>", "request>", "<request", "<inner", "<outer", "<global", "global>", "outer>", "inner>", "<inner", "<outer", "<global"]);
  });

  it("narrows by anything the request says", async () => {
    const log: Array<string> = [];
    const wire = vi.fn<Fetch>(async () => ok());
    const admin = only((request) => request.url.startsWith("/admin"), mark(log, "admin"));
    const http = webHttp({ base: "", fetch: wire, interceptors: [admin] });

    await get(http.request({ path: "/admin/users", response: Item }));
    await get(http.request(item));
    expect(log).toEqual(["admin>", "<admin"]);
  });

  it("does not leak into a request made at the same time outside the scope", async () => {
    const log: Array<string> = [];
    const http = client(log, []);
    const wire: Transport = (r) => Effect.succeed({ status: 200, headers: {}, text: r.url });

    expect(wire).toBeDefined();
    await Promise.all([get(withInterceptors(http.request(item), mark(log, "scoped"))), get(http.request(item))]);
    expect(log.filter((entry) => entry === "scoped>")).toHaveLength(1);
  });
});
