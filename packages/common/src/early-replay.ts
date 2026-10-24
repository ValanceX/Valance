// What the page does with what the early-input shell kept (`early.ts`; Bet 14, decisions H3, H4, H6, H10): after hydration has adopted the server's nodes, in order and one at a time, waiting for each
// command to settle. It dispatches ordinary events at the same nodes, so the PORT and the application see what they would have seen had the application been ready; neither knows. Development
// and production alike.
import { Effect } from "effect";

/** At most this many events are replayed, and none older than this when it happens (H3). */
export const EARLY_LIMIT = 20;
export const EARLY_MAX_AGE_MS = 10_000;

interface Entry {
  readonly k: "click" | "key";
  readonly n: HTMLElement;
  readonly x?: string;
  readonly t: number;
}

interface Shell {
  q: Entry[];
  busy: HTMLElement[];
  on: number;
  wasm: Promise<WebAssembly.Module | void> | 0;
  snap?: () => void;
  fields?: Array<{ readonly n: HTMLInputElement | HTMLTextAreaElement; readonly x: string }>;
  focus?: { readonly n: HTMLInputElement | HTMLTextAreaElement; readonly s: number | null; readonly e: number | null } | 0;
  /** What the replay did, for whoever drives the page. */
  done?: { readonly replayed: number; readonly dropped: number };
}

declare global {
  interface Window {
    __vlx?: Shell;
  }
}

/** The shell the page's head started, if it did (a page served by something other than `vlx` has none). */
export const shell = (): Shell | undefined => window.__vlx;

/** Reads the fields whose text differs from the server's, and the caret, just before hydration writes the application's values over them (H4, H10). */
export const snapEarly = (): void => window.__vlx?.snap?.();

/** The WebAssembly module the shell compiled while the script downloaded, if it did and it worked; else nothing, and the runtime loads the module itself. */
export const earlyModule = async (): Promise<WebAssembly.Module | undefined> => {
  const compiled = await window.__vlx?.wasm;

  return compiled instanceof WebAssembly.Module ? compiled : undefined;
};

export interface Replayed {
  readonly replayed: number;
  readonly dropped: number;
}

/**
 * Replays what the shell kept, once. `adopted` is whether hydration kept the server's nodes: if it drew afresh the nodes are gone and nothing is replayed (H3). `settle` waits for the commands
 * the last dispatch started.
 */
export const replayEarly = async (container: HTMLElement, adopted: boolean, settle: () => Promise<void>, now: () => number = Date.now): Promise<Replayed> => {
  const shell = window.__vlx;

  if (shell === undefined) {
    return { replayed: 0, dropped: 0 };
  }

  const queue = shell.q.splice(0);
  const fields = shell.fields ?? [];
  const alive = (node: Element): boolean => adopted && node.isConnected && container.contains(node);
  let replayed = 0;
  let dropped = 0;

  shell.on = 0; // from here the page is listening itself

  // The text first (H4): a field's value is part of what the next tap acts on.
  for (const { n, x } of fields) {
    if (!alive(n)) {
      dropped += 1;
      continue;
    }

    n.value = x;
    n.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();
    replayed += 1;
  }

  for (const entry of queue.slice(0, EARLY_LIMIT)) {
    if (!alive(entry.n) || now() - entry.t > EARLY_MAX_AGE_MS) {
      dropped += 1;
      continue;
    }

    if (entry.k === "click") {
      entry.n.click();
    } else {
      entry.n.dispatchEvent(new KeyboardEvent("keydown", { key: entry.x ?? "", bubbles: true, cancelable: true }));
    }

    await settle();
    replayed += 1;
  }

  dropped += Math.max(0, queue.length - EARLY_LIMIT);

  const focus = shell.focus;

  if (focus !== undefined && focus !== 0 && alive(focus.n)) {
    focus.n.focus();

    if (focus.s !== null && focus.e !== null) {
      focus.n.setSelectionRange(focus.s, focus.e);
    }
  }

  shell.busy.splice(0).forEach((node) => node.removeAttribute("aria-busy"));
  shell.fields = [];
  shell.done = { replayed, dropped };

  return { replayed, dropped };
};

/** The page is ready, or has failed: it is no longer starting. */
export const finishStarting = (container: HTMLElement): void => {
  delete container.dataset["vlx"];
  window.__vlx?.busy.splice(0).forEach((node) => node.removeAttribute("aria-busy"));
};

export const settleOf =
  (mounted: { readonly settled: Effect.Effect<void> }): (() => Promise<void>) =>
  () =>
    Effect.runPromise(mounted.settled);
