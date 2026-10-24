// The kit, held to account: the vectors are what the specifications give (and grow with them), two PORTs pass them (the Web PORT in jsdom, and a terminal PORT written for the purpose, through a
// child process and the line-JSON protocol), the report is data against a schema, a gap counts only when declared, and a wrong PORT is found. Each check is shown failing against a deliberate
// wrong value.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { loadSpecifications, loadWeb } from "@valancex/primitives";
import type { Specification } from "@valancex/primitives";
import { describe, expect, it } from "vitest";

import { jsdomAdapter } from "../src/adapters/jsdom.js";
import { terminalAdapter } from "../src/adapters/terminal/adapter.js";
import type { Adapter, Capabilities } from "../src/index.js";
import {
  connect,
  generate,
  parity,
  problemsOf,
  run,
  serve,
  summarize,
} from "../src/index.js";
import type { VectorFile } from "../src/index.js";

const specifications = loadSpecifications();
const realizations = loadWeb();
const committed = JSON.parse(
  readFileSync(
    new URL("../vectors/primitives.vectors.json", import.meta.url),
    "utf8",
  ),
) as VectorFile;
const here = (path: string): string =>
  fileURLToPath(new URL(path, import.meta.url));

describe("the vectors", () => {
  it("are what the specifications and the web's realizations generate (the committed file is current)", () => {
    expect(generate(specifications, realizations)).toEqual(committed);
  });

  it("have the cases the specifications call for: an example, each state, each member of a closed set, each event, each key row, each controlled value, each prop refused when hostile", () => {
    const ids = new Set(committed.vectors.map((each) => each.id));

    for (const specification of Object.values(specifications).filter(
      (each) =>
        each.status === "portable" &&
        Object.values(realizations.primitives).some(
          (tag) => tag.primitive === each.name,
        ),
    )) {
      expect(ids.has(`${specification.name}/example`), specification.name).toBe(
        true,
      );

      for (const [prop, definition] of Object.entries(specification.props)) {
        if (definition.type.kind === "enum") {
          for (const value of definition.type.values) {
            expect(
              ids.has(`${specification.name}/variant:${prop}=${value}`),
              `${specification.name} ${prop}=${value}`,
            ).toBe(true);
          }
        }

        if (
          definition.controlled === true &&
          specification.events["change"] !== undefined
        ) {
          expect(
            ids.has(`${specification.name}/controlled:${prop}`),
            `${specification.name} ${prop}`,
          ).toBe(true);
        }
      }
    }

    expect(ids.has("checkbox/event:change")).toBe(true);
    expect(ids.has("textfield/event:submit")).toBe(true);
    expect(ids.has("button/key:Enter")).toBe(true);
    expect(ids.has("button/hostile:disabled")).toBe(true);
    expect(committed.vectors.length).toBeGreaterThan(100);
  });

  it("grow with a specification: a new member of a closed set, a new state, a new event add a vector with no one writing it", () => {
    const grown = structuredClone(specifications) as Record<
      string,
      Specification
    >;
    const button = grown["button"] as unknown as {
      props: Record<string, { type: { kind: string; values: string[] } }>;
      events: Record<string, object>;
    };

    button.props["intent"]!.type.values.push("warning");

    const before = new Set(committed.vectors.map((each) => each.id));
    const after = generate(grown, realizations).vectors.map((each) => each.id);

    expect(after.filter((id) => !before.has(id))).toEqual([
      "button/variant:intent=warning",
    ]);
  });
});

describe("the Web PORT in jsdom", () => {
  it("passes every vector it does not declare unsupported, and declares each gap with a reason", async () => {
    const report = await run(jsdomAdapter("test"), committed, {
      adapter: "jsdom",
    });

    expect(problemsOf(report)).toEqual([]);
    expect(report.results.filter((each) => each.result === "fail")).toEqual([]);
    expect(
      report.results
        .filter((each) => each.result === "unsupported")
        .every(
          (each) => each.declared === true && (each.detail ?? "").length > 10,
        ),
    ).toBe(true);
    expect(report.summary.pass).toBeGreaterThan(80);
  });
});

describe("a PORT in another process (the terminal skeleton)", () => {
  it("passes every vector it does not declare unsupported, through the line-JSON protocol, and quickly", async () => {
    const child = spawn(
      process.execPath,
      [here("../dist/adapters/terminal/main.js")],
      { stdio: ["pipe", "pipe", "inherit"] },
    );
    const started = Date.now();

    try {
      const report = await run(connect(child.stdout, child.stdin), committed, {
        adapter: "stdio",
      });

      expect(problemsOf(report)).toEqual([]);
      expect(report.results.filter((each) => each.result === "fail")).toEqual(
        [],
      );
      expect(report.summary.pass).toBeGreaterThan(50);
      expect(report.summary.unsupported).toBeGreaterThan(0);
      // the kill criterion: no more than ten seconds for a thousand interactions (here: every step of every vector, with a process between)
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      child.kill();
    }
  });

  it("has an adapter of at most 300 lines (decision Q3): the measurement", () => {
    const lines = readFileSync(
      here("../src/adapters/terminal/adapter.ts"),
      "utf8",
    )
      .trimEnd()
      .split("\n").length;

    expect(lines).toBeLessThanOrEqual(300);
  });

  it("speaks the protocol both ways, in memory: an adapter served on lines and reached over them gives the same report", async () => {
    const request = new PassThrough();
    const response = new PassThrough();

    serve(terminalAdapter(), request, response);

    const over = await run(connect(response, request), committed, {
      adapter: "memory",
    });
    const direct = await run(terminalAdapter(), committed, {
      adapter: "memory",
    });

    expect(over.results).toEqual(direct.results);
  });
});

