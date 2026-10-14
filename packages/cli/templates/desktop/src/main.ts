import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";

// The application, from the top. `layout` is the window's content around a page; the Markdown in content/ is what goes in `<blocks>`. The state is the application's own, beyond "which page is
// shown": each field is its type and its default, together. A field is a name the layout can read (`navigation`), and the commands below are names it can run (`toggleNavigation()`).
export default defineApp({
  layout: component(layout),
  state: {
    navigation: field(Schema.Boolean, true),
  },
  commands: (command) => ({
    toggleNavigation: command((state) => ({ ...state, navigation: !state.navigation })),
  }),
});
