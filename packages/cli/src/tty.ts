// Whether to draw an interface. Ink is for a person at a terminal; a pipe, a CI log, `--json` and `--plain` get the plain text the tools have always printed, so a script reads what it read before.
export interface Environment {
  readonly stdout?: { readonly isTTY?: boolean };
  readonly stdin?: { readonly isTTY?: boolean };
  readonly env?: NodeJS.ProcessEnv;
}

/** A terminal to draw on. */
export const canDraw = ({ stdout = process.stdout, env = process.env }: Environment = {}): boolean =>
  stdout.isTTY === true && (env["CI"] === undefined || env["CI"] === "" || env["CI"] === "false") && env["TERM"] !== "dumb";

/** A terminal to draw on and to read keys from: what a question needs. */
export const canAsk = (environment: Environment = {}): boolean => canDraw(environment) && (environment.stdin ?? process.stdin).isTTY === true;
