// The shape of the site's content: what the build step (../tooling) produces and the application (../app) consumes. Pure data and its Schemas; nothing here reads a file,
// names a framework or draws anything.
import { Schema } from "effect";

/** One block of a page. A page is a flat list of these: the views have no recursion, so nesting is flattened by the build (a list is a run of `item` blocks). */
export const Block = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("heading", "paragraph", "item", "code", "callout"),
  text: Schema.String,
  /** 1 to 3 for a heading; 0 for every other kind. */
  level: Schema.Number,
  /** The language of a code block; empty for every other kind. */
  lang: Schema.String,
  /** `note`, `tip` or `warning` for a callout; empty for every other kind. */
  tone: Schema.String,
});
export type Block = typeof Block.Type;

export const Page = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  title: Schema.String,
  section: Schema.String,
  blocks: Schema.Array(Block),
});
export type Page = typeof Page.Type;

export const Site = Schema.Struct({
  name: Schema.String,
  pages: Schema.Array(Page),
});
export type Site = typeof Site.Type;
