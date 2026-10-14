// Keeping what `vlx` generated in step with what the author wrote, without the author running anything. Pure: no `vscode` import, so it is tested without an editor.
import { relative, sep } from "node:path";

/**
 * One run at a time, and never a missed change. Asking while a run is going does not start a second one beside it (two `vlx check`s write the same files); it makes the running one go round
 * again when it finishes, once however many asked. Every caller's promise settles when the last round has.
 */
export const coalesced = (work: () => Promise<void>): (() => Promise<void>) => {
  let running: Promise<void> | undefined;
  let again = false;

  return () => {
    if (running !== undefined) {
      again = true;

      return running;
    }

    const round = (async () => {
      do {
        again = false;
        await work();
      } while (again);
    })().finally(() => {
      running = undefined;
    });

    running = round;

    return round;
  };
};

/** Calls `work` once, `ms` after the last call. */
export const debounced = (
  work: () => void,
  ms: number,
  timers: { set: typeof setTimeout; clear: typeof clearTimeout } = { set: setTimeout, clear: clearTimeout },
): (() => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  return () => {
    if (timer !== undefined) {
      timers.clear(timer);
    }

    timer = timers.set(() => {
      timer = undefined;
      work();
    }, ms);
  };
};

const SOURCE = /\.(md|mprx|ts|json)$/;
const GENERATED_OR_FOREIGN = new Set([".valance", "node_modules", "dist", ".git", ".vscode-test", "target"]);

/**
 * Whether a file appearing, changing or going away in `root` can change what `vlx` generates: the author's content, templates, code and settings, not `.valance/` itself (which `vlx` writes: reacting
 * to it would run `vlx` forever), the installed packages or the built site.
 */
export const affectsProject = (root: string, file: string): boolean => {
  const inside = relative(root, file);

  if (inside === "" || inside.startsWith("..") || /^[a-zA-Z]:/.test(inside)) {
    return false;
  }

  return !inside.split(sep).some((part) => GENERATED_OR_FOREIGN.has(part)) && SOURCE.test(inside);
};
