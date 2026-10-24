// Validates a report against its schema (Node: the schema is a file).
import { Ajv } from "ajv";
import { readFileSync } from "node:fs";

const schema = JSON.parse(
  readFileSync(
    new URL("../schema/conformance-report-v1.schema.json", import.meta.url),
    "utf8",
  ),
) as object;
const validator = new Ajv({ strict: false }).compile(schema);

/** The problems a report has against its schema: none when it is a report. */
export const problemsOf = (report: unknown): ReadonlyArray<string> =>
  validator(report)
    ? []
    : (validator.errors ?? []).map((each) =>
        `${each.instancePath || "/"} ${each.message ?? ""}`.trim(),
      );
