// Late admission (decision W19; Bet 3's after-start set): a program that arrives after the application has started is admitted into it. The same invariant `start` holds every view to (what the program
// declares is in the command table) is checked first, and nothing changes if it fails; a mount showing the view draws it afresh, with the keys of the new program, and an event on it reaches its command.
import { compileProgram } from "@valancex/mesh-compiler";
import { Effect, Exit, Schema, Scope } from "effect";
import { describe, expect, it } from "vitest";

import * as Valance from "../src/index.js";

const model = JSON.stringify({
  version: 1,
  types: {},
  components: {
    page: { props: {}, events: {}, commands: { go: { parameters: [] }, nope: { parameters: [] } }, scope: { title: { kind: "string" } } },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
  },
});
const compile = async (source: string): Promise<Valance.Program> => {
  const result = await compileProgram({ model: { manifest: model, path: "components.json" }, root: "page", components: [{ component: "page", path: "page.mprx", source }] });

  if (result.program === undefined) {
    throw new Error(JSON.stringify(result.components));
  }

  return result.program;
};

const placeholder = await compile("<text>loading {title}</text>");
const real = await compile("<button on.click={go()}>Go {title}</button>");
const rogue = await compile("<button on.click={nope()}>Nope</button>");
const State = Schema.Struct({ title: Schema.String, went: Schema.Number });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const boot = async () => {
  const definition = Valance.define({
    name: "admit",
    state: { schema: State, initial: { title: "t", went: 0 } },
    views: { docs: { program: placeholder, scope: (s: typeof State.Type) => ({ title: s.title }) } },
    view: () => "docs" as const,
    commands: (state) => ({
      go: Valance.command(state)((current) => ({ ...current, went: current.went + 1 })),
      retitle: Valance.command(state)(Schema.Struct({ title: Schema.String }), ({ title }, current) => ({ ...current, title })),
    }),
  });
  const scope = await Effect.runPromise(Scope.make());
  const handle = await Effect.runPromise(Valance.start(definition).pipe(Scope.extend(scope)));
  const seen: Array<{ kind: string; tree: { root: { children?: Array<{ events?: Record<string, string>; key: string }>; key: string } } }> = [];
  let report: Valance.Report = () => undefined;

  await Effect.runPromise(
    Valance.mount(handle, (reporter) => {
      report = reporter;

      return {
        draw: (tree) => void seen.push({ kind: "draw", tree: tree as never }),
        update: (tree) => void seen.push({ kind: "update", tree: tree as never }),
        unmount: () => undefined,
      };
    }).pipe(Scope.extend(scope)),
  );

  return { handle, seen, scope, report: (handler: string) => report(handler), close: () => Effect.runPromise(Scope.close(scope, Exit.void)) };
};

const view = (program: Valance.Program) => ({ program, scope: (s: typeof State.Type) => ({ title: s.title }) });

describe("admit", () => {
  it("replaces the placeholder with the program that arrived, drawn afresh with its own keys, and an event on it reaches its command", async () => {
    const b = await boot();

    expect(b.seen).toHaveLength(1);

    await Effect.runPromise(Valance.admit(b.handle, "docs", view(real)));
    await wait(60);

    // a fresh render of the new program, not an update of the old render: the root's key is derived from the program
    expect(b.seen).toHaveLength(2);
    expect(b.seen[1]!.kind).toBe("update");
    expect(b.seen[1]!.tree.root.key).not.toBe(b.seen[0]!.tree.root.key);
    expect(JSON.stringify(b.seen[1]!.tree)).toContain("Go t");

    const button = b.seen[1]!.tree.root.children?.find((child) => child.events?.["click"] !== undefined) ?? b.seen[1]!.tree.root;

    b.report((button.events ?? (b.seen[1]!.tree.root as { events?: Record<string, string> }).events)!["click"]!);
    await wait(60);
    expect((await Effect.runPromise(b.handle.state)).went).toBe(1);

    // the state changes after, and the new view is updated in place (patches), as any view is
    await Effect.runPromise(b.handle.invoke("app/retitle", [{ value: "later" }]));
    await wait(60);
    expect(JSON.stringify(b.seen.at(-1)!.tree)).toContain("Go later");
    await b.close();
  });

  it("refuses a program that declares an event the table lacks, with the violation naming the view, and changes nothing (the same invariant as start)", async () => {
    const b = await boot();
    const refused = await Effect.runPromise(Effect.exit(Valance.admit(b.handle, "docs", view(rogue))));

    expect(Exit.isFailure(refused)).toBe(true);
    expect(JSON.stringify(refused)).toContain("ConformanceViolation");
    expect(JSON.stringify(refused)).toContain('"view":"docs"');
    expect(JSON.stringify(refused)).toContain("page/nope");
    await wait(60);
    expect(b.seen).toHaveLength(1); // nothing was redrawn
    await Effect.runPromise(Valance.admit(b.handle, "docs", view(real))); // and the view can still be admitted
    await wait(60);
    expect(b.seen).toHaveLength(2);
    await b.close();
  });

  it("admits a view the application did not have, without redrawing the one it is showing", async () => {
    const b = await boot();

    await Effect.runPromise(Valance.admit(b.handle, "other", view(real)));
    await wait(60);
    expect(b.seen).toHaveLength(1);
    await b.close();
  });

  it("is refused once the application is closing: a late arrival admits nothing", async () => {
    const b = await boot();

    await b.close();

    const exit = await Effect.runPromise(Effect.exit(Valance.admit(b.handle, "docs", view(real))));

    expect(Exit.isFailure(exit) && JSON.stringify(exit)).toContain("admission-closed");
  });
});
