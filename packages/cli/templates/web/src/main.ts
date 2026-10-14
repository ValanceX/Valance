import { component, defineApp, field, Schema } from "@valancex/cli";
import layout from "./layout.mprx";
import themeToggle from "./theme-toggle.js";

// The application, from the top. `layout` is the page's shell; `uses` lists the components its template uses. Nothing under src/ is part of the application unless it is imported here (or by
// a component listed here) and listed in `uses`, and a template that uses a tag it did not list, or lists one it does not use, is an error. A component states its own interface where it is
// defined (see theme-toggle.ts); using it takes one word.
export default defineApp({
  layout: component(layout, { uses: [themeToggle] }),

  // The application's own state, beyond "which page is shown": each field is its type and its default, together. A field is a name the layout can read (`theme`), and the commands below are
  // names it can run (`toggleTheme()`).
  state: {
    theme: field(Schema.Literal("light", "dark"), "light"),
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
  }),
});
