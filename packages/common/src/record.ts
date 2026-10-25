// The page's session recorder, for `vlx dev --record` (the generated entry imports it, in that mode only, and a build never does): a recorder of `@valancex/valance/replay` that sends each
// line of its log to the development server, in order. Development only; a log holds what the person typed.
import type * as Valance from "@valancex/valance";
import { postTo, recorder } from "@valancex/valance/replay";
import type { Redaction, SessionRecorder } from "@valancex/valance/replay";

/** A recorder for the page of `program`, posting to the development server's `/__vlx/record`; it writes the last tree when the page is hidden. */
export const recording = (program: Valance.Program, redact?: Redaction): SessionRecorder => {
  const model = (program as unknown as { readonly model: unknown }).model;
  const { root, templates } = program as unknown as { readonly root: string; readonly templates: ReadonlyArray<string> };
  const record = recorder({
    write: postTo("/__vlx/record"),
    warn: (message) => console.warn(`vlx dev --record: ${message}`),
    ...(redact === undefined ? {} : { redact }),
    programs: () => ({ root, templates, model: typeof model === "string" ? model : JSON.stringify(model) }),
  });

  addEventListener("pagehide", () => void record.flush());

  return record;
};
