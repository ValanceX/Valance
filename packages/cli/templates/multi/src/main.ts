import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import desktopLayout from "./desktop/layout.mprx";
import themeToggle from "./web/theme-toggle.js";
import webLayout from "./web/layout.mprx";

// One application, built for each target the project has. What is shared is written once, here: the state (each field is its type and its default, together) and the commands, and the content in
// content/. What differs is the templates, because each target draws with its own vocabulary: `targets` gives each its layout and its components. Nothing under src/ is part of the application
// unless it is imported here and listed.
export default defineApp({
  state: {
    theme: field(Schema.Literal("light", "dark"), "light"), // the web layout's
    navigation: field(Schema.Boolean, true), // the desktop layout's
  },
  commands: (command) => ({
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
    toggleNavigation: command((state) => ({ ...state, navigation: !state.navigation })),
  }),
  targets: {
    web: { layout: component(webLayout), components: [themeToggle] },
    desktop: { layout: component(desktopLayout) },
  },
});
