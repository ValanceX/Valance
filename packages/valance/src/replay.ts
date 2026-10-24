/**
 * Replay: the session log, its player and its recorder (direction Bet 15; decisions R1 to R15). Provisional, and a development feature: nothing in the application's own code or in a production
 * build imports it. The format is the one MESH publishes with its conformance vectors (`@valancex/mesh-conformance`, `replay/README.md`): line-JSON, appendable and readable after a crash.
 *
 * - A **log** is `header`, `changes`, `event`, `tree` and `result` lines. Only inputs and hashes are recorded: the snapshot the host presented, the events a PORT reported with the render they were
 *   drawn against and what the runtime made of them, and a SHA-256 of every tree.
 * - The **player** (`replay`) renders the header's snapshot and applies the log by three routes, an `updateChanges` chain, an `update` chain over whole snapshots, and a `render` of each snapshot,
 *   and reports the first line where a route differs from the log. It never runs a command, reads a clock or draws a random number.
 * - The **recorder** (`recorder`) is what a mount takes as `MountOptions.record`: it writes the lines of the session it follows. It is for development; a log holds the user's data.
 *
 * Names no PORT and nothing of the web: it needs the MESH runtime and `globalThis.crypto`.
 */
import type { Change, Render, RenderTree } from "@valancex/mesh-runtime";
import { diff, dispatch, render, update, updateChanges } from "@valancex/mesh-runtime";

/** The format number this version reads and writes. */
export const FORMAT = 1;

/** What the runtime made of an event: the command intent, or the code of its first diagnostic. */
export type Outcome = { readonly intent: unknown } | { readonly diag: string };

export type SessionLine =
  | {
      readonly line: "header";
      readonly format: number;
      /** The version of the runtime that recorded the log: information. */
      readonly runtime?: string;
      /** The view (program) this segment is of, for an application with more than one. */
      readonly view?: string;
      /** SHA-256 of the program: the template sources (MESH's vectors) or the compiled templates (`hashes: "templates"`, what a recording by this package writes), in order, each followed by a NUL. */
      readonly program: string;
      /** SHA-256 of the manifest text. */
      readonly manifest: string;
      readonly hashes?: "sources" | "templates";
      readonly snapshot: Record<string, unknown>;
    }
  | { readonly line: "changes"; readonly changes: ReadonlyArray<Change>; readonly rejects?: string }
  | { readonly line: "event"; readonly n: number; readonly on: number; readonly handler: string; readonly payload?: unknown; readonly out: Outcome; readonly origin?: "early" }
  | { readonly line: "tree"; readonly sha256: string; readonly tree?: RenderTree }
  | { readonly line: "result"; readonly of?: number; readonly data?: unknown };

/** The checkpoint interval: the whole tree is written at every 50th line and at the end. */
export const CHECKPOINT = 50;

// ---- hashing -------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** The compact JSON of a value as MESH writes a tree: members in key order, numbers as `String` writes them, `-0` as `-0`. */
export const compact = (value: unknown): string => {
  if (value === null || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "number") {
    return Object.is(value, -0) ? "-0" : String(value);
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(compact).join(",")}]`;
  }

  const record = value as Record<string, unknown>;

  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${compact(record[key])}`)
    .join(",")}}`;
};

/** SHA-256 of `text`, in lower-case hexadecimal. */
export const sha256 = async (text: string): Promise<string> =>
  Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), (byte) => byte.toString(16).padStart(2, "0")).join("");

/** The hash of a tree. */
export const treeHash = (tree: RenderTree): Promise<string> => sha256(compact(tree));

/** What a program is hashed from: the texts of its templates (or sources), in order, each followed by a NUL. */
export const programHash = (texts: ReadonlyArray<string>): Promise<string> => sha256(texts.map((text) => `${text}\0`).join(""));

// ---- lines -------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** One line as a log writes it: `line` first, the other members in key order. */
export const formatLine = (line: SessionLine): string => {
  const { line: kind, ...rest } = line as { line: string } & Record<string, unknown>;
  const body = compact(rest);

  return body === "{}" ? `{"line":${JSON.stringify(kind)}}` : `{"line":${JSON.stringify(kind)},${body.slice(1)}`;
};

/** The lines of a log's text. A line that is not JSON, or has no known `line`, is an error that names it. */
export const parseLog = (text: string): ReadonlyArray<SessionLine> =>
  text
    .split("\n")
    .filter((each) => each.trim() !== "")
    .map((each, index) => {
      let line: SessionLine;

      try {
        line = JSON.parse(each) as SessionLine;
      } catch {
        throw new Error(`log line ${index + 1} is not JSON`);
      }

      if (!["header", "changes", "event", "tree", "result"].includes((line as { line?: unknown }).line as string)) {
        throw new Error(`log line ${index + 1} has no known \`line\`: ${JSON.stringify((line as { line?: unknown }).line)}`);
      }

      return line;
    });

