// The URLs of what the build wrote: the page script, the stylesheet it imports and the search index. Both the server (it links them) and the browser (its head says the same, and its
// platform loads the index) need them, so they travel in the document's boot block as plain data.
export interface Built {
  /** The page script, a module. */
  readonly script: string;
  /** The stylesheet. Absent: the site is unstyled (a test, or a build that has none). */
  readonly style?: string;
  /** The search index, a JSON file named by its content. Absent: search says it is unavailable. */
  readonly search?: string;
}
