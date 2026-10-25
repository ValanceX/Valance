// Copies the data files `src/` reads at run time next to the compiled code (tsc emits only what it compiles). The budgets are read with `readFileSync`, not imported with a JSON import attribute: the
// editor's extension host runs `vlx` on the Node of the oldest VS Code it supports (Node 20.9), which does not parse import attributes.
import { copyFileSync } from "node:fs";

copyFileSync(new URL("../src/budgets.json", import.meta.url), new URL("../dist/budgets.json", import.meta.url));
