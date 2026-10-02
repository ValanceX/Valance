// The dynamic-structure tracer needs MESH's provisional `mesh-if` / `mesh-each` (in no published MESH) and
// PORT's keyed reconciliation (in no published PORT). It resolves both from local checkouts, the same way PORT's
// integration tracer does: MESH_CHECKOUT (default ../Mesh) and PORT_CHECKOUT (default ../Port), each built.
// Everything under @valancex/ is processed by Vite so that NEXUS's own import of the MESH runtime, and
// Valance's import of PORT, resolve to those builds too: one runtime, one PORT. Nothing in package.json changes.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const mesh = process.env.MESH_CHECKOUT ?? fileURLToPath(new URL("../../../Mesh/", import.meta.url));
const port = process.env.PORT_CHECKOUT ?? fileURLToPath(new URL("../../../Port/", import.meta.url));
const local = {
  "@valancex/mesh-runtime": `${mesh}/packages/mesh-runtime/dist/index.js`,
  "@valancex/mesh-compiler": `${mesh}/packages/mesh-compiler/dist/index.js`,
  "@valancex/port-web/server": `${port}/packages/port-web/dist/server.js`,
  "@valancex/port-web": `${port}/packages/port-web/dist/index.js`,
};


export default defineConfig({
  resolve: { alias: local },
  test: { include: ["dynamic/**/*.test.ts"], server: { deps: { inline: [/@valancex[/+]/] } } },
});
