// Talking to the application's backend. NEXUS and VALANCE hold no HTTP (their rule): what an application needs from where it runs is a *capability*, a typed contract the application states and the
// platform supplies. This is that contract for HTTP, and the web's implementation of it. A desktop or mobile platform supplies the same contract with its own client (the OS's networking, a
// keychain for the token), and no command changes.
//
//   const load = command.waiting(Schema.Struct({}), {
//     begin: (_, s) => ({ ...s, inbox: { status: "loading" } }),
//     work: () => Http.request({ path: "/inbox", response: Inbox }),     // Effect<Inbox, HttpError, the Http capability>
//     wanted: (_, s) => s.inbox.status === "loading",
//     settle: (outcome, _, s) => ({ ...s, inbox: outcome.ok ? { status: "ready", ...outcome.value } : { status: "failed", why: describe(outcome.error) } }),
//   });
//
// The defaults are the safe ones: a request goes to the application's own origin (or the one `api.base` names), carries no credentials to another origin, sends and accepts JSON, is
// bounded in time and size, and its response is *decoded by a Schema* before it can reach state. A failure says what kind it was and never what it carried.
import * as Nexus from "@valancex/nexus";
import { Effect, FiberRef, Schema } from "effect";

import { Store } from "./store.js";
import type { StoreClient } from "./store.js";
import type { HttpError, Interceptor, Method, Transport, TransportRequest, TransportResponse } from "./transport.js";

export type { HttpError, Interceptor, Method, Transport, TransportRequest, TransportResponse } from "./transport.js";

/** One request: where, what is sent, and what the answer must be. */
export interface RequestSpec<A> {
  readonly method?: Method;
  /** On the API's base: starts with `/` (not `//`), no scheme, no backslash. Anything else is `Unsafe`: a path built from data cannot send the request somewhere else. */
  readonly path: string;
  /** Appended to the address, encoded. `undefined` values are left out. */
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  /** Sent as JSON. */
  readonly body?: unknown;
  /** What the answer must be. The decoded value is what the command receives; an answer that is not this is `Decode`, and nothing else gets through. */
  readonly response: Schema.Schema<A, any, never>;
  /** Milliseconds before the request is given up (`Timeout`), for each attempt. Default 15 000. */
  readonly timeoutMs?: number;
  /** Interceptors for this request alone: the innermost, the closest to the wire (see `Interceptor`). */
  readonly interceptors?: ReadonlyArray<Interceptor>;
}

export interface HttpClient {
  readonly request: <A>(spec: RequestSpec<A>) => Effect.Effect<A, HttpError>;
}

/** The capability: ask for it in a command (`Http.request`), and the platform says whether it has one. */
export const Http = Nexus.Capability.define<HttpClient>("valance/http");

/** Makes a request through the platform's client. Requires the `Http` capability. */
export const request = <A>(spec: RequestSpec<A>): Effect.Effect<A, HttpError | Nexus.Capability.CapabilityUnavailableError, Nexus.Capability.EnvironmentShape> =>
  Effect.flatMap(Nexus.Capability.require(Http) as Effect.Effect<HttpClient, Nexus.Capability.CapabilityUnavailableError, Nexus.Capability.EnvironmentShape>, (client) =>
    client.request(spec),
  );

// ---- web options ------------------------------------------------------------------------------------------------------------------------------------

export interface WebHttpOptions {
  /** `api.base` in `valance.web.json`: `""` (the site's own origin), a path (`/api`) or an absolute https address. */
  readonly base: string;
  /** Default `globalThis.fetch`. Tests pass their own. */
  readonly fetch?: typeof fetch;
  /** Send cookies to an `api.base` on another origin. Default off: a cross-origin backend gets no ambient credentials unless the application says so. */
  readonly credentials?: "same-origin" | "include";
  /** The largest answer read, in characters. Default 5 000 000. */
  readonly maxResponse?: number;
  /** The application's interceptors, outermost first: the ones that hold for every request (`defineApp({ http: { interceptors } })`). Scoped ones are added by `withInterceptors` and `RequestSpec.interceptors`. */
  readonly interceptors?: ReadonlyArray<Interceptor>;
}

const UNSAFE_METHODS = new Set<Method>(["POST", "PUT", "PATCH", "DELETE"]);
const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MAX = 5_000_000;

