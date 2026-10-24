// What `vlx build` ships, measured, and the budgets it is held to (Bet 3; decisions W9, W10, W14). A production build prints this; `vlx dev` never does (W9: development is quiet and fast).
//
// A build's files fall in two sets (W11, W12): the **start-up set** is what the page cannot start without (the entry chunk, the chunks it statically imports, their styles, and the WebAssembly runtime),
// and the **after-start set** is every chunk only a dynamic `import()` reaches (loaded once the application has started, at low priority). The server's HTML and the styles the document names paint
// first and are in the start-up set's styles. Sizes are brotli bytes, which is what travels (W2); the raw size is shown beside them.
import { brotliCompressSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { AppError, diagnostic } from "./diagnostics.js";
import defaults from "./budgets.json" with { type: "json" };

export type FileKind = "javascript" | "css" | "wasm" | "other";

export interface SizedFile {
  readonly file: string;
  readonly kind: FileKind;
  readonly raw: number;
  readonly brotli: number;
}

export interface SetReport {
  readonly files: ReadonlyArray<SizedFile>;
  readonly brotli: number;
}

export interface SizeReport {
  readonly startup: SetReport;
  readonly afterStart: SetReport;
}

/** What the Vite manifest says about one output file. */
export interface ManifestEntry {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly imports?: ReadonlyArray<string>;
  readonly dynamicImports?: ReadonlyArray<string>;
  readonly css?: ReadonlyArray<string>;
  readonly assets?: ReadonlyArray<string>;
}

const kindOf = (file: string): FileKind => (file.endsWith(".js") || file.endsWith(".mjs") ? "javascript" : file.endsWith(".css") ? "css" : file.endsWith(".wasm") ? "wasm" : "other");

const sized = (dist: string, file: string): SizedFile => {
  const bytes = readFileSync(join(dist, file));

  return { file, kind: kindOf(file), raw: bytes.length, brotli: brotliCompressSync(bytes).length };
};

/** The files reachable from `starts` by the manifest's static `imports` (and their styles), or by `dynamicImports` only. */
const reach = (manifest: Readonly<Record<string, ManifestEntry>>, starts: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const files = new Set<string>();
  const visit = (key: string): void => {
    const entry = manifest[key];

    if (entry === undefined || seen.has(key)) {
      return;
    }

    seen.add(key);
    files.add(entry.file);
    entry.css?.forEach((file) => files.add(file));
    entry.assets?.forEach((file) => files.add(file));
    entry.imports?.forEach(visit);
  };

  starts.forEach(visit);

  return [...files];
};

/** Splits the build in `dist` into the start-up and after-start sets, from the bundler's manifest. The WebAssembly runtime is in the start-up set whenever the entry names it. */
export const measure = (dist: string, manifest: Readonly<Record<string, ManifestEntry>>, wasm?: string): SizeReport => {
  const entries = Object.entries(manifest).filter(([, entry]) => entry.isEntry === true);
  const startup = new Set(reach(manifest, entries.map(([key]) => key)));

  if (wasm !== undefined) {
    startup.add(wasm);
  }

  const dynamic = new Set<string>();

  for (const [, entry] of Object.entries(manifest)) {
    if (startup.has(entry.file) || entry.isEntry === true) {
      entry.dynamicImports?.forEach((key) => reach(manifest, [key]).forEach((file) => dynamic.add(file)));
    }
  }

  for (const file of startup) {
    dynamic.delete(file);
  }

  const set = (files: Iterable<string>): SetReport => {
    const list = [...files].sort().map((file) => sized(dist, file));

    return { files: list, brotli: list.reduce((sum, each) => sum + each.brotli, 0) };
  };

  return { startup: set(startup), afterStart: set(dynamic) };
};

// ---- budgets -----------------------------------------------------------------------------------------------------------------------------------------------------------------

/** What a budget measures. */
export type BudgetType = "initial" | "runtime" | "startup" | "afterStart" | "anyChunk";

/** A budget in the shape Angular's are: a type and a warning and an error threshold, each in bytes (`500000`, `"500kB"`, `"1MB"`; 1 kB is 1,000 bytes). */
export interface Budget {
  readonly type: BudgetType;
  readonly warning?: string | number;
  readonly error?: string | number;
}

export interface BudgetResult {
  readonly type: BudgetType;
  readonly measured: number;
  readonly warning?: number;
  readonly error?: number;
  readonly status: "ok" | "warning" | "error";
}

export const BUDGET_TYPES: ReadonlyArray<BudgetType> = ["initial", "runtime", "startup", "afterStart", "anyChunk"];

/** The framework's own start-up budgets (decision W14): what a project gets when it sets none. They are data (`budgets.json`), so a gate can read the same numbers. */
export const DEFAULT_BUDGETS: ReadonlyArray<Budget> = defaults.project.budgets as ReadonlyArray<Budget>;

/** `"500kB"` or `500000` as bytes, or `undefined` if it is neither. */
export const bytesOf = (value: string | number): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  const match = /^(\d+(?:\.\d+)?)\s*(B|kB|KB|MB)?$/.exec(value.trim());

  return match === null ? undefined : Math.round(Number(match[1]) * ({ B: 1, kB: 1000, KB: 1000, MB: 1_000_000 }[match[2] ?? "B"] ?? 1));
};

