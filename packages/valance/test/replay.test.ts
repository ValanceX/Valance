// Replay (Bet 15): a mount follows an application and a recorder writes its session as a log; the player replays that log by three routes and finds the first line where one differs. The
// application is a real one (state, commands, a MESH program with an event); the target is a recording one that reports what a person would.
import { compileProgram } from "@valancex/mesh-compiler";
import { Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { compact, formatLine, parseLog, programHash, recorder, replay, sha256, treeHash } from "../src/replay.js";
import type { SessionLine } from "../src/replay.js";

const model = JSON.stringify({
  version: 1,
  types: {},
  components: {
    page: {
      props: {},
      events: {},
      commands: { choose: { parameters: [] } },
      scope: {
        items: { kind: "list", element: { kind: "record", fields: { id: { type: { kind: "number" }, required: true }, label: { type: { kind: "string" }, required: true } } } },
      },
    },
    row: { props: {}, events: { press: {} }, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
  },
});
const compiled = await compileProgram({
  model: { manifest: model, path: "components.json" },
  root: "page",
  components: [{ component: "page", path: "page.mprx", source: "<text>{#each items as item (item.id)}<row on.press={choose()}>{item.label}</row>{/each}</text>" }],
});

if (compiled.program === undefined) {
  throw new Error(JSON.stringify(compiled.components));
}

const program = compiled.program as unknown as { readonly root: string; readonly templates: ReadonlyArray<string> };
const State = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.Number, label: Schema.String })), chosen: Schema.Number });
const application = Valance.define({
  name: "replay",
  state: {
    schema: State,
    initial: {
      items: [
        { id: 1, label: "one" },
        { id: 2, label: "two" },
      ],
      chosen: 0,
    },
  },
  views: { main: { program: compiled.program, scope: (s) => ({ items: s.items }) } },
  view: () => "main" as const,
  commands: (state) => {
    const command = Valance.command(state);
    const add = command(Schema.Struct({ id: Schema.Number }), ({ id }, current) => ({ ...current, items: [...current.items, { id, label: `item ${id}` }] }));
    const relabel = command(Schema.Struct({ label: Schema.String }), ({ label }, current) => ({
      ...current,
      items: current.items.map((item, index) => (index === 0 ? { ...item, label } : item)),
    }));
    const choose = command((current) => ({ ...current, chosen: current.chosen + 1 }));

    return {
      "app/add": Valance.entry(add, (value) => ({ id: Number(value) })),
      "app/relabel": Valance.entry(relabel, (value) => ({ label: String(value) })),
      "page/choose": choose,
    };
  },
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Records a session: two commands, a click on the first row, a stale click, one more command. */
const record = async (): Promise<string> => {
  const written: string[] = [];
  const recording = recorder({ write: (line) => written.push(line), runtime: "test", programs: () => ({ templates: program.templates, model }) });
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(application).pipe(Scope.extend(scope)));
  let report: Valance.Report = () => undefined;
  let tree: { readonly root: { readonly children: ReadonlyArray<{ readonly events?: Record<string, string> }> } } | undefined;
  const rows = () => (tree?.root.children ?? []).filter((child) => child.events !== undefined && "press" in child.events);

  await Effect.runPromise(
    Valance.mount(
      handle,
      (reporter) => {
        report = reporter;

        return {
          draw: (drawn) => void (tree = drawn as never),
          update: (drawn) => void (tree = drawn as never),
          unmount: () => undefined,
        };
      },
      { record: recording },
    ).pipe(Scope.extend(scope)),
  );

  await Effect.runPromise(handle.invoke("app/add", [{ value: 3 }]).pipe(Effect.orDie));
  await wait(40);

  const stale = rows()[0]!.events!["press"]!;

  report(stale);
  await wait(40);
  await Effect.runPromise(handle.invoke("app/relabel", [{ value: "renamed" }]).pipe(Effect.orDie));
  await wait(40);
  report(rows()[1]!.events!["press"]!);
  await wait(40);
  await Effect.runPromise(Scope.close(scope, Exit.void));
  await recording.flush();

  return written.join("\n");
};

const setup = async () => ({ program, model, hashes: { program: await programHash(program.templates), manifest: await sha256(model) } });

describe("the format", () => {
  it("writes a tree as MESH does: members in key order, -0 as -0, a line with `line` first", () => {
    expect(compact({ b: [1, -0, "x"], a: null })).toBe('{"a":null,"b":[1,-0,"x"]}');
    expect(formatLine({ line: "tree", sha256: "ab" })).toBe('{"line":"tree","sha256":"ab"}');
    expect(formatLine({ line: "event", n: 1, on: 0, handler: "h", out: { diag: "x" } })).toBe('{"line":"event","handler":"h","n":1,"on":0,"out":{"diag":"x"}}');
  });

  it("refuses a line that is not JSON and a line of no known kind, naming the line", () => {
    expect(() => parseLog('{"line":"tree"}\nnot json')).toThrow("log line 2 is not JSON");
    expect(() => parseLog('{"line":"mystery"}')).toThrow('log line 1 has no known `line`: "mystery"');
  });

  it("hashes a tree as the published vectors do (SHA-256 of the compact JSON)", async () => {
    const tree = { format: "mesh-render", root: { key: "k", type: "node" } } as never;

    expect(await treeHash(tree)).toBe(await sha256(compact(tree)));
    expect(await sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

describe("a recorded session", () => {
  it("is a log of the header, the changes, the events with what the runtime made of them, and the tree hashes", async () => {
    const lines = parseLog(await record());
    const kinds = lines.map((line) => line.line);

    expect(kinds[0]).toBe("header");
    expect(kinds.filter((kind) => kind === "changes")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "event")).toHaveLength(2);
    expect(kinds.at(-1)).toBe("tree");
    expect((lines.at(-1) as Extract<SessionLine, { line: "tree" }>).tree).toBeDefined();

    const events = lines.filter((line): line is Extract<SessionLine, { line: "event" }> => line.line === "event");

    // the first click was against the render before the relabel: its handler is the first row's; the second against the latest
    expect(events.map((event) => event.n)).toEqual([1, 2]);
    expect(events[0]!.out).toEqual({ intent: { arguments: [], command: { component: "page", name: "choose" } } });
    expect(JSON.stringify(lines[0])).not.toContain("base");
  });

  it("replays by all three routes to the recorded hashes, and the routes agree", async () => {
    const result = await replay(parseLog(await record()), await setup());

    expect(result.routes.map((route) => [route.route, route.ok])).toEqual([
      ["changes", true],
      ["update", true],
      ["render", true],
    ]);
    expect(result.agree).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.trees).toBeGreaterThanOrEqual(4);
  });

  it("finds the first line where a tree differs from the log, with the tree it gave", async () => {
    const lines = [...parseLog(await record())];
    const at = lines.findIndex((line, index) => index > 2 && line.line === "tree");

    lines[at] = { line: "tree", sha256: "0".repeat(64) };

    const result = await replay(lines, await setup());

    expect(result.ok).toBe(false);
    expect(result.routes.every((route) => route.divergence?.line === at + 1 && route.divergence.kind === "tree")).toBe(true);
    expect(result.routes[0]!.divergence!.tree).toBeDefined();
  });

  it("finds an event whose recorded outcome differs, and a program or manifest that is not the one recorded", async () => {
    const lines = [...parseLog(await record())];
    const at = lines.findIndex((line) => line.line === "event");
    const event = lines[at] as Extract<SessionLine, { line: "event" }>;

    lines[at] = { ...event, out: { diag: "runtime-unknown-handler" } };
    expect((await replay(lines, await setup())).routes[0]!.divergence).toMatchObject({ line: at + 1, kind: "event" });

    const other = await setup();

    expect((await replay(parseLog(await record()), { ...other, hashes: { ...other.hashes, manifest: "0".repeat(64) } })).routes[0]!.divergence?.kind).toBe("manifest");
    expect((await replay(parseLog(await record()), { ...other, hashes: { ...other.hashes, program: "0".repeat(64) } })).routes[0]!.divergence?.kind).toBe("program");
  });

  it("a stale handler is recorded against the render it was drawn against, and replays", async () => {
    const lines = parseLog(await record());
    const first = lines.find((line): line is Extract<SessionLine, { line: "event" }> => line.line === "event")!;

    // the first click came before the relabel and after the add: its `on` is the second tree (ordinal 1)
    expect(first.on).toBe(1);
  });
});
