import { component, defineApp, Schema } from "@valancex/cli";
import layout from "./layout.mprx";
import themeToggle from "./theme-toggle.mprx";

// The application, from the top. `layout` is the page's shell; each component lists the components its template uses (`uses`), and what it takes (`props`) and raises (`events`). Nothing
// under src/ is part of the application unless it is imported here and listed here, and a template that uses a tag it did not list, or lists one it does not use, is an error.
export default defineApp({
  layout: component(layout, {
    uses: [component(themeToggle, { props: ["theme"], events: ["toggle"] })],
  }),

  // The application's own state, beyond "which page is shown". Its fields are names the layout can read (`theme`), and the commands below are names it can run (`toggleTheme()`).
  state: {
    schema: Schema.Struct({ theme: Schema.Literal("light", "dark") }),
    initial: { theme: "light" },
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
  }),
});
