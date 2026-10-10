// The application's state: which page is shown, which code block was last copied, the colour theme and whether the small-screen menu is open. Everything else a screen shows is
// derived from these and the site (./scope.ts).
import { Schema } from "effect";

export const Theme = Schema.Literal("system", "light", "dark");
export type Theme = typeof Theme.Type;

export const AppState = Schema.Struct({
  page: Schema.String,
  /** The id of the code block last copied; empty before any. */
  copied: Schema.String,
  /** `system` follows the reader's setting; `light` and `dark` are their choice. */
  theme: Theme,
  /** The tab chosen in each code group, by the group's name (`pkg` -> `pnpm`). A group not in here shows its first tab; a choice is shared by every block of that group. */
  tabs: Schema.Record({ key: Schema.String, value: Schema.String }),
  /** Whether the navigation is open on a small screen (a large screen always shows it). */
  menu: Schema.Boolean,
});
export type AppState = typeof AppState.Type;

export const initial: AppState = { page: "introduction", copied: "", theme: "system", tabs: {}, menu: false };
