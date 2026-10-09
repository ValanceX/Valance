// The application's state: which page is shown, and which code block was last copied. Everything else a screen shows is derived from these two and the site (./scope.ts).
import { Schema } from "effect";

export const AppState = Schema.Struct({
  page: Schema.String,
  /** The id of the code block last copied; empty before any. */
  copied: Schema.String,
});
export type AppState = typeof AppState.Type;

export const initial: AppState = { page: "introduction", copied: "" };