// ---- the player --------------------------------------------------------------------------------------------------------------------------------------------------------------

/** What the player needs to render a segment: the program (compiled templates) and the manifest text, with their hashes when the log's are to be checked. */
export interface ReplaySetup {
  readonly program: { readonly root: string; readonly templates: ReadonlyArray<string> };
  readonly model: string;
  /** If given, the header's `program` and `manifest` must be these. */
  readonly hashes?: { readonly program: string; readonly manifest: string };
}

export type Route = "changes" | "update" | "render";

export const ROUTES: ReadonlyArray<Route> = ["changes", "update", "render"];

/** The first place a route differs from the log. */
export interface Divergence {
  /** The 1-based line of the log. */
  readonly line: number;
  readonly kind: "program" | "manifest" | "tree" | "event" | "changes" | "render";
  readonly expected: unknown;
  readonly actual: unknown;
  /** The tree the route gave, at a `tree` line that has a checkpoint. */
  readonly tree?: unknown;
}

export interface RouteResult {
  readonly route: Route;
  readonly ok: boolean;
  /** The tree hashes the route gave, in order, up to a divergence. */
  readonly hashes: ReadonlyArray<string>;
  readonly divergence?: Divergence;
}

export interface ReplayResult {
  /** Every route gave what the log says. */
  readonly ok: boolean;
  /** The routes gave the same hashes (the equivalence law, at the scale of a session). */
  readonly agree: boolean;
  readonly routes: ReadonlyArray<RouteResult>;
  /** The number of `tree` lines. */
  readonly trees: number;
}

export interface ReplayOptions {
  readonly routes?: ReadonlyArray<Route>;
}

const clone = <T>(value: T): T => structuredClone(value);

/** Applies host-side changes to a plain snapshot: `set`, `insert` and `remove` at a path of field names and list indices. */
export const applyChanges = (snapshot: Record<string, unknown>, changes: ReadonlyArray<Change>): void => {
  for (const change of changes) {
    let at = snapshot as Record<string | number, unknown>;

    for (const step of change.path.slice(0, -1)) {
      at = at[step] as Record<string | number, unknown>;
    }

    const last = change.path[change.path.length - 1] as string | number;
    const value = "value" in change ? clone(change.value) : undefined;

    if (change.op === "set") {
      at[last] = value;
    } else if (change.op === "insert") {
      (at as unknown as unknown[]).splice(last as number, 0, value);
    } else if (Array.isArray(at)) {
      at.splice(last as number, 1);
    } else {
      delete at[last];
    }
  }
};

const code = (result: { readonly diagnostics?: { readonly diagnostics: ReadonlyArray<{ readonly code: string }> } }): string => result.diagnostics?.diagnostics[0]?.code ?? "";

const outcomeOf = async (made: Render, handler: string, payload: unknown): Promise<Outcome> => {
  const result = await dispatch(made, handler, payload);

  return result.intent !== undefined ? { intent: result.intent } : { diag: code(result) };
};

