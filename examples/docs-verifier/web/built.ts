// The URLs of what the build wrote: the page script and the stylesheet it imports. Both the server (it links them) and the browser (its head says the same) need them, so they travel in
// the document's boot block as plain data.
export interface Built {
  /** The page script, a module. */
  readonly script: string;
  /** The stylesheet. Absent: the site is unstyled (a test, or a build that has none). */
  readonly style?: string;
}
