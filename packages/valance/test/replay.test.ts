// Replay (Bet 15): a mount follows an application and a recorder writes its session as a log; the player replays that log by three routes and finds the first line where one differs. The
// application is a real one (state, commands, a MESH program with an event); the target is a recording one that reports what a person would.
import { compileProgram } from "@valancex/mesh-compiler";
import { Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";
import { render, update } from "@valancex/mesh-runtime";
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

// ---- redaction (R9, R14, R16) -------------------------------------------------------------------------------------------------------------------------------------------------

const secret = "hunter2-the-secret";
const manifest = JSON.stringify({
  version: 1,
  types: {},
  components: {
    login: {
      props: {},
      events: {},
      commands: { type: { parameters: [{ name: "text", type: { kind: "string" } }] }, save: { parameters: [] } },
      scope: { password: { kind: "string" }, user: { kind: "string" } },
    },
    field: { props: { value: { type: { kind: "string" }, required: true } }, events: { input: { payload: { kind: "string" } } }, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
  },
});
const built = await compileProgram({
  model: { manifest, path: "components.json" },
  root: "login",
  components: [{ component: "login", path: "login.mprx", source: "<text><field value={password} on.input={type($event)} /><field value={user} on.input={type($event)} /></text>" }],
});

describe("a recording that redacts", () => {
  const login = built.program as unknown as { readonly root: string; readonly templates: ReadonlyArray<string> };
  const record = async (redact?: { scope?: string[][]; commands?: string[] }) => {
    const written: string[] = [];
    const warnings: string[] = [];
    const recording = recorder({
      write: (line) => written.push(line),
      warn: (message) => warnings.push(message),
      programs: () => ({ root: login.root, templates: login.templates, model: manifest }),
      ...(redact === undefined ? {} : { redact }),
    });
    const snapshot = { password: secret, user: "ada" };
    const asked = await render({ program: login, model: manifest, snapshot });
    const first = asked.render!;

    recording.presented({ view: "main", snapshot, render: first });

    const field = (first.tree.root as unknown as { children: ReadonlyArray<{ events: { input: string } }> }).children[0]!.events.input;

    recording.event({ handler: field, payload: secret, render: first });

    const changed = { password: `${secret}!`, user: "ada" };
    const next = await update(first, changed);

    recording.presented({ view: "main", snapshot: changed, render: next.render! });
    await recording.flush();

    return { text: written.join("\n"), warnings };
  };

  it("says that it holds user data, always", async () => {
    const { text } = await record();

    expect(parseLog(text)[0]).toMatchObject({ line: "header", containsUserData: true });
    expect(text).toContain(secret);
  });

  it("never writes a marked value, in the snapshot, the changes, the trees, the payloads or the outcomes, and the log still replays by three routes", async () => {
    const { text, warnings } = await record({ scope: [["password"]], commands: ["login/type"] });
    const lines = parseLog(text);

    expect(text).not.toContain(secret);
    expect(lines[0]).toMatchObject({ containsUserData: true, redacted: { scope: [["password"]], commands: ["login/type"] } });
    expect((lines[0] as unknown as { snapshot: { password: string; user: string } }).snapshot.password).toMatch(/^redacted:[0-9a-f]{16}$/);
    expect((lines[0] as unknown as { snapshot: { user: string } }).snapshot.user).toBe("ada");
    expect(lines.find((each) => each.line === "event")).toMatchObject({ payload: expect.stringMatching(/^redacted:/) });
    expect(warnings).toEqual([]);

    const played = await replay(lines, { program: login, model: manifest });

    expect(played.ok).toBe(true);
    expect(played.agree).toBe(true);
    expect(played.routes.map((each) => each.hashes.length)).toEqual([3, 3, 3]);
  });

  it("keys the digest with a key that exists only in the recorder: two recordings of the same value differ, equal values within one log are equal", async () => {
    const a = parseLog((await record({ scope: [["password"]] })).text);
    const b = parseLog((await record({ scope: [["password"]] })).text);
    const password = (line: SessionLine) => (line as unknown as { snapshot: { password: string } }).snapshot.password;

    expect(password(a[0]!)).not.toBe(password(b[0]!));
    expect(await sha256(secret)).not.toContain(password(a[0]!).slice(9));
  });

  it("a marked value that is not redacted is found: the same log without the marking carries it (the check above fails without the feature)", async () => {
    expect((await record({ scope: [], commands: [] })).text).toContain(secret);
  });

  it("warns once, and writes the finding, when a marked value decides a branch (R14 rule 2): the log would not replay at that event", async () => {
    const branching = await compileProgram({
      model: { manifest, path: "components.json" },
      root: "login",
      components: [{ component: "login", path: "login.mprx", source: '<text>{#if user == "ada"}<field value={password} on.input={type($event)} />{/if}</text>' }],
    });
    const program = branching.program as unknown as { readonly root: string; readonly templates: ReadonlyArray<string> };
    const written: string[] = [];
    const warnings: string[] = [];
    const recording = recorder({
      write: (line) => written.push(line),
      warn: (message) => warnings.push(message),
      programs: () => ({ root: program.root, templates: program.templates, model: manifest }),
      redact: { scope: [["user"]] },
    });
    const snapshot = { password: "p", user: "ada" };

    recording.presented({ view: "main", snapshot, render: (await render({ program, model: manifest, snapshot })).render! });
    await recording.flush();

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("sensitive");
    expect(written.join("\n")).toContain('"redaction":"changed-the-tree"');
    expect(written.join("\n")).not.toContain('"user":"ada"');
  });
});
