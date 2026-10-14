import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import desktopLayout from "./desktop/layout.mprx";
import themeToggle from "./web/theme-toggle.js";
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
    theme: field(Schema.Literal("light", "dark"), "light"), // the web layout's
    navigation: field(Schema.Boolean, true), // the desktop layout's
  },
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
    toggleTheme: command((state) => ({ ...state, theme: state.theme === "light" ? "dark" : "light" })),
    toggleNavigation: command((state) => ({ ...state, navigation: !state.navigation })),
  }),
  targets: {
    web: { layout: component(webLayout), components: [themeToggle] },
    desktop: { layout: component(desktopLayout) },
  },
});
