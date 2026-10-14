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
import { Effect, Schema } from "effect";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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
  /** Milliseconds before the request is given up (`Timeout`). Default 15 000. */
  readonly timeoutMs?: number;
}

/** Why a request did not give a value. None of them carries the response text, the address or a header: those can hold a secret. */
export type HttpError =
  | { readonly _tag: "Offline" }
  | { readonly _tag: "Status"; readonly status: number }
  | { readonly _tag: "Decode" }
  | { readonly _tag: "Timeout" }
  | { readonly _tag: "Aborted" }
  | { readonly _tag: "TooLarge" }
  | { readonly _tag: "Unsafe"; readonly reason: string };

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

// ---- the web's implementation ------------------------------------------------------------------------------------------------------------------------------------

export interface WebHttpOptions {
  /** `api.base` in `valance.web.json`: `""` (the site's own origin), a path (`/api`) or an absolute https address. */
  readonly base: string;
  /** Default `globalThis.fetch`. Tests pass their own. */
  readonly fetch?: typeof fetch;
  /** Send cookies to an `api.base` on another origin. Default off: a cross-origin backend gets no ambient credentials unless the application says so. */
  readonly credentials?: "same-origin" | "include";
  /** The largest answer read, in characters. Default 5 000 000. */
  readonly maxResponse?: number;
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

export const webHttp = (options: WebHttpOptions): HttpClient => {
  const send = options.fetch ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const crossOrigin = /^https?:\/\//i.test(options.base);

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

        const timeout = spec.timeoutMs ?? DEFAULT_TIMEOUT;
        const text = yield* Effect.tryPromise({
          try: async (signal) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort("timeout"), timeout);
            const stop = (): void => controller.abort("aborted");

            signal.addEventListener("abort", stop, { once: true });

            try {
              const response = await send(address.url, {
                method,
                headers: {
                  accept: "application/json",
                  ...(body === undefined ? {} : { "content-type": "application/json" }),
                  // A header a plain cross-site form cannot send: with the backend checking it (or SameSite cookies), a forged request from another page has nothing to ride on.
                  ...(UNSAFE_METHODS.has(method) ? { "x-requested-with": "valance" } : {}),
                },
                ...(body === undefined ? {} : { body }),
                credentials: crossOrigin ? (options.credentials ?? "omit") : "same-origin",
                redirect: "follow",
                referrerPolicy: "strict-origin-when-cross-origin",
                cache: "no-store",
                signal: controller.signal,
              });

              if (!response.ok) {
                throw { _tag: "Status", status: response.status } satisfies HttpError;
              }
              if (response.status === 204) {
                return "";
              }
              if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(response.headers.get("content-type") ?? "")) {
                throw { _tag: "Decode" } satisfies HttpError; // an HTML error page or a proxy's reply is not the API's answer
              }

              const read = await response.text();

              if (read.length > (options.maxResponse ?? DEFAULT_MAX)) {
                throw { _tag: "TooLarge" } satisfies HttpError;
              }

              return read;
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
          catch: (error): HttpError => {
            if (typeof error === "object" && error !== null && "_tag" in error) {
              return error as HttpError;
            }

            return { _tag: "Offline" };
          },
        });

        const json = yield* Effect.try({ try: () => (text === "" ? undefined : (JSON.parse(text) as unknown)), catch: (): HttpError => ({ _tag: "Decode" }) });

        return yield* Schema.decodeUnknown(spec.response)(json).pipe(Effect.mapError((): HttpError => ({ _tag: "Decode" })));
      }),
  };
};

/** The platform for a web page: the `Http` capability, made from `api.base`. Merged with the application's own by `Web.run`. */
export const webPlatform = (options: WebHttpOptions): Nexus.Application.Platform =>
  Nexus.Capability.EnvironmentLive(new Map([[Http.id, { _tag: "Available" as const, implementation: webHttp(options) }]]));
