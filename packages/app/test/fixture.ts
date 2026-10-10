// A throwaway project on disk. `node_modules/@valancex/app` links to this package, so a project built here resolves it the way an installed one does.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE = fileURLToPath(new URL("..", import.meta.url));
const made: Array<string> = [];

export const project = (files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), "valance-app-"));

  made.push(root);
  mkdirSync(join(root, "node_modules", "@valancex"), { recursive: true });
  symlinkSync(PACKAGE, join(root, "node_modules", "@valancex", "app"), "dir");

  for (const [name, text] of Object.entries({ "valance.json": '{ "name": "Test" }', ...files })) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), text);
  }

  return root;
};

export const cleanup = (): void => { for (const root of made.splice(0)) { rmSync(root, { recursive: true, force: true }); } };

export const PAGE = (title = "Home", body = ""): string => `---\ntitle: ${title}\n---\n\n# ${title}\n\n${body}\n`;
