import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import { components } from "@valancex/ui";
import { components as webComponents } from "@valancex/ui-web";
import layout from "./layout.mprx";
import desktopLayout from "./desktop/layout.mprx";

const Tab = Schema.Struct({ id: Schema.String, title: Schema.String });
const Row = Schema.Struct({ id: Schema.String, label: Schema.String, detail: Schema.String });

// The playground uses the library the way an application does: it lists its components, and a template writes their tags. Each target the library declares has a layout here.
export default defineApp({
  targets: { desktop: { layout: component(desktopLayout) } },
  layout: component(layout),
  components: [...components, ...webComponents],
  state: {
    name: field(Schema.String, ""),
    tabs: field(Schema.Array(Tab), [
      { id: "one", title: "One" },
      { id: "two", title: "Two" },
    ]),
    rows: field(Schema.Array(Row), [
      { id: "a", label: "Alpha", detail: "first" },
      { id: "b", label: "Beta", detail: "second" },
    ]),
  },
  commands: (command) => ({
    rename: command(Schema.Struct({ name: Schema.String }), ({ name }, state) => ({ ...state, name })),
  }),
});
