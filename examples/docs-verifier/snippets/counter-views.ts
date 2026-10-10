import { compileProgram } from "@valancex/mesh-compiler";

// The component manifest lists the tags a view may use and what the view reads and runs.
const manifest = JSON.stringify({
  version: 1,
  types: {},
  components: {
    page: { props: {}, events: {}, commands: { increment: { parameters: [] } }, scope: { count: { kind: "number" } } },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: {}, events: { click: {} }, commands: {}, scope: {} },
  },
});

const source = `<page>
  <text>Count: {count}</text>
  <button on.click={increment()}>Add one</button>
</page>`;

const compiled = await compileProgram({ model: { manifest, path: "components.json" }, root: "page", components: [{ component: "page", source, path: "page.mprx" }] });

if (compiled.program === undefined) {
  throw new Error("the view does not compile");
}

export const program = compiled.program;