/** Plays `lines` by one route. */
const playRoute = async (lines: ReadonlyArray<SessionLine>, setups: (header: Extract<SessionLine, { line: "header" }>) => ReplaySetup, route: Route): Promise<RouteResult> => {
  const hashes: string[] = [];
  const fail = (divergence: Divergence): RouteResult => ({ route, ok: false, hashes, divergence });
  let setup: ReplaySetup | undefined;
  let snapshot: Record<string, unknown> = {};
  let current: Render | undefined;
  let renders: Render[] = [];

  const start = async (from: Record<string, unknown>): Promise<Render | { readonly diagnostics: unknown }> => {
    const result = await render({ program: setup!.program, model: setup!.model, snapshot: clone(from) });

    return result.render ?? { diagnostics: result.diagnostics };
  };

  for (const [index, line] of lines.entries()) {
    const number = index + 1;

    if (line.line === "header") {
      if (line.format !== FORMAT) {
        return fail({ line: number, kind: "program", expected: `format ${FORMAT}`, actual: `format ${line.format}` });
      }

      setup = setups(line);

      if (setup.hashes !== undefined && setup.hashes.program !== line.program) {
        return fail({ line: number, kind: "program", expected: line.program, actual: setup.hashes.program });
      }

      if (setup.hashes !== undefined && setup.hashes.manifest !== line.manifest) {
        return fail({ line: number, kind: "manifest", expected: line.manifest, actual: setup.hashes.manifest });
      }

      snapshot = clone(line.snapshot);

      const first = await start(snapshot);

      if (!("tree" in first)) {
        return fail({ line: number, kind: "render", expected: "a render", actual: first.diagnostics });
      }

      current = first;
      renders = [first];
    } else if (current === undefined || setup === undefined) {
      return fail({ line: number, kind: "program", expected: "a header first", actual: line.line });
    } else if (line.line === "changes") {
      const next = clone(snapshot);

      applyChanges(next, line.changes);

      const result =
        route === "changes"
          ? await updateChanges(current, { base: current.version, changes: [...line.changes] })
          : route === "update"
            ? await update(current, clone(next))
            : await render({ program: setup.program, model: setup.model, snapshot: clone(next) });

      if (line.rejects !== undefined) {
        if (result.render !== undefined) {
          return fail({ line: number, kind: "changes", expected: `rejected with ${line.rejects}`, actual: "accepted" });
        }

        if (code(result) !== line.rejects) {
          return fail({ line: number, kind: "changes", expected: line.rejects, actual: code(result) });
        }
      } else if (result.render === undefined) {
        return fail({ line: number, kind: "changes", expected: "accepted", actual: code(result) });
      } else {
        snapshot = next;
        current = result.render;
        renders.push(current);
      }
    } else if (line.line === "event") {
      const against = renders[line.on];

      if (against === undefined) {
        return fail({ line: number, kind: "event", expected: `a tree ${line.on}`, actual: "none" });
      }

      const out = await outcomeOf(against, line.handler, line.payload);

      if (compact(out) !== compact(line.out)) {
        return fail({ line: number, kind: "event", expected: line.out, actual: out });
      }
    } else if (line.line === "tree") {
      const hash = await treeHash(current.tree);

      if (hash !== line.sha256) {
        return fail({ line: number, kind: "tree", expected: line.sha256, actual: hash, tree: current.tree });
      }

      if (line.tree !== undefined && compact(line.tree) !== compact(current.tree)) {
        return fail({ line: number, kind: "tree", expected: line.tree, actual: current.tree, tree: current.tree });
      }

      hashes.push(hash);
    }
  }

  return { route, ok: true, hashes };
};

/**
 * Replays a log by `routes` (all three by default) and says whether each gave what the log recorded, and whether they agree. `setup` gives the program for a header: one for a log of one program, or a
 * function of the header for a log of several views.
 */
export const replay = async (
  lines: ReadonlyArray<SessionLine>,
  setup: ReplaySetup | ((header: Extract<SessionLine, { line: "header" }>) => ReplaySetup),
  options?: ReplayOptions,
): Promise<ReplayResult> => {
  const setups = typeof setup === "function" ? setup : () => setup;
  const routes: RouteResult[] = [];

  for (const route of options?.routes ?? ROUTES) {
    routes.push(await playRoute(lines, setups, route));
  }

  const agree = routes.every((each) => JSON.stringify(each.hashes) === JSON.stringify(routes[0]?.hashes));

  return { ok: routes.every((each) => each.ok), agree, routes, trees: lines.filter((each) => each.line === "tree").length };
};

