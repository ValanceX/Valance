// The MPRX grammar has one home, MESH (`editors/vscode` in the MESH repository), next to the Tree-sitter grammar and the fixtures it is tested against. This extension ships a copy so it works
// before MESH publishes its language extension; once it does, this extension depends on that one (`extensionDependencies`) and the copy goes. `MESH_DIR` points at a MESH checkout.
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

const mesh = resolve(process.env["MESH_DIR"] ?? new URL("../../../../Mesh", import.meta.url).pathname);

for (const [from, to] of [["editors/vscode/syntaxes/mprx.tmLanguage.json", "syntaxes/mprx.tmLanguage.json"], ["editors/vscode/language-configuration.json", "language-configuration.json"]]) {
  copyFileSync(resolve(mesh, from), new URL(`../${to}`, import.meta.url));
}

console.log(`copied the grammar from ${mesh}`);
