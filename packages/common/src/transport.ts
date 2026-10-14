// The shapes the HTTP capability and its interceptors share. Types only, so the authoring entry can name them without loading any of the client.
import type { Effect } from "effect";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Why a request did not give a value. None of them carries the response text, the address or a header: those can hold a secret. */
export type HttpError =
  | { readonly _tag: "Offline" }
  | { readonly _tag: "Status"; readonly status: number }
  | { readonly _tag: "Decode" }
  | { readonly _tag: "Timeout" }
  | { readonly _tag: "Aborted" }
  | { readonly _tag: "TooLarge" }
  | { readonly _tag: "Unsafe"; readonly reason: string };

/** The request as it goes out: already checked, with its final address. Headers are lower-case. */
export interface TransportRequest {
  readonly method: Method;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs: number;
}

/** The answer as it came back, whatever its status. Headers are lower-case. `text` is empty for no content. */
export interface TransportResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly text: string;
}

export type Transport = (request: TransportRequest) => Effect.Effect<TransportResponse, HttpError>;

/** Wraps the next transport: change the request on the way in, the answer on the way out, call `next` more than once (retry) or not at all (a cached answer). */
export type Interceptor = (next: Transport) => Transport;
