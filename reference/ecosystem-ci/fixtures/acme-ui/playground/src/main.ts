import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import { components } from "acme-ui";
import layout from "./layout.mprx";
import desktopLayout from "./desktop/layout.mprx";

// The playground uses the library the way an application does: it lists its components, and a template writes their tags. Each target the library declares has a layout here, so `vlx library check`
// holds every component to every target it says it supports.
export default defineApp({
  targets: { desktop: { layout: component(desktopLayout) } },
  layout: component(layout),
  components,
  state: { dismissed: field(Schema.Boolean, false) },
  commands: (command) => ({ dismiss: command((state) => ({ ...state, dismissed: true })) }),
});