// ---- the recorder ------------------------------------------------------------------------------------------------------------------------------------------------------------

/** What a mount tells a recorder: the render it has just drawn, and the events the target reports. */
export interface SessionRecorder {
  /** A render was presented (drawn or updated): the view, the snapshot it was made from, and the render. */
  readonly presented: (made: { readonly view: string; readonly snapshot: Record<string, unknown>; readonly render: Render }) => void;
  /** The target reported an event, drawn against `render`. */
  readonly event: (reported: { readonly handler: string; readonly payload: unknown; readonly render: Render; readonly early?: boolean }) => void;
}

export interface RecorderOptions {
  /** Receives each line, in order. */
  readonly write: (line: string) => void;
  /** The version of the runtime that records (information). */
  readonly runtime?: string;
  /** For each view: the compiled templates in order, and the manifest text, so the header can hash them. */
  readonly programs: (view: string) => { readonly templates: ReadonlyArray<string>; readonly model: string };
}

/**
 * A recorder for `MountOptions.record`: writes a log of the session it follows. Hashing is asynchronous, so the lines are written in the order of what happened, by an internal queue;
 * `flush()` resolves when every line so far has been written.
 */
export const recorder = (options: RecorderOptions): SessionRecorder & { readonly flush: () => Promise<void> } => {
  let queue: Promise<void> = Promise.resolve();
  let view: string | undefined;
  let previous: Record<string, unknown> | undefined;
  let lines = 0;
  let sequence = 0;
  // The renders drawn in this segment, by ordinal: an event names the one it was drawn against.
  let drawn: Render[] = [];
  let last: Render | undefined;

  const write = (line: SessionLine): void => {
    lines += 1;
    options.write(formatLine(line));
  };
  const enqueue = (step: () => Promise<void>): void => {
    queue = queue.then(step).catch((error: unknown) => {
      // A recorder must not take the application down; the log says it broke.
      options.write(formatLine({ line: "result", data: { recorderError: String(error) } }));
    });
  };
  const treeLine = async (made: Render, final: boolean): Promise<SessionLine> => ({
    line: "tree",
    sha256: await treeHash(made.tree),
    ...(final || (lines + 1) % CHECKPOINT === 0 ? { tree: made.tree } : {}),
  });

  return {
    presented: (made) =>
      enqueue(async () => {
        const snapshot = clone(made.snapshot);

        if (view !== made.view || previous === undefined) {
          const { templates, model } = options.programs(made.view);

          view = made.view;
          drawn = [made.render];
          write({
            line: "header",
            format: FORMAT,
            ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
            view: made.view,
            program: await programHash(templates),
            manifest: await sha256(model),
            hashes: "templates",
            snapshot,
          });
        } else {
          drawn.push(made.render);
          write({ line: "changes", changes: diff(previous, snapshot) });
        }

        previous = snapshot;
        last = made.render;
        write(await treeLine(made.render, false));
      }),
    event: (reported) =>
      enqueue(async () => {
        const on = drawn.indexOf(reported.render);

        sequence += 1;
        write({
          line: "event",
          n: sequence,
          on: on < 0 ? drawn.length - 1 : on,
          handler: reported.handler,
          ...(reported.payload === undefined ? {} : { payload: reported.payload }),
          out: await outcomeOf(reported.render, reported.handler, reported.payload),
          ...(reported.early === true ? { origin: "early" as const } : {}),
        });
      }),
    flush: async () => {
      await queue;

      // The whole last tree, at the end.
      if (last !== undefined) {
        const final = last;

        last = undefined;
        write(await treeLine(final, true));
      }
    },
  };
};

/**
 * A writer for `recorder` that posts each line to `url`, one at a time and in order (a page's recorder, sending to the development server that `vlx dev --record` runs). A line that cannot
 * be sent is dropped: a recorder must not take the page down.
 */
export const postTo = (url: string): ((line: string) => void) => {
  let sent: Promise<void> = Promise.resolve();

  return (line) => {
    sent = sent.then(() =>
      fetch(url, { method: "POST", headers: { "content-type": "text/plain" }, body: line, keepalive: true }).then(
        () => undefined,
        () => undefined,
      ),
    );
  };
};