const measuredFor = (type: BudgetType, report: SizeReport): number => {
  const startup = report.startup.files;
  const sum = (files: ReadonlyArray<SizedFile>, kinds: ReadonlyArray<FileKind>): number => files.filter((each) => kinds.includes(each.kind)).reduce((total, each) => total + each.brotli, 0);

  switch (type) {
    case "initial":
      return sum(startup, ["javascript", "css"]);
    case "runtime":
      return sum(startup, ["wasm"]);
    case "startup":
      return report.startup.brotli;
    case "afterStart":
      return report.afterStart.brotli;
    case "anyChunk":
      return Math.max(0, ...[...startup, ...report.afterStart.files].filter((each) => each.kind === "javascript").map((each) => each.brotli));
  }
};

/** Holds `report` to `budgets` (a project's, else the framework's). A threshold that is not a size is a mistake in the settings, said with the file. */
export const check = (report: SizeReport, budgets: ReadonlyArray<Budget>): ReadonlyArray<BudgetResult> =>
  budgets.map((budget) => {
    const warning = budget.warning === undefined ? undefined : bytesOf(budget.warning);
    const error = budget.error === undefined ? undefined : bytesOf(budget.error);
    const measured = measuredFor(budget.type, report);

    return {
      type: budget.type,
      measured,
      ...(warning === undefined ? {} : { warning }),
      ...(error === undefined ? {} : { error }),
      status: error !== undefined && measured > error ? "error" : warning !== undefined && measured > warning ? "warning" : "ok",
    };
  });

/** The settings problems of a project's `budgets`: a type that is not one, a threshold that is not a size, a warning above its error. */
export const budgetProblems = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) {
    return 'must be a list such as [{ "type": "initial", "warning": "200kB", "error": "400kB" }]';
  }

  for (const [index, each] of value.entries()) {
    const budget = each as Partial<Budget> | null;

    if (typeof budget !== "object" || budget === null || !BUDGET_TYPES.includes(budget.type as BudgetType)) {
      return `[${index}] needs a "type" of ${BUDGET_TYPES.join(", ")}`;
    }

    const extra = Object.keys(budget).filter((key) => !["type", "warning", "error"].includes(key));

    if (extra.length > 0) {
      return `[${index}] has unknown settings ${extra.map((key) => `"${key}"`).join(", ")} (known: type, warning, error)`;
    }

    for (const key of ["warning", "error"] as const) {
      const given = budget[key];

      if (given !== undefined && (typeof given !== "string" && typeof given !== "number" ? true : bytesOf(given) === undefined)) {
        return `[${index}] "${key}" must be a size such as 500000, "500kB" or "1MB"`;
      }
    }

    const warning = budget.warning === undefined ? undefined : bytesOf(budget.warning);
    const error = budget.error === undefined ? undefined : bytesOf(budget.error);

    if (warning !== undefined && error !== undefined && warning > error) {
      return `[${index}] the warning (${warning}) is above the error (${error})`;
    }
  }

  return undefined;
};

const label: Readonly<Record<BudgetType, string>> = {
  initial: "start-up JavaScript and CSS",
  runtime: "WebAssembly runtime",
  startup: "start-up set",
  afterStart: "after-start set",
  anyChunk: "largest JavaScript chunk",
};

const kB = (bytes: number): string => `${(bytes / 1000).toFixed(1)} kB`;

/** The size report a production build prints: both sets with each file, then each budget. */
export const lines = (report: SizeReport, results: ReadonlyArray<BudgetResult>): ReadonlyArray<string> => {
  const set = (name: string, each: SetReport): ReadonlyArray<string> => [
    `  ${name}: ${kB(each.brotli)} brotli`,
    ...each.files.map((file) => `    ${file.file}  ${kB(file.raw)} raw, ${kB(file.brotli)} brotli`),
  ];

  return [
    "Size report (brotli, what travels):",
    ...set("start-up (what the page cannot start without)", report.startup),
    ...(report.afterStart.files.length === 0 ? ["  after-start: nothing (no chunk is loaded after the application has started)"] : set("after-start (loaded once the application is running)", report.afterStart)),
    ...results.map(
      (each) =>
        `  ${each.status === "ok" ? "ok     " : each.status === "warning" ? "WARNING" : "ERROR  "} ${label[each.type]}: ${kB(each.measured)}${
          each.error === undefined ? "" : ` (error above ${kB(each.error)})`
        }${each.warning === undefined ? "" : ` (warning above ${kB(each.warning)})`}`,
    ),
  ];
};

/** The failure of a build whose measured size is over an error threshold. */
export const failure = (results: ReadonlyArray<BudgetResult>): AppError | undefined => {
  const over = results.filter((each) => each.status === "error");

  return over.length === 0
    ? undefined
    : new AppError(
        over.map((each) =>
          diagnostic(
            "valance.json",
            0,
            "budget-exceeded",
            `the ${label[each.type]} is ${kB(each.measured)}, over the error budget of ${kB(each.error!)}. Make it smaller, or raise the "budgets" in valance.json for this project.`,
          ),
        ),
      );
};
