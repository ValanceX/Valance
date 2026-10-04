// A valid MESH program for harnesses that need a view and nothing else: one `text`, a root with no scope, and NO declared events.
// `start` asks MESH which events a program declares (Contract §2), and MESH rejects a program that is not valid, so a harness cannot use a placeholder such as
// `{ root, templates: [], model: "{}" }`. Built with MESH's own `compileProgram`, as an application's build step does (Contract §15).
import type { Mesh } from "@valancex/nexus";

import { compileProgram } from "@valancex/mesh-compiler";

const model = JSON.stringify({
  version: 1,
  types: {},
  components: {
    text: { props: {}, events: {}, commands: {}, scope: {} },
    main: { props: {}, events: {}, commands: {}, scope: {} },
  },
});

const result = await compileProgram({ model: { manifest: model, path: "components.json" }, root: "main", components: [{ component: "main", source: "<text>main</text>", path: "main.mprx" }] });

if (result.program === undefined) {
  throw new Error(`the event-free test program doesn't compile: ${JSON.stringify(result.assembly ?? result.components)}`);
}

export const eventFreeProgram: Mesh.Program = result.program;