/** A PORT that is wrong in one way: the adapter of the terminal skeleton with one behavior changed. */
const wrong = (change: (adapter: Adapter) => Partial<Adapter>): Adapter => {
  const adapter = terminalAdapter();

  return { ...adapter, ...change(adapter) };
};
const failures = async (
  adapter: Adapter,
  only: ReadonlyArray<string>,
): Promise<ReadonlyArray<string>> =>
  (await run(adapter, committed, { adapter: "wrong", only })).results
    .filter((each) => each.result === "fail")
    .map((each) => `${each.primitive}/${each.case}`);

describe("a wrong PORT is found (each check shown failing)", () => {
  it("one that ignores `disabled`", async () => {
    const found = await failures(
      wrong((adapter) => ({
        observe: async (key) => ({
          ...(await adapter.observe(key))!,
          enabled: true,
        }),
      })),
      ["button"],
    );

    expect(found).toContain("button/state:disabled=true");
  });

  it("one that drops a payload", async () => {
    const found = await failures(
      wrong((adapter) => ({
        interact: async (key, how) =>
          (await adapter.interact(key, how)).map((each) => [each[0]] as const),
      })),
      ["checkbox", "textfield"],
    );

    expect(found).toContain("checkbox/event:change");
    expect(found).toContain("textfield/event:change");
  });

  it("one that draws what it should refuse", async () => {
    const found = await failures(
      wrong(() => ({ load: async () => undefined })),
      ["button"],
    );

    expect(found.some((each) => each.startsWith("button/hostile:"))).toBe(true);
  });

  it("one that shows the person's change instead of what the application rendered", async () => {
    const found = await failures(
      wrong((adapter) => ({
        // never lets the application's render replace what was typed
        update: async () => undefined,
        load: adapter.load,
      })),
      ["textfield", "checkbox"],
    );

    expect(found).toContain("textfield/controlled:value");
    expect(found).toContain("checkbox/controlled:checked");
  });

  it("one that names the wrong thing, and one with the wrong role", async () => {
    const named = await failures(
      wrong((adapter) => ({
        observe: async (key) => ({
          ...(await adapter.observe(key))!,
          name: "wrong",
        }),
      })),
      ["button", "checkbox"],
    );
    const roled = await failures(
      wrong((adapter) => ({
        observe: async (key) => ({
          ...(await adapter.observe(key))!,
          role: "link",
        }),
      })),
      ["button"],
    );

    expect(named).toContain("button/example");
    expect(roled).toContain("button/example");
  });
});

describe("a gap counts only when the PORT declared it (decision Q6)", () => {
  const silent = (): Adapter => {
    const adapter = terminalAdapter();

    return {
      ...adapter,
      capabilities: async (): Promise<Capabilities> => ({
        ...(await adapter.capabilities()),
        unsupported: [],
      }),
    };
  };

  it("is a failure when the data does not say it", async () => {
    const report = await run(silent(), committed, {
      adapter: "silent",
      only: ["dialog", "textfield"],
    });
    const dialog = report.results.filter((each) => each.primitive === "dialog");

    expect(dialog.length).toBeGreaterThan(0);
    expect(dialog.every((each) => each.result === "fail")).toBe(true);
    expect(dialog[0]!.detail).toContain("does not declare");
    expect(
      report.results.find(
        (each) => each.primitive === "textfield" && each.case === "key:Enter",
      )?.result,
    ).toBe("fail");
  });

  it("and is `unsupported` with the reason when it does", async () => {
    const report = await run(terminalAdapter(), committed, {
      adapter: "declared",
      only: ["dialog"],
    });

    expect(
      report.results.every(
        (each) => each.result === "unsupported" && each.declared === true,
      ),
    ).toBe(true);
  });
});

describe("the report is data against a schema", () => {
  it("accepts a report, and refuses one whose gap is not declared, whose failure has no detail, or whose spec is another", async () => {
    const report = await run(terminalAdapter(), committed, {
      adapter: "schema",
      only: ["button", "dialog"],
    });

    expect(problemsOf(report)).toEqual([]);
    expect(
      problemsOf({
        ...report,
        results: [{ primitive: "x", case: "y", result: "unsupported" }],
        summary: summarize([]),
      }),
    ).not.toEqual([]);
    expect(
      problemsOf({
        ...report,
        results: [{ primitive: "x", case: "y", result: "fail" }],
        summary: summarize([]),
      }),
    ).not.toEqual([]);
    expect(problemsOf({ ...report, spec: "primitives@2" })).not.toEqual([]);
    expect(problemsOf({ version: 1 })).not.toEqual([]);
  });

  it("makes the parity table: what each PORT says of each case, and `missing` where it was not run", async () => {
    const a = await run(jsdomAdapter("test"), committed, {
      adapter: "jsdom",
      only: ["button"],
    });
    const b = await run(terminalAdapter(), committed, {
      adapter: "stdio",
      only: ["button", "dialog"],
    });
    const table = parity([a, b]);
    const row = (id: string) =>
      table.find((each) => `${each.primitive}/${each.case}` === id)!;

    expect(row("button/example").by).toEqual({
      "port-web/jsdom": "pass",
      "port-terminal/stdio": "pass",
    });
    expect(row("dialog/example").by).toEqual({
      "port-web/jsdom": "missing",
      "port-terminal/stdio": "unsupported",
    });
  });
});
