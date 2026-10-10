// Mistakes in files the template language server does not read (Markdown, valance.json, src/main.ts, the project as a whole: a link to a page that does not exist) come from
// `vlx check --json`, in the one shape @valancex/cli documents. Pure mapping here; running the command is `run`.
import { spawn } from "node:child_process";

export interface ValanceDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly code: string;
  readonly message: string;
}

/** A diagnostic in an editor's terms: zero-based, with a range. Content diagnostics know a line, not a column, so they cover the line. */
export interface Placed {
  readonly file: string;
  readonly startLine: number;
  readonly startColumn: number;
  /** `-1`: to the end of the line. */
  readonly endColumn: number;
  readonly code: string;
  readonly message: string;
}

export const place = (each: ValanceDiagnostic): Placed => ({
  file: each.file,
  startLine: Math.max(each.line - 1, 0),
  startColumn: each.column > 0 ? each.column - 1 : 0,
  endColumn: each.column > 0 ? each.column : -1,
  code: each.code,
  message: each.message,
});

/**
 * Template diagnostics are the language server's, with hover and quick fixes: reporting them twice would double every squiggle. But the server only checks a file it was told is a component. For a
 * template it was not told about (not compiled yet, never used) the check is the only voice, so its diagnostics stay. `covered` is the files the server was told about.
 */
export const forTheCheck = (all: ReadonlyArray<ValanceDiagnostic>, covered: ReadonlySet<string> = new Set()): ReadonlyArray<ValanceDiagnostic> => all.filter((each) => !each.file.endsWith(".mprx") || !covered.has(each.file));

/** The note put on a template the language server does not know, so the editor says what its log says. */
export const UNMAPPED = "valance-unmapped";
export const unmappedMessage = (file: string): string =>
  `${file} is not part of the compiled project, so hover, completion and type checks are off for it. Either nothing uses it yet (\`vlx check\` says so) or the project has not been rebuilt since you added it: run \`vlx check\` or \`vlx dev\`.`;

export const parse = (stdout: string): ReadonlyArray<ValanceDiagnostic> => {
  const value = JSON.parse(stdout) as unknown;

  if (!Array.isArray(value)) { throw new Error("`vlx check --json` did not print a list"); }

  return value as ReadonlyArray<ValanceDiagnostic>;
};

/** Runs the project's own `vlx check --json`. Exit code 1 means "there are diagnostics", which is the normal reason to run it. */
export const run = (root: string, command: string): Promise<ReadonlyArray<ValanceDiagnostic>> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, ["check", "--json"], { cwd: root, shell: process.platform === "win32" });
    let out = "";
    let err = "";

    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { err += chunk.toString(); });
    child.on("error", reject);
    child.on("close", () => {
      try { resolve(parse(out)); } catch { reject(new Error(err.trim() || "vlx check printed nothing readable")); }
    });
  });
