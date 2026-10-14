// The engine side of a native host. The application runs here, in JavaScript, with its state, commands and router; a renderer, a separate native process, draws the screen and reports what the person
// did. They talk in lines of JSON over two byte streams (a child process's stdin and stdout, or any pair). The renderer never sees a command, a state or a route: only the render tree and the
// opaque handler identifiers in it, which is all PORT's contract gives a renderer. See PROTOCOL.md.
import type { BoundaryValue, RenderTree } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import type { Report, Target } from "@valancex/valance";
import { Effect } from "effect";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

export const PROTOCOL = 1;
/** The longest inbound line the engine reads, in characters. A renderer that sends more is cut off. */
export const MAX_LINE = 64 * 1024;
/** The longest address a link may carry, in characters. */
export const MAX_HREF = 2048;

/** What the engine sends. */
export type Outbound =
  | { readonly op: "hello"; readonly protocol: number; readonly app: string }
  | { readonly op: "draw" | "update"; readonly tree: RenderTree }
  | { readonly op: "unmount" }
  /** What the window is called. Sent before the first screen and whenever it changes: the window is the host's, so the application says its title, not a template. */
  | { readonly op: "title"; readonly title: string }
  /** The answer to `closeRequested`. When `allowed`, the engine is closing and `unmount` follows; when not, the window stays open. */
  | { readonly op: "closeAnswer"; readonly allowed: boolean };

/** What a renderer sends. */
export type Inbound =
  | { readonly op: "ready" }
  | { readonly op: "event"; readonly handler: string; readonly payload?: BoundaryValue }
  | { readonly op: "close" }
  /** The person activated a link. A link is an address, not an event: the tree has its `href` and no handler, so the PORT says which address and the application decides what it means. */
  | { readonly op: "link"; readonly href: string }
  /** The person asked to close the window. The engine decides (unsaved edits), and answers with `closeAnswer`. */
  | { readonly op: "closeRequested" };

const jsonValue = (value: unknown, depth = 0): value is BoundaryValue => {
  if (depth > 8) {
    return false;
  }
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.length <= 1024 && value.every((each) => jsonValue(each, depth + 1));
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value) as unknown;

    return (proto === Object.prototype || proto === null) && Object.entries(value).every(([key, each]) => key !== "__proto__" && jsonValue(each, depth + 1));
  }

  return false;
};

/** One line from the renderer, or `undefined` for anything that is not a message of the protocol. The renderer is a separate program: nothing it sends is trusted until it has this shape. */
export const parseInbound = (line: string): Inbound | undefined => {
  if (line.length > MAX_LINE) {
    return undefined;
  }

  let message: unknown;

  try {
    message = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (typeof message !== "object" || message === null) {
    return undefined;
  }

  const { op, handler, payload, href } = message as { readonly op?: unknown; readonly handler?: unknown; readonly payload?: unknown; readonly href?: unknown };

  if (op === "ready" || op === "close" || op === "closeRequested") {
    return { op };
  }
  // oxlint-disable-next-line no-control-regex -- refusing control characters in an address is the point
  if (op === "link" && typeof href === "string" && href.length <= MAX_HREF && !/[\u0000-\u001f\u007f]/.test(href)) {
    return { op, href };
  }
  if (op === "event" && typeof handler === "string" && handler.length <= 256 && (payload === undefined || jsonValue(payload))) {
    return payload === undefined ? { op, handler } : { op, handler, payload };
  }

  return undefined;
};

export interface HostOptions<S, E = unknown> {
  /** What a link means. Called with the address the person activated and the application's handle; absent: links do nothing. The address is untrusted text from another program. */
  readonly onLink?: (href: string, handle: Valance.ApplicationHandle<S, E>) => Effect.Effect<void, unknown>;
  /** The window's title for a state. Absent: the window keeps its own. */
  readonly titleOf?: (state: S) => string;
  /** May the application close now? Asked when the renderer says the person wants to close the window. Absent: always. */
  readonly mayClose?: (state: S) => Effect.Effect<boolean>;
}

export interface HostStreams {
  /** The renderer's messages, a line each. */
  readonly input: Readable;
  /** The engine's messages, a line each. */
  readonly output: Writable;
}

export interface Served {
  /** How many inbound lines were not messages of the protocol (and so ignored). */
  readonly ignored: number;
}

/**
 * Runs `app` for a renderer on `streams` until the renderer closes (a `close` message, or its stream ending). The application lives exactly as long as this effect; when it ends, the
 * application is closed and its work cancelled.
 */
export const serve = <S, E, R extends Valance.Ambient, V extends string>(
  app: Valance.ApplicationDefinition<S, E, R, V>,
  streams: HostStreams,
  options: HostOptions<S> = {},
): Effect.Effect<Served, unknown> =>
  Effect.scoped(
    Effect.gen(function* () {
      const send = (message: Outbound): void => void streams.output.write(`${JSON.stringify(message)}\n`);
      let report: Report | undefined;
      let ignored = 0;
      const handle = yield* Valance.start(app);

      send({ op: "hello", protocol: PROTOCOL, app: app.name }); // before the first screen: a renderer checks the protocol before it draws anything

      let titled: string | undefined;
      // The title follows the state a screen is drawn for; sent only when it changed, and before the screen that goes with it.
      const retitle = (): void => {
        if (options.titleOf !== undefined) {
          const title = options.titleOf(Effect.runSync(handle.state));

          if (title !== titled) {
            titled = title;
            send({ op: "title", title });
          }
        }
      };

      yield* Valance.mount(handle, (reportEvent): Target => {
        report = reportEvent;

        return {
          draw: (tree) => (retitle(), send({ op: "draw", tree })),
          update: (tree) => (retitle(), send({ op: "update", tree })),
          unmount: () => send({ op: "unmount" }),
        };
      });

      yield* Effect.async<void>((resume) => {
        const lines = createInterface({ input: streams.input, crlfDelay: Infinity });
        const done = (): void => {
          lines.close();
          resume(Effect.void);
        };

        lines.on("line", (line) => {
          const message = parseInbound(line);

          if (message === undefined) {
            ignored += 1;
          } else if (message.op === "close") {
            done();
          } else if (message.op === "event" && report !== undefined) {
            report(message.handler, message.payload);
          } else if (message.op === "link") {
            if (options.onLink !== undefined) {
              void Effect.runPromise(options.onLink(message.href, handle)).catch(() => undefined);
            }
          } else if (message.op === "closeRequested") {
            void Effect.runPromise(Effect.flatMap(handle.state, (state) => options.mayClose?.(state) ?? Effect.succeed(true))).then(
              (allowed) => {
                send({ op: "closeAnswer", allowed });

                if (allowed) {
                  done();
                }
              },
              () => send({ op: "closeAnswer", allowed: false }),
            );
          }
        });
        lines.on("close", done);

        return Effect.sync(() => lines.close());
      });

      return { ignored } satisfies Served;
    }),
  );