/** The address for `path` under `base`, or why it cannot be one. */
export const addressOf = (base: string, path: string, query: RequestSpec<unknown>["query"]): { readonly url: string } | { readonly unsafe: string } => {
  // oxlint-disable-next-line no-control-regex -- refusing control characters in a path is the point
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /[\u0000-\u001f]/.test(path) || /^\/[^/?#]*:\/\//.test(path)) {
    return { unsafe: 'a path starts with a single "/" and holds no scheme, backslash or control character' };
  }
  if (path.split(/[/?#]/).includes("..")) {
    return { unsafe: 'a path does not climb out of the API ("..")' };
  }

  const search = new URLSearchParams();

  for (const [name, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      search.append(name, String(value));
    }
  }

  const tail = search.size === 0 ? "" : `${path.includes("?") ? "&" : "?"}${search.toString()}`;

  return { url: `${base.replace(/\/+$/, "")}${path}${tail}` };
};

// ---- interceptors ------------------------------------------------------------------------------------------------------------------------------------------
//
// One shape for all of them. A `Transport` takes the request the client built and checked, and gives the answer before the client decodes it. An `Interceptor` takes the next `Transport` and gives
// a `Transport`: so every interceptor has the same input and the same output, they chain by plain composition, and the only thing that differs between two is what they do. The client's own
// checks come first (the path, the method, the body) and last (the answer's status, type and Schema), so no interceptor can skip them. Failures are `HttpError`s, which carry no address, header or body.

/** Several interceptors as one, the first listed outermost: `chain(a, b)(t)` is `a(b(t))`. */
export const chain =
  (...interceptors: ReadonlyArray<Interceptor>): Interceptor =>
  (next) =>
    interceptors.reduceRight<Transport>((inner, intercept) => intercept(inner), next);

/** An interceptor that applies only to the requests `applies` accepts; every other request goes straight to the next. This is how a scope narrows: by address, by method, by anything the request says. */
export const only =
  (applies: (request: TransportRequest) => boolean, interceptor: Interceptor): Interceptor =>
  (next) => {
    const inner = interceptor(next);

    return (request) => (applies(request) ? inner(request) : next(request));
  };

/** The interceptors in force for the requests made inside `withInterceptors`. The client reads it for each request, so a scope reaches every request its effect makes, however deep. */
const scope = FiberRef.unsafeMake<ReadonlyArray<Interceptor>>([]);

/**
 * Runs `effect` with `interceptors` added for the requests it makes: a scope narrower than the application's. A scope inside another is inside it (the outer ones see the request first and the
 * answer last). It ends with the effect; a request made outside it is not touched.
 *
 *   work: () => withInterceptors(Http.request({ path: "/admin/users", response: Users }), bearer(...adminToken))
 */
export const withInterceptors = <A, E, R>(effect: Effect.Effect<A, E, R>, ...interceptors: ReadonlyArray<Interceptor>): Effect.Effect<A, E, R> =>
  Effect.locallyWith(effect, scope, (current) => [...current, ...interceptors]);

/** Whether the request goes to the origin the application's API is on (the base's, or the page's for a relative base). */
const sameApi = (base: string, url: string): boolean => {
  const origin = (value: string): string => {
    try {
      return new URL(value, "http://page.invalid").origin;
    } catch {
      return "";
    }
  };

  return origin(url) !== "" && origin(url) === origin(base === "" ? "/" : base);
};

/** Adds `Authorization: Bearer <token>` to requests for the API's origin and to no other: a credential never follows a request somewhere else. `base` is `api.base`. */
export const bearer =
  (base: string, token: () => string | undefined | Promise<string | undefined>): Interceptor =>
  (next) =>
  (request) =>
    !sameApi(base, request.url)
      ? next(request)
      : Effect.flatMap(
          Effect.promise(async () => token()),
          (value) => next(value === undefined ? request : { ...request, headers: { ...request.headers, authorization: `Bearer ${value}` } }),
        );

/** On a 401, runs `refresh` once however many requests failed together, then sends each of them once more. A second 401 is the answer. */
export const refreshOn401 = (refresh: () => Promise<void>): Interceptor => {
  let refreshing: Promise<void> | undefined;

  return (next) => (request) =>
    Effect.flatMap(next(request), (first) =>
      first.status !== 401
        ? Effect.succeed(first)
        : Effect.flatMap(
            Effect.tryPromise({
              try: async () => {
                refreshing ??= refresh().finally(() => void (refreshing = undefined));

                return refreshing;
              },
              catch: (): HttpError => ({ _tag: "Offline" }),
            }),
            () => next(request),
          ),
    );
};

/** Sends a GET again, up to `times` more, when it did not connect or the server failed (5xx). Never another method: a repeated POST is a second order. */
export const retryGet =
  (times: number): Interceptor =>
  (next) =>
  (request) => {
    const attempt = (n: number): Effect.Effect<TransportResponse, HttpError> =>
      request.method !== "GET"
        ? next(request)
        : next(request).pipe(
            Effect.flatMap((response) => (response.status >= 500 && n < times ? attempt(n + 1) : Effect.succeed(response))),
            Effect.catchTag("Offline", (error) => (n < times ? attempt(n + 1) : Effect.fail(error))),
          );

    return attempt(0);
  };

// ---- the web's implementation ------------------------------------------------------------------------------------------------------------------------------------

/** The last transport: `fetch`, with the timeout, the size bound and the safe defaults. It returns any status; the client judges it after the interceptors have seen it. */
const fetchTransport = (options: WebHttpOptions, crossOrigin: boolean): Transport => {
  const send = options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  return (request) =>
    Effect.tryPromise({
      try: async (signal) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort("timeout"), request.timeoutMs);
        const stop = (): void => controller.abort("aborted");

        signal.addEventListener("abort", stop, { once: true });

        try {
          const response = await send(request.url, {
            method: request.method,
            headers: { ...request.headers },
            ...(request.body === undefined ? {} : { body: request.body }),
            credentials: crossOrigin ? (options.credentials ?? "omit") : "same-origin",
            redirect: "follow",
            referrerPolicy: "strict-origin-when-cross-origin",
            cache: "no-store",
            signal: controller.signal,
          });
          const headers: Record<string, string> = {};

          response.headers.forEach((value, name) => void (headers[name.toLowerCase()] = value));

          const text = response.status === 204 ? "" : await response.text();

          if (text.length > (options.maxResponse ?? DEFAULT_MAX)) {
            throw { _tag: "TooLarge" } satisfies HttpError;
          }

          return { status: response.status, headers, text } satisfies TransportResponse;
        } catch (error) {
          // A fetch that was aborted rejects with the abort's reason, whatever that was: what we passed says who stopped it.
          if (controller.signal.aborted) {
            throw { _tag: controller.signal.reason === "timeout" ? "Timeout" : "Aborted" } satisfies HttpError;
          }

          throw error;
        } finally {
          clearTimeout(timer);
          signal.removeEventListener("abort", stop);
          if (controller.signal.aborted === false) {
            controller.abort("done");
          }
        }
      },
      catch: (error): HttpError => (typeof error === "object" && error !== null && "_tag" in error ? (error as HttpError) : { _tag: "Offline" }),
    });
};

