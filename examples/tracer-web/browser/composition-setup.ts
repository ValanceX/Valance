// Build time, in Node: the composition slice's MESH program (a keyed list, and conditional loading/error banners), compiled by the published compiler.
import type { Mesh } from "@valancex/nexus";
import type { TestProject } from "vitest/node";

import { compileProgram } from "@valancex/mesh-compiler";

const prop = (kind: string) => ({ type: { kind }, required: true });
const manifest = JSON.stringify({
  version: 1, types: {},
  components: {
    page: { props: { title: prop("string") }, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    row: { props: {}, events: {}, commands: {}, scope: {} },
    field: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    "mesh-if": { props: { when: prop("boolean") }, events: {}, commands: {}, scope: {} },
    "mesh-each": { props: { items: { type: { kind: "list", element: { kind: "any" } }, required: true }, as: prop("string"), key: { type: { kind: "any" }, required: true } }, events: {}, commands: {}, scope: {} },
    board: {
      props: {}, events: {},
      commands: { select: { parameters: [{ name: "id", type: { kind: "string" } }] } },
      scope: {
        title: { kind: "string" }, loading: { kind: "boolean" }, failed: { kind: "boolean" }, selected: { kind: "string" }, result: { kind: "string" },
        items: { kind: "list", element: { kind: "record", fields: { id: prop("string"), label: prop("string") } } },
      },
    },
  },
});
const source = `<page title={title}>
  <mesh-if when={loading}><text>loading {selected}</text><text>result: {result}</text></mesh-if>
  <mesh-if when={failed}><text>error {selected}</text></mesh-if>
  <mesh-each items={items} as="item" key={item.id}><row><field /><button on.click={select(item.id)}>{item.label}</button></row></mesh-each>
</page>`;

export default async function setup(project: TestProject): Promise<void> {
  const result = await compileProgram({ model: { manifest, path: "components.json" }, root: "board", components: [{ component: "board", source, path: "board.mprx" }] });

  if (result.program === undefined) { throw new Error(JSON.stringify(result.assembly ?? result.components)); }

  project.provide("composition", result.program);
}

declare module "vitest" {
  export interface ProvidedContext {
    composition: Mesh.Program;
  }
}
