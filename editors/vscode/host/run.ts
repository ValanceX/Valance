// Launches a real VS Code with the extension loaded and the host suite (./suite.ts) running inside it, on a scratch copy of examples/docs-app. Needs a display (xvfb-run on Linux) and a network
// that can fetch VS Code. `VSCODE_VERSION` picks the version ("stable" by default; engines.vscode in package.json is the oldest supported).
import { runTests } from "@vscode/test-electron";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extension = resolve(__dirname, "..");
const app = resolve(extension, "../../examples/docs-app");

const main = async (): Promise<void> => {
  // The suite edits and saves files, so it works on a copy that shares the application's installed packages (valance, mesh-lsp).
  const workspace = mkdtempSync(join(tmpdir(), "valance-host-"));

  for (const entry of ["content", "public", "src", "package.json"]) { cpSync(join(app, entry), join(workspace, entry), { recursive: true }); }

  // No `$schema` line: the suite checks the schema the extension itself contributes.
  writeFileSync(join(workspace, "valance.json"), '{\n  "version": 1,\n  "name": "Notes"\n}\n');
  symlinkSync(join(app, "node_modules"), join(workspace, "node_modules"), "dir");

  // What a developer has after their first `valance dev`: the generated files the extension reads.
  execFileSync(join(workspace, "node_modules", ".bin", "valance"), ["check"], { cwd: workspace, stdio: "inherit" });

  await runTests({
    version: process.env["VSCODE_VERSION"] ?? "stable",
    extensionDevelopmentPath: extension,
    extensionTestsPath: join(__dirname, "suite"),
    launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes"],
  });
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
