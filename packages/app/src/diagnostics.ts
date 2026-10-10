// One shape for every mistake the tooling can attribute to authored source: the config, a Markdown page, a link, a template. A terminal prints it as `file:line:column code: message`,
// an editor reads it as JSON (`valance check --json`), the dev overlay shows it. `file` is relative to the project root. `line` and `column` start at 1 (0 when unknown).
export interface Diagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly code: string;
  readonly message: string;
}

/** A failure that carries the diagnostics it is made of. */
export class AppError extends Error {
  readonly diagnostics: ReadonlyArray<Diagnostic>;

  constructor(diagnostics: ReadonlyArray<Diagnostic>) {
    super(diagnostics.map(format).join("\n"));
    this.name = "AppError";
    this.diagnostics = diagnostics;
  }
}

export const format = ({ file, line, column, code, message }: Diagnostic): string => `${file}${line > 0 ? `:${line}${column > 0 ? `:${column}` : ""}` : ""} ${code}: ${message}`;

export const diagnostic = (file: string, line: number, code: string, message: string, column = 0): Diagnostic => ({ file, line, column, code, message });

/** The 1-based line of the first occurrence of `needle` in `source` (1 when absent), for a diagnostic about a JSON key. */
export const lineOf = (source: string, needle: string): number => {
  const at = source.indexOf(needle);

  return at < 0 ? 1 : source.slice(0, at).split("\n").length;
};
