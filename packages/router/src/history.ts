/**
 * The list of places an application has been, and the position in it: the model every target's navigation is made of (docs/explanation/application-model/navigation.md). It is plain data and pure
 * functions, so a target that owns its list (a window has none of its own) keeps it in the application's state, and one that does not (the web's session history, a phone's back stack)
 * can still describe, validate and restore what it has with the same rules.
 *
 * An entry is whatever names a place as plain data: a page's address, or a `RouteState`.
 */
export interface History<E> {
  readonly entries: ReadonlyArray<E>;
  /** The position of the current entry. */
  readonly index: number;
}

/** A list that has only been to `entry`. */
export const start = <E>(entry: E): History<E> => ({ entries: [entry], index: 0 });

/** The current entry. */
export const current = <E>(history: History<E>): E => history.entries[history.index]!;

/** Goes to `entry`: it comes after the current one, and whatever was ahead is dropped (as the web's `pushState` does). */
export const push = <E>(history: History<E>, entry: E): History<E> => ({ entries: [...history.entries.slice(0, history.index + 1), entry], index: history.index + 1 });

/** Changes the current entry; nothing is added. */
export const replace = <E>(history: History<E>, entry: E): History<E> => ({
  entries: history.entries.map((each, at) => (at === history.index ? entry : each)),
  index: history.index,
});

/** Whether `distance` (-1 is back, +1 is forward) lands on an entry. A platform with no forward never offers a positive one. */
export const canGo = <E>(history: History<E>, distance: number): boolean =>
  Number.isInteger(distance) && history.index + distance >= 0 && history.index + distance < history.entries.length;

/** Moves along the list by `distance`. A move that would leave it changes nothing. */
export const go = <E>(history: History<E>, distance: number): History<E> => (canGo(history, distance) ? { entries: history.entries, index: history.index + distance } : history);

/**
 * A list read back from somewhere (a store, the platform's restoration) is data from an earlier run, and the application may have changed since. Entries `valid` refuses are dropped; the
 * position stays on the entry that was current, or the nearest one before it that is left (else the first); a list with nothing left starts again at `fallback`. Anything that is not a list
 * of the right shape is `fallback` too, so a bad store is never a crash.
 */
export const restore = <E>(saved: unknown, valid: (entry: unknown) => entry is E, fallback: E): History<E> => {
  const shape = saved as { readonly entries?: unknown; readonly index?: unknown } | null;

  if (typeof shape !== "object" || shape === null || !Array.isArray(shape.entries) || typeof shape.index !== "number" || !Number.isInteger(shape.index)) {
    return start(fallback);
  }

  const kept: Array<E> = [];
  let position = -1;

  shape.entries.forEach((entry, at) => {
    if (valid(entry)) {
      kept.push(entry);

      if (at <= (shape.index as number)) {
        position = kept.length - 1;
      }
    }
  });

  return kept.length === 0 ? start(fallback) : { entries: kept, index: Math.max(0, position) };
};
