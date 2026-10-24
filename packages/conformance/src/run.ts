// The runner: plays the vectors through an adapter and says what happened, by the rule of Q6 (a gap counts as `unsupported` only when the PORT declared it).
import type {
  Adapter,
  Capabilities,
  Declared,
  Observation,
  Reported,
} from "./protocol.js";
import type { Report, Result } from "./report.js";
import { summarize } from "./report.js";
import type { Step, Vector, VectorFile } from "./vectors.js";

const declares = (
  declared: ReadonlyArray<Declared>,
  vector: Vector,
): Declared | undefined =>
  declared.find(
    (each) =>
      (each.primitive === "*" || each.primitive === vector.primitive) &&
      (each.case === "*" ||
        vector.case === each.case ||
        vector.case.startsWith(each.case)),
  );

/** The members of `expected` that `actual` does not have, as `member: expected, found`. */
const differences = (
  expected: Partial<Observation>,
  actual: Observation | undefined,
): ReadonlyArray<string> => {
  if (actual === undefined) {
    return ["there is nothing to observe at that key"];
  }

  return Object.entries(expected)
    .filter(
      ([member, value]) =>
        JSON.stringify(
          (actual as unknown as Record<string, unknown>)[member],
        ) !== JSON.stringify(value),
    )
    .map(
      ([member, value]) =>
        `${member}: expected ${JSON.stringify(value)}, found ${JSON.stringify((actual as unknown as Record<string, unknown>)[member])}`,
    );
};

/** A report without its trailing absent payload, so `["h"]` and `["h", undefined]` are one. */
const normal = (reports: ReadonlyArray<Reported>): string =>
  JSON.stringify(
    reports.map((each) =>
      each.length > 1 && each[1] === undefined ? [each[0]] : each,
    ),
  );

const play = async (
  adapter: Adapter,
  step: Step,
): Promise<string | undefined> => {
  switch (step.op) {
    case "load": {
      if (step.expect === "refused") {
        try {
          await adapter.load(step.tree);
        } catch {
          return undefined;
        }

        return "the tree was drawn, and should have been refused";
      }

      await adapter.load(step.tree);

      return undefined;
    }
    case "update":
      await adapter.update(step.tree);

      return undefined;
    case "observe": {
      const found = differences(step.expect, await adapter.observe(step.key));

      return found.length === 0
        ? undefined
        : `observing ${step.key}: ${found.join("; ")}`;
    }
    case "interact": {
      const reports = await adapter.interact(step.key, step.how);

      return normal(reports) === normal(step.expect.reports)
        ? undefined
        : `${step.how.kind} on ${step.key} reported ${normal(reports)}, expected ${normal(step.expect.reports)}`;
    }
    case "force":
      await adapter.force!(step.key, step.state);

      return undefined;
  }
};

export interface RunOptions {
  /** A name for the adapter in the report. */
  readonly adapter: string;
  /** Run only the vectors of these primitives. */
  readonly only?: ReadonlyArray<string>;
}

/** Plays every vector of `file` through `adapter`. Each vector is its own load and unmount. */
export const run = async (
  adapter: Adapter,
  file: VectorFile,
  options: RunOptions,
): Promise<Report> => {
  const capabilities: Capabilities = await adapter.capabilities();
  const results: Result[] = [];

  for (const vector of file.vectors) {
    if (
      options.only !== undefined &&
      !options.only.includes(vector.primitive)
    ) {
      continue;
    }

    const base = { primitive: vector.primitive, case: vector.case };
    const lacks = vector.requires.filter(
      (each) => !capabilities.can.includes(each),
    );
    const declared = declares(capabilities.unsupported, vector);

    if (lacks.length > 0 || declared !== undefined) {
      results.push(
        declared !== undefined
          ? {
              ...base,
              result: "unsupported",
              declared: true,
              detail: declared.reason,
            }
          : {
              ...base,
              result: "fail",
              detail: `needs ${lacks.join(", ")}, which the adapter does not provide and its realization data does not declare`,
            },
      );
      continue;
    }

    try {
      let failure: string | undefined;

      for (const step of vector.steps) {
        failure = await play(adapter, step);

        if (failure !== undefined) {
          break;
        }
      }

      results.push(
        failure === undefined
          ? { ...base, result: "pass" }
          : { ...base, result: "fail", detail: failure },
      );
    } catch (error) {
      results.push({
        ...base,
        result: "fail",
        detail:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
      });
    } finally {
      await adapter.unmount().catch(() => undefined);
    }
  }

  return {
    version: 1,
    port: capabilities.port,
    portVersion: capabilities.version,
    spec: file.spec,
    adapter: options.adapter,
    results,
    summary: summarize(results),
  };
};
