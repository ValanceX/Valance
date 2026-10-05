// Build time, in Node: the conditional slice's MESH program (MPRX → template-v1 → program), compiled by the published compiler. The browser never compiles MPRX.
import type { Mesh } from "@valancex/nexus";
import type { TestProject } from "vitest/node";

import { compileProgram } from "@valancex/mesh-compiler";

const prop = (kind: string) => ({ type: { kind }, required: true });
const manifest = JSON.stringify({
  version: 1, types: {},
  components: {
    page: { props: { title: prop("string") }, events: {}, commands: {}, scope: {} },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    field: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
    "mesh-if": { props: { when: prop("boolean") }, events: {}, commands: {}, scope: {} },
    branches: {
      props: {}, events: {},
      commands: { turnOff: { parameters: [] }, turnOn: { parameters: [] }, showField: { parameters: [] }, hideField: { parameters: [] }, bump: { parameters: [] } },
      scope: { title: { kind: "string" }, on: { kind: "boolean" }, field: { kind: "boolean" }, tail: { kind: "string" } },
    },
  },
});
// A conditional with two alternatives of the SAME component in the same place (A/B), then a one-alternative conditional holding a stateful element, between static siblings.
const source = `<page title={title}>
  <text>head</text>
  <mesh-if when={on}>
    <button on.click={turnOff()}>A</button>
    <button on.click={turnOn()}>B</button>
  </mesh-if>
  <mesh-if when={field}><field /></mesh-if>
  <button on.click={showField()}>show field</button>
  <button on.click={hideField()}>hide field</button>
  <button on.click={bump()}>bump</button>
  <text>{tail}</text>
</page>`;

export default async function setup(project: TestProject): Promise<void> {
  const result = await compileProgram({ model: { manifest, path: "components.json" }, root: "branches", components: [{ component: "branches", source, path: "branches.mprx" }] });

  if (result.program === undefined) { throw new Error(JSON.stringify(result.assembly ?? result.components)); }

  project.provide("conditional", result.program);
}

declare module "vitest" {
  export interface ProvidedContext {
    conditional: Mesh.Program;
  }
}
