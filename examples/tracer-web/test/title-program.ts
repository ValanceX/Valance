// A test-local MESH program for harnesses that need a view and nothing else: one page with a required string `title` and a line of text, and NO declared events.
// Harnesses that only drive `start`, `invoke`, state, mounts or render failures use it instead of borrowing a catalog page, so they do not inherit that page's events
// (D ⊆ B: every event a program declares needs a binding, and these harnesses never press anything on it). The manifest still requires `title` to be a string, so a
// scope that produces another value is rejected by MESH exactly as it was by the catalog's `notfound` (render-fixture's `title: 42`).
import type { Mesh } from "@valancex/nexus";

import { compileProgram } from "@valancex/mesh-compiler";

const model = JSON.stringify({
  version: 1,
  types: {},
  components: {
    page: { props: { title: { type: { kind: "string" }, required: true } }, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    titled: { props: {}, events: {}, commands: {}, scope: { title: { kind: "string" } } },
  },
});

const result = await compileProgram({
  model: { manifest: model, path: "components.json" },
  root: "titled",
  components: [{ component: "titled", source: "<page title={title}><text>Titled</text></page>", path: "titled.mprx" }],
});

if (result.program === undefined) {
  throw new Error(`the title-only test program doesn't compile: ${JSON.stringify(result.assembly ?? result.components)}`);
}

export const titleProgram: Mesh.Program = result.program;
