// What a run of the vectors says (decision Q6): data against a JSON schema. `unsupported` counts only when the PORT declared the gap in its own data; an undeclared gap is a `fail`. The reports of
// every PORT make the parity table.
export type Outcome = "pass" | "fail" | "unsupported";

export interface Result {
  readonly primitive: string;
  readonly case: string;
  readonly result: Outcome;
  readonly declared?: true;
  readonly detail?: string;
}

export interface Report {
  readonly version: 1;
  readonly port: string;
  readonly portVersion: string;
  readonly spec: "primitives@1";
  /** Which adapter drove the PORT (the same PORT through jsdom and through Chromium is two reports). */
  readonly adapter: string;
  readonly results: ReadonlyArray<Result>;
  readonly summary: { readonly pass: number; readonly fail: number; readonly unsupported: number };
}

export const summarize = (results: ReadonlyArray<Result>): Report["summary"] => ({
  pass: results.filter((each) => each.result === "pass").length,
  fail: results.filter((each) => each.result === "fail").length,
  unsupported: results.filter((each) => each.result === "unsupported").length,
});

/** The parity table: for each primitive and case, what each PORT's report says. A case a report does not have is `missing`: a PORT that was not run on it. */
export const parity = (
  reports: ReadonlyArray<Report>,
): ReadonlyArray<{ readonly primitive: string; readonly case: string; readonly by: Readonly<Record<string, Outcome | "missing">> }> => {
  const cases = new Map<string, { primitive: string; case: string }>();

  for (const report of reports) {
    for (const each of report.results) {
      cases.set(`${each.primitive}/${each.case}`, { primitive: each.primitive, case: each.case });
    }
  }

  return [...cases.entries()].map(([id, found]) => ({
    ...found,
    by: Object.fromEntries(
      reports.map((report) => [`${report.port}/${report.adapter}`, report.results.find((each) => `${each.primitive}/${each.case}` === id)?.result ?? "missing"]),
    ),
  }));
};
