// Launches a real VS Code with the extension loaded and the host suite (./suite.ts) running inside it, once per scenario, each on a scratch copy of examples/docs-app:
//
//   project   the window is opened on the project itself
//   parent    the window is opened on a folder that holds the project two levels down (a repository, a monorepo)
//
// Needs a display (xvfb-run on Linux) and a network that can fetch VS Code. `VSCODE_VERSION` picks the version ("stable" by default; engines.vscode in package.json is the oldest supported).
import { runTests } from "@vscode/test-electron";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const extension = resolve(__dirname, "..");
const app = resolve(extension, "../../examples/docs-app");

/** A copy of the example that the suite may edit and save, sharing the application's installed packages (vlx, mesh-lsp), and what a developer has after their first `vlx dev`. */
const project = (into: string): string => {
  mkdirSync(into, { recursive: true });

  for (const entry of ["content", "public", "src", "package.json"]) { cpSync(join(app, entry), join(into, entry), { recursive: true }); }

  // No `$schema` line: the suite checks the schema the extension itself contributes.
  writeFileSync(join(into, "valance.json"), '{\n  "version": 1,\n  "name": "Notes"\n}\n');
  symlinkSync(join(app, "node_modules"), join(into, "node_modules"), "dir");
  execFileSync(join(into, "node_modules", ".bin", "vlx"), ["check"], { cwd: into, stdio: "inherit" });

  return into;
};

const scenarios: Readonly<Record<string, () => string>> = {
  project: () => project(mkdtempSync(join(tmpdir(), "valance-host-"))),
  parent: () => {
    const parent = mkdtempSync(join(tmpdir(), "valance-host-parent-"));

    project(join(parent, "apps", "docs"));

    return parent;
  },
};

const main = async (): Promise<void> => {
  for (const [scenario, prepare] of Object.entries(scenarios)) {
    console.log(`\n== scenario: ${scenario}`);

    await runTests({
      version: process.env["VSCODE_VERSION"] ?? "stable",
      extensionDevelopmentPath: extension,
      extensionTestsPath: join(__dirname, "suite"),
      extensionTestsEnv: { VALANCE_HOST_SCENARIO: scenario },
      launchArgs: [prepare(), "--disable-extensions", "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes"],
    });
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
