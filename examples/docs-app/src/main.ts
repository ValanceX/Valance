import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import themeToggle from "./theme-toggle.js";
import desktopLayout from "./desktop/layout.mprx";

// The application, from the top. `layout` is the page's shell; `components` lists the components your templates use, once each: a template uses one by writing its tag. Nothing under src/ is part of
// the application unless it is imported here and listed. A component states its own interface where it is defined (see theme-toggle.ts).
export default defineApp({
  targets: { desktop: { layout: component(desktopLayout) } },
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
