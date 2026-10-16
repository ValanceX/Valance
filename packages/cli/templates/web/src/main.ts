import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import themeToggle from "./theme-toggle.js";

// Where are the routes? There is nothing to configure: a page's address is its file's path in content/ (content/guide/a.md is /guide/a; content/404.md is the page for an address that is not a
// page). Pages and their order come from there; this file adds what content cannot say: state, commands and the components your templates use. `vlx build` renders every page to HTML
// once and the browser takes each over; `vlx dev` renders a page when it is asked for.
//
// The application, from the top. `layout` is the page's shell; `components` lists the components your templates use, once each: a template uses one by writing its tag. Nothing under src/ is part of
// the application unless it is imported here and listed. A component states its own interface where it is defined (see theme-toggle.ts).
export default defineApp({
  layout: component(layout),
  components: [themeToggle],

  // The application's own state, beyond "which page is shown": each field is its type and its default, together. A field is a name the layout can read (`theme`), and the commands below are
  // names it can run (`toggleTheme()`).
  state: {
    theme: field(Schema.Literal("light", "dark"), "light"),
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
  }),
});
