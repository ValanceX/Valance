// Evidence for the interceptor investigation (docs/application-model/ROUTING-AND-INTERCEPTORS.md): the web client already takes the transport it sends through (`fetch`), so request and response
// interception composes today as a function over that transport. What is missing is not the mechanism but a place for an application to install one (`defineApp` has no `http`), a typed shape
// for it, and the origin guard that keeps a credential from following a request somewhere else.
import { Effect, Schema } from "effect";
import { describe, expect, it, vi } from "vitest";

import { webHttp } from "../src/http.js";

type Fetch = typeof fetch;
/** An interceptor is a function over the transport: it may change the request on the way in and the response on the way out. */
type Interceptor = (next: Fetch) => Fetch;

const Item = Schema.Struct({ id: Schema.Number });
const ok = (): Response => new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { "content-type": "application/json" } });
const status = (code: number): Response => new Response("{}", { status: code, headers: { "content-type": "application/json" } });
const headersOf = (init: RequestInit | undefined): Record<string, string> => (init?.headers ?? {}) as Record<string, string>;

/** Adds the token, but only to the API's own origin: a credential never follows a request somewhere else. */
const bearer =
  (origin: string, token: () => string): Interceptor =>
  (next) =>
  (input, init) =>
    new URL(String(input), "http://page.example").origin === origin || String(input).startsWith("/")
      ? next(input, { ...init, headers: { ...headersOf(init), authorization: `Bearer ${token()}` } })
      : next(input, init);

/** On a 401, refreshes the token once however many requests failed at the same time, and retries the request once. */
const refreshOn401 = (refresh: () => Promise<void>): Interceptor => {
  let refreshing: Promise<void> | undefined;

  return (next) => async (input, init) => {
    const first = await next(input, init);

    if (first.status !== 401) {
      return first;
    }

    refreshing ??= refresh().finally(() => void (refreshing = undefined));
    await refreshing;

    return next(input, init);
  };
};

/** Retries a GET that failed with a 5xx or did not connect, a bounded number of times. Never an unsafe method: a retried POST is a second order. */
const retryGet =
  (times: number): Interceptor =>
  (next) =>
  async (input, init) => {
    for (let attempt = 0; ; attempt += 1) {
      const safe = (init?.method ?? "GET") === "GET";

      try {
        const response = await next(input, init);

        if (!safe || response.status < 500 || attempt >= times) {
          return response;
        }
      } catch (error) {
        if (!safe || attempt >= times) {
          throw error;
        }
      }
    }
  };

const through = (transport: Fetch, ...interceptors: ReadonlyArray<Interceptor>): Fetch => interceptors.reduceRight((next, intercept) => intercept(next), transport);

describe("interception at the transport", () => {
  it("adds a credential to requests for the API's origin and to no other", async () => {
    const seen: Array<Record<string, string>> = [];
    const transport = vi.fn<Fetch>(async (_input, init) => (seen.push(headersOf(init)), ok()));
    const client = webHttp({
      base: "/api",
      fetch: through(
        transport,
        bearer("https://page.example", () => "t0ken"),
      ),
    });

    await Effect.runPromise(client.request({ path: "/items/1", response: Item }));
    expect(seen[0]).toMatchObject({ authorization: "Bearer t0ken" });

    const elsewhere = webHttp({
      base: "https://api.other.example",
      fetch: through(
        transport,
        bearer("https://page.example", () => "t0ken"),
      ),
    });

    await Effect.runPromise(elsewhere.request({ path: "/items/1", response: Item }));
    expect(seen[1]).not.toHaveProperty("authorization");
  });

  it("refreshes an expired session once for several requests that failed together, and retries each once", async () => {
    let valid = false;
    const refresh = vi.fn<() => Promise<void>>(async () => void (valid = true));
    const transport = vi.fn<Fetch>(async () => (valid ? ok() : status(401)));
    const client = webHttp({ base: "", fetch: through(transport, refreshOn401(refresh)) });
    const results = await Promise.all([1, 2, 3].map(() => Effect.runPromise(client.request({ path: "/items/1", response: Item }))));

    expect(results).toHaveLength(3);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(6);
  });

  it("retries a GET that failed on the server, and never a POST", async () => {
    let calls = 0;
    const flaky = vi.fn<Fetch>(async () => (++calls < 3 ? status(503) : ok()));

    await Effect.runPromise(webHttp({ base: "", fetch: through(flaky, retryGet(3)) }).request({ path: "/items/1", response: Item }));
    expect(flaky).toHaveBeenCalledTimes(3);

    const post = vi.fn<Fetch>(async () => status(503));
    const exit = await Effect.runPromiseExit(webHttp({ base: "", fetch: through(post, retryGet(3)) }).request({ method: "POST", path: "/items", body: {}, response: Item }));

    expect(post).toHaveBeenCalledTimes(1);
    expect(exit._tag).toBe("Failure");
  });

  it("is not able to send a request to another origin from the path: the client's own check runs before any interceptor", async () => {
    const transport = vi.fn<Fetch>(async () => ok());
    const exit = await Effect.runPromiseExit(
      webHttp({
        base: "/api",
        fetch: through(
          transport,
          bearer("https://page.example", () => "t0ken"),
        ),
      }).request({ path: "//evil.example/x", response: Item }),
    );

    expect(exit._tag).toBe("Failure");
    expect(transport).not.toHaveBeenCalled();
  });
});
