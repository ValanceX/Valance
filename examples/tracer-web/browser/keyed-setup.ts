// Build time, in Node: the keyed-repetition slice's MESH program, compiled by the published compiler. The browser never compiles MPRX.
import type { Mesh } from "@valancex/nexus";
import type { TestProject } from "vitest/node";

import { compileProgram } from "@valancex/mesh-compiler";

const prop = (kind: string) => ({ type: { kind }, required: true });
const manifest = JSON.stringify({
  version: 1, types: {},
  components: {
    page: { props: { title: prop("string") }, events: {}, commands: {}, scope: {} },
    row: { props: {}, events: {}, commands: {}, scope: {} },
    field: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    "mesh-each": { props: { items: { type: { kind: "list", element: { kind: "any" } }, required: true }, as: prop("string"), key: { type: { kind: "any" }, required: true } }, events: {}, commands: {}, scope: {} },
    keyed: {
      props: {}, events: {},
      commands: { pick: { parameters: [{ name: "id", type: { kind: "string" } }] } },
      scope: { title: { kind: "string" }, items: { kind: "list", element: { kind: "record", fields: { id: prop("string"), value: prop("string") } } } },
    },
  },
});
// One repeated row per item: a stateful element (an input) and a button that shows the item's data and names the item in its command.
const source = `<page title={title}>
  <mesh-each items={items} as="item" key={item.id}><row><field /><button on.click={pick(item.id)}>{item.value}</button></row></mesh-each>
</page>`;

export default async function setup(project: TestProject): Promise<void> {
  const result = await compileProgram({ model: { manifest, path: "components.json" }, root: "keyed", components: [{ component: "keyed", source, path: "keyed.mprx" }] });

  if (result.program === undefined) { throw new Error(JSON.stringify(result.assembly ?? result.components)); }

  project.provide("keyed", result.program);
}

declare module "vitest" {
  export interface ProvidedContext {
    keyed: Mesh.Program;
  }
}