export const webHttp = (options: WebHttpOptions): HttpClient => {
  const crossOrigin = /^https?:\/\//i.test(options.base);
  const wire = fetchTransport(options, crossOrigin);
  const global = chain(...(options.interceptors ?? []));

  return {
    request: <A>(spec: RequestSpec<A>): Effect.Effect<A, HttpError> =>
      Effect.gen(function* () {
        const method = spec.method ?? "GET";
        const address = addressOf(options.base, spec.path, spec.query);

        if ("unsafe" in address) {
          return yield* Effect.fail<HttpError>({ _tag: "Unsafe", reason: address.unsafe });
        }

        const body = spec.body === undefined ? undefined : JSON.stringify(spec.body);

        if (method === "GET" && body !== undefined) {
          return yield* Effect.fail<HttpError>({ _tag: "Unsafe", reason: "a GET request has no body" });
        }

        const request: TransportRequest = {
          method,
          url: address.url,
          headers: {
            accept: "application/json",
            ...(body === undefined ? {} : { "content-type": "application/json" }),
            // A header a plain cross-site form cannot send: with the backend checking it (or SameSite cookies), a forged request from another page has nothing to ride on.
            ...(UNSAFE_METHODS.has(method) ? { "x-requested-with": "valance" } : {}),
          },
          ...(body === undefined ? {} : { body }),
          timeoutMs: spec.timeoutMs ?? DEFAULT_TIMEOUT,
        };
        // Whatever the interceptors did to the request, it goes where the API is: the address is checked again as the wire gets it.
        const guarded: Transport = (final) =>
          sameApi(options.base, final.url) ? wire(final) : Effect.fail<HttpError>({ _tag: "Unsafe", reason: "an interceptor sent the request outside the API's origin" });
        const scoped = yield* FiberRef.get(scope);
        const response = yield* chain(global, ...scoped, ...(spec.interceptors ?? []))(guarded)(request);

        if (response.status < 200 || response.status >= 300) {
          return yield* Effect.fail<HttpError>({ _tag: "Status", status: response.status });
        }
        if (response.status !== 204 && !/^application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers["content-type"] ?? "")) {
          return yield* Effect.fail<HttpError>({ _tag: "Decode" }); // an HTML error page or a proxy's reply is not the API's answer
        }

        const json = yield* Effect.try({ try: () => (response.text === "" ? undefined : (JSON.parse(response.text) as unknown)), catch: (): HttpError => ({ _tag: "Decode" }) });

        return yield* Schema.decodeUnknown(spec.response)(json).pipe(Effect.mapError((): HttpError => ({ _tag: "Decode" })));
      }),
  };
};

/** The platform for a web page: the `Http` capability, made from `api.base`. Merged with the application's own by `Web.run`. */
export const webPlatform = (options: WebHttpOptions & { readonly store?: StoreClient }): Nexus.Application.Platform =>
  Nexus.Capability.EnvironmentLive(
    new Map<string, { readonly _tag: "Available"; readonly implementation: unknown }>([
      [Http.id, { _tag: "Available" as const, implementation: webHttp(options) }],
      ...(options.store === undefined ? [] : [[Store.id, { _tag: "Available" as const, implementation: options.store }] as const]),
    ]) as never,
  );
