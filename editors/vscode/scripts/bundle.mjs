// The shipped extension is one file: `dist/extension.js`, with `vscode-languageclient` and the extension's own modules inside, and only `vscode` (supplied by the editor) left outside. The
// package is then made with `vsce package --no-dependencies`, so no `node_modules` goes in it. The host tests run this bundle, so what is tested is what is shipped.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
  entryPoints: [fileURLToPath(new URL("../src/extension.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/extension.js", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
});
