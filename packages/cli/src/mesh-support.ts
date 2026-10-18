// What the installed `@valancex/mesh-compiler` reads. MESH 0.14 added the `enum` type kind and a prop's `default`; an older compiler reports them as `manifest-unknown-kind`. The manifest
// writes a string-literal union as an enum only for a compiler that reads one, and widens it to `string` for an older one (a default has no older form, and is said so). Asked once.
import { compileProgram } from "@valancex/mesh-compiler";

let known: Promise<boolean> | undefined;

/** Whether the installed MESH compiler reads the `enum` kind: it compiles a one-component program whose scope holds one. */
export const meshReadsEnums = (): Promise<boolean> => {
  known ??= compileProgram({
    model: {
      manifest: JSON.stringify({
        version: 1,
        types: {},
        components: { probe: { props: {}, events: {}, commands: {}, scope: { value: { kind: "enum", values: ["a"] } } } },
      }),
      path: "probe.json",
    },
    root: "probe",
    components: [{ component: "probe", source: "<probe />", path: "probe.mprx" }],
  }).then((result) => !JSON.stringify(result).includes("manifest-unknown-kind"));

  return known;
};
