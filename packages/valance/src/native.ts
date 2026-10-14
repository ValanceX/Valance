/// <reference types="node" />
// The engine side of a native host: `Native.run` is to a window what `Web.run` is to a page. The application runs here, in JavaScript, with its state, commands and router; a renderer (a PORT, a
// separate native process) draws the screen and reports what the person did. They talk in lines of JSON over two byte streams (the engine's stdin and stdout, or any pair). The renderer never sees a
// command, a state or a route: only the render tree and the opaque handler identifiers in it, which is all PORT's contract gives a renderer. The protocol is specified in the Desktop PORT's
// architecture note (github.com/ValanceX/Port, docs/architecture/2026-10-14-port-desktop.md). Node only.
import type { BoundaryValue, RenderTree } from "@valancex/mesh-runtime";
import { Effect, Logger } from "effect";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

import * as Valance from "./index.js";
import type { Report, Target } from "./index.js";

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
  /** How the application asks the window to look: `light` or `dark`, or `system` for the person's own. Sent before the first screen and whenever it changes. */
  | { readonly op: "appearance"; readonly appearance: "light" | "dark" | "system" }
  /** The answer to `closeRequested`. When `allowed`, the engine is closing and `unmount` follows; when not, the window stays open. */
  | { readonly op: "closeAnswer"; readonly allowed: boolean };

/** What a renderer sends. */
export type Inbound =
  | { readonly op: "ready" }
  | { readonly op: "event"; readonly handler: string; readonly payload?: BoundaryValue }
  | { readonly op: "close" }
  /** The person activated a link. A link is an address, not an event: the tree has its `href` and no handler, so the PORT says which address and the application decides what it means. */
  | { readonly op: "link"; readonly href: string }
  /** The system's colors, as the window sees them: sent when the window opens and whenever they change. The application learns them as state (`colorScheme`). */
  | { readonly op: "scheme"; readonly scheme: "light" | "dark" }
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

  const { op, handler, payload, href, scheme } = message as {
    readonly op?: unknown;
    readonly handler?: unknown;
    readonly payload?: unknown;
    readonly href?: unknown;
    readonly scheme?: unknown;
  };

  if (op === "ready" || op === "close" || op === "closeRequested") {
    return { op };
  }
  // oxlint-disable-next-line no-control-regex -- refusing control characters in an address is the point
  if (op === "link" && typeof href === "string" && href.length <= MAX_HREF && !/[\u0000-\u001f\u007f]/.test(href)) {
    return { op, href };
  }
  if (op === "scheme" && (scheme === "light" || scheme === "dark")) {
    return { op, scheme };
  }
  if (op === "event" && typeof handler === "string" && handler.length <= 256 && (payload === undefined || jsonValue(payload))) {
    return payload === undefined ? { op, handler } : { op, handler, payload };
  }

  return undefined;
};

export interface HostOptions<S, E = unknown> {
  /** What the application asks the window to look like for a state. Absent: the window follows the system. */
  readonly appearanceOf?: (state: S) => "light" | "dark" | "system";
  /** The system's colors changed (or were first told): what that means to the application. Called with the scheme and the application's handle; absent: ignored. */
  readonly onScheme?: (scheme: "light" | "dark", handle: Valance.ApplicationHandle<S, E>) => Effect.Effect<void, unknown>;
  /** What a link means. Called with the address the person activated and the application's handle; absent: links do nothing. The address is untrusted text from another program. */
  readonly onLink?: (href: string, handle: Valance.ApplicationHandle<S, E>) => Effect.Effect<void, unknown>;
  /** The window's title for a state. Absent: the window keeps its own. */
  readonly titleOf?: (state: S) => string;
  /**
   * What the engine does to a tree on its way to the renderer, for a screen and for an update: it is given the tree and returns the one to send. For what only the host knows and the
   * application does not (the desktop's host turns an image's address into the file it shipped beside the engine). Absent: the tree as it is.
   */
  readonly present?: (tree: RenderTree) => RenderTree;
  /** What the platform supplies the application: its capabilities (a store, a client), as the web's page supplies the browser's. Absent: none. */
  readonly platform?: Valance.StartOptions<S>["platform"];
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
  options: HostOptions<S, E> = {},
): Effect.Effect<Served, unknown> =>
  Effect.scoped(
    Effect.gen(function* () {
      const send = (message: Outbound): void => void streams.output.write(`${JSON.stringify(message)}\n`);
      let report: Report | undefined;
      let ignored = 0;
      const handle = yield* Valance.start(app, options.platform === undefined ? {} : { platform: options.platform });

      send({ op: "hello", protocol: PROTOCOL, app: app.name }); // before the first screen: a renderer checks the protocol before it draws anything

      let appearance: string | undefined;
      let titled: string | undefined;
      // The title follows the state a screen is drawn for; sent only when it changed, and before the screen that goes with it.
      const retitle = (): void => {
        if (options.appearanceOf !== undefined) {
          const asked = options.appearanceOf(Effect.runSync(handle.state));

          if (asked !== appearance) {
            appearance = asked;
            send({ op: "appearance", appearance: asked });
          }
        }
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
          draw: (tree) => (retitle(), send({ op: "draw", tree: options.present?.(tree) ?? tree })),
          update: (tree) => (retitle(), send({ op: "update", tree: options.present?.(tree) ?? tree })),
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
          } else if (message.op === "scheme") {
            if (options.onScheme !== undefined) {
              void Effect.runPromise(options.onScheme(message.scheme, handle)).catch(() => undefined);
            }
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

/** The engine's log, on stderr: stdout is the protocol, and a line of anything else on it would be taken for a message. */
const toStderr = Logger.replace(
  Logger.defaultLogger,
  Logger.map(Logger.logfmtLogger, (line) => void process.stderr.write(`${line}\n`)),
);

export interface RunOptions<S, E = unknown> extends HostOptions<S, E> {
  /** Default the process's stdin and stdout. Tests and tools pass their own. */
  readonly streams?: HostStreams;
}

/**
 * Runs `app` as a native engine: the application on the process's stdin and stdout, for a PORT (a window) to start and talk to. It is the whole of an engine's `main`:
 *
 *     await Native.run(app, { titleOf: (state) => state.title, mayClose: (state) => Effect.succeed(!state.dirty) });
 *
 * It returns when the renderer closes (a `close` message, or its stream ending), after the application has been closed and its work cancelled. Because stdout carries the protocol, `run` sends
 * the application's log (Effect's logger, and `console.log`, `info` and `debug`) to stderr; a program that writes its own bytes to stdout will corrupt the conversation.
 */
export const run = <S, E, R extends Valance.Ambient, V extends string>(app: Valance.ApplicationDefinition<S, E, R, V>, options: RunOptions<S, E> = {}): Promise<Served> => {
  const streams = options.streams ?? { input: process.stdin, output: process.stdout };

  for (const name of ["log", "info", "debug"] as const) {
    console[name] = (...args: ReadonlyArray<unknown>): void => console.error(...args);
  }
  if (options.streams === undefined) {
    process.stdin.setEncoding("utf8");
  }

  return Effect.runPromise(serve(app, streams, options).pipe(Effect.provide(toStderr)));
};
