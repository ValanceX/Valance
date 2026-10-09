import * as Nexus from "@valancex/nexus";

/** Why VALANCE died with a defect: the stable identity of a `ValanceError`. */
export type ValanceErrorCode =
  /** Admission is closed: the application's Scope is closing (it is draining), so no new command, event or navigation is admitted. A refusal. */
  | "admission-closed"
  /** The application ended before its first render: the state stream is over, so `mount` or `hydrate` has nothing to draw. A refusal. */
  | "application-ended"
  /** The handle is not one `start` returned. A refusal. */
  | "not-an-application"
  /** A command table holds a bare name that is not a command. A mistake in the definition. */
  | "bare-command-binding"
  /** A render names a view the definition doesn't have. A mistake in the definition. */
  | "unknown-view"
  /** A target reported an interaction before anything was drawn. A mistake in the target. */
  | "target-not-drawn";

/**
 * The defect VALANCE dies with for misuse and for work refused because the application is closing. It is a defect, never a typed
 * failure; typed failures carry `_tag`, and a thrown or dying error carries `code` (as NEXUS's `Runtime.Refusal` does). Messages are for people.
 */
export class ValanceError extends Error {
  readonly code: ValanceErrorCode;

  constructor(code: ValanceErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ValanceError";
  }
}

const CODES: ReadonlySet<string> = new Set<ValanceErrorCode>(["admission-closed", "application-ended", "not-an-application", "bare-command-binding", "unknown-view", "target-not-drawn"]);

/** Whether `value` is a `ValanceError`, by its shape and not its class, so it works across two installed copies of the package. */
export const isValanceError = (value: unknown): value is ValanceError =>
  value instanceof Error && value.name === "ValanceError" && typeof (value as unknown as { code?: unknown }).code === "string" && CODES.has((value as unknown as { code: string }).code);

/**
 * Whether `value`, usually a defect taken from a `Cause`, is a refusal: work turned away because the application, or the NEXUS runtime under
 * it, is closing or has ended (or the handle was never one). A command that races a shutdown reads this to tell the refusal from a bug.
 */
export const isRefusal = (value: unknown): boolean =>
  Nexus.Runtime.isRefusal(value) || (isValanceError(value) && (value.code === "admission-closed" || value.code === "application-ended" || value.code === "not-an-application"));
