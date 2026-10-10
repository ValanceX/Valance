import { defineApp, Schema } from "@valancex/cli";

// The application's own state, beyond "which page is shown". Its fields are names the layout can read (`theme`), and the commands below are names it can run (`toggleTheme()`).
export default defineApp({
  state: {
    schema: Schema.Struct({ theme: Schema.Literal("light", "dark") }),
    initial: { theme: "light" },
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
  }),
});
