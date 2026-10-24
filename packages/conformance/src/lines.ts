// The line-JSON protocol that carries the five operations to a PORT in another process or another language, one JSON message per line (Node: it reads and writes streams).
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

import type {
  Adapter,
  Capabilities,
  ForcedState,
  Interaction,
  Observation,
  Reported,
  Tree,
} from "./protocol.js";
import { Refused } from "./protocol.js";

// ---- the line-JSON protocol -----------------------------------------------------------------------------------------------------------------------------------------------

export type Request =
  | { readonly id: number; readonly op: "capabilities" }
  | { readonly id: number; readonly op: "load" | "update"; readonly tree: Tree }
  | { readonly id: number; readonly op: "observe"; readonly key: string }
  | {
      readonly id: number;
      readonly op: "interact";
      readonly key: string;
      readonly how: Interaction;
    }
  | {
      readonly id: number;
      readonly op: "force";
      readonly key: string;
      readonly state: ForcedState;
    }
  | { readonly id: number; readonly op: "unmount" };

export type Response =
  | { readonly id: number; readonly ok: true; readonly result?: unknown }
  | {
      readonly id: number;
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string };
    };

/** Serves `adapter` on lines: reads a request from `input`, writes its response to `output`. For a PORT written in this language that is run as a child process. */
export const serve = (
  adapter: Adapter,
  input: Readable,
  output: Writable,
): void => {
  const lines = createInterface({ input });
  let chain: Promise<void> = Promise.resolve();

  lines.on("line", (text) => {
    // one request at a time, in order
    chain = chain.then(async () => {
      const request = JSON.parse(text) as Request;
      let response: Response;

      try {
        const result =
          request.op === "capabilities"
            ? await adapter.capabilities()
            : request.op === "load"
              ? await adapter.load(request.tree)
              : request.op === "update"
                ? await adapter.update(request.tree)
                : request.op === "observe"
                  ? ((await adapter.observe(request.key)) ?? null)
                  : request.op === "interact"
                    ? await adapter.interact(request.key, request.how)
                    : request.op === "force"
                      ? await adapter.force?.(request.key, request.state)
                      : await adapter.unmount();

        response = {
          id: request.id,
          ok: true,
          ...(result === undefined ? {} : { result }),
        };
      } catch (error) {
        response = {
          id: request.id,
          ok: false,
          error: {
            code: error instanceof Refused ? error.code : "error",
            message: error instanceof Error ? error.message : String(error),
          },
        };
      }

      output.write(`${JSON.stringify(response)}\n`);
    });
  });
};

/** An adapter that talks to a PORT's adapter over lines: the other end of `serve`, or of any language's server of the same messages. */
export const connect = (input: Readable, output: Writable): Adapter => {
  const waiting = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  let next = 0;

  createInterface({ input }).on("line", (text) => {
    const response = JSON.parse(text) as Response;
    const pending = waiting.get(response.id);

    waiting.delete(response.id);

    if (pending === undefined) {
      return;
    }

    if (response.ok) {
      pending.resolve(response.result);
    } else {
      pending.reject(new Refused(response.error.code, response.error.message));
    }
  });

  const ask = <T>(
    request: Omit<Request, "id"> & Record<string, unknown>,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      next += 1;
      waiting.set(next, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      output.write(`${JSON.stringify({ id: next, ...request })}\n`);
    });

  return {
    capabilities: () => ask<Capabilities>({ op: "capabilities" }),
    load: (tree) => ask<void>({ op: "load", tree }),
    update: (tree) => ask<void>({ op: "update", tree }),
    observe: async (key) =>
      (await ask<Observation | null>({ op: "observe", key })) ?? undefined,
    interact: (key, how) =>
      ask<ReadonlyArray<Reported>>({ op: "interact", key, how }),
    force: (key, state) => ask<void>({ op: "force", key, state }),
    unmount: () => ask<void>({ op: "unmount" }),
  };
};
