// The application's state: which page is shown, what was copied, the colour theme, the choice in each code group, the search, which heading the reader is at, and whether the
// small-screen menu is open. Everything else a screen shows is derived from these and the site (./scope.ts).
import { Schema } from "effect";

import { Hit } from "../model/search.js";
import { Page } from "../model/site.js";

export const Theme = Schema.Literal("system", "light", "dark");
export type Theme = typeof Theme.Type;

/** `idle`: nothing asked. `loading`: the index is being loaded or searched. `ready`: `hits` answers `query` (it may be empty). `failed`: the index could not be had. */
export const SearchStatus = Schema.Literal("idle", "loading", "ready", "failed");
export type SearchStatus = typeof SearchStatus.Type;

/** `ready`: `content` is the page. `loading`: `page` has changed and `content` is still the one before, until the page arrives. `failed`: it could not be had. */
export const ContentStatus = Schema.Literal("ready", "loading", "failed");
export type ContentStatus = typeof ContentStatus.Type;

export const AppState = Schema.Struct({
  page: Schema.String,
  /** The content of the page shown, or of the one being left while the next is loading. A server puts it there; the browser asks the platform. */
  content: Page,
  status: ContentStatus,
  /** The id of the code block last copied; empty before any, and after moving on. */
  copied: Schema.String,
  /** The id of the code block whose copy failed (no clipboard, or the browser refused); empty otherwise. */
  copyFailed: Schema.String,
  /** `system` follows the reader's setting; `light` and `dark` are their choice. */
  theme: Theme,
  /** The tab chosen in each code group, by the group's name (`pkg` -> `pnpm`). A group not in here shows its first tab; a choice is shared by every block of that group. */
  tabs: Schema.Record({ key: Schema.String, value: Schema.String }),
  search: Schema.Struct({ query: Schema.String, status: SearchStatus, hits: Schema.Array(Hit) }),
  /** The anchor of the heading the reader has scrolled to; empty at the top of a page. */
  active: Schema.String,
  /** Whether the navigation is open on a small screen (a large screen always shows it). */
  menu: Schema.Boolean,
});
export type AppState = typeof AppState.Type;

const nothing: Page = { id: "", path: "", title: "", description: "", section: "", outline: [], blocks: [] };

export const initial: AppState = { page: "introduction", content: nothing, status: "ready", copied: "", copyFailed: "", theme: "system", tabs: {}, search: { query: "", status: "idle", hits: [] }, active: "", menu: false };
