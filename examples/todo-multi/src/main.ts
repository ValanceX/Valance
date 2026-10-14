import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import desktopLayout from "./desktop/layout.mprx";
import themeToggle from "./web/theme-toggle.js";
import todoAdd from "./shared/todo-add.js";
import webLayout from "./web/layout.mprx";

const Item = Schema.Struct({ id: Schema.String, title: Schema.String, done: Schema.Boolean });

// One application, built for each target the project has. What is shared is written once, here: the state (each field is its type and its default, together) and the commands, and the content in
// content/. What differs is the templates, because each target draws with its own vocabulary: `targets` gives each its layout and its components. Nothing under src/ is part of the application
// unless it is imported here and listed.
export default defineApp({
  state: {
    items: field(Schema.Array(Item), []),
    entry: field(Schema.String, ""), // what is typed in the new-item field, until it is added
    seq: field(Schema.Number, 1), // the next item's number
    theme: field(Schema.Literal("system", "light", "dark"), "system"), // the colors: the system's unless the person chose
    navigation: field(Schema.Boolean, true), // the desktop layout's
  },
  // What the window looks like: the person's choice, or the system's colors when they have not made one.
  appearance: (state) => state.theme,
  // What outlives a run, on every target: the items and the counter that numbers them, and the web's theme. (`navigation` is the desktop's own and `entry` is a draft: neither is kept.)
  persist: ["items", "seq", "theme"],
  // Worked out from the state, on every target: a layout reads `summary` as it reads a field.
  derived: (derive) => ({
    summary: derive(Schema.String, (state) => `${state.items.filter((item) => !item.done).length} of ${state.items.length} open`),
  }),
  commands: (command) => ({
    setEntry: command(Schema.Struct({ text: Schema.String }), ({ text }, state) => ({ ...state, entry: text.slice(0, 200) })),
    addItem: command((state) => {
      const title = state.entry.trim();

      return title === "" ? state : { ...state, items: [...state.items, { id: `i${state.seq}`, title, done: false }], entry: "", seq: state.seq + 1 };
    }),
    setDone: command(Schema.Struct({ id: Schema.String, done: Schema.Boolean }), ({ id, done }, state) => ({
      ...state,
      items: state.items.map((item) => (item.id === id ? { ...item, done } : item)),
    })),
    removeItem: command(Schema.Struct({ id: Schema.String }), ({ id }, state) => ({ ...state, items: state.items.filter((item) => item.id !== id) })),
    clearDone: command((state) => ({ ...state, items: state.items.filter((item) => !item.done) })),
    // flips what is shown (the system's colors, when the person has not chosen)
    toggleTheme: command((state) => ({ ...state, theme: (state.theme === "system" ? state.colorScheme : state.theme) === "light" ? "dark" : "light" })),
    // the window's: system, then light, then dark
    cycleTheme: command((state) => ({ ...state, theme: state.theme === "system" ? "light" : state.theme === "light" ? "dark" : "system" })),
    toggleNavigation: command((state) => ({ ...state, navigation: !state.navigation })),
  }),
  targets: {
    web: { layout: component(webLayout), components: [themeToggle, todoAdd] },
    desktop: { layout: component(desktopLayout), components: [todoAdd] },
  },
});
