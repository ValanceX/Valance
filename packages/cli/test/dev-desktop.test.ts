// `vlx dev` for a desktop project, with a stand-in for the window program: it is started with the engine's command line in VLX_ENGINE, and started again after a change.
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { dev } from "../src/dev.js";
import { mattersToTheEngine } from "../src/dev-desktop.js";
import { plan } from "../src/init.js";
import { cleanup, project } from "./fixture.js";

afterEach(cleanup);

describe("which changes the engine is built again for", () => {
  it("is the content, the templates, the public files and the configuration; not the generated files or the output", () => {
    for (const file of ["content/index.md", "src/layout.mprx", "public/a.png", "valance.json", "valance.desktop.json"]) {
      expect(mattersToTheEngine(file), file).toBe(true);
    }

    for (const file of [".valance/program.json", "dist/desktop/engine.mjs", "node_modules/x/index.js", "package.json"]) {
      expect(mattersToTheEngine(file), file).toBe(false);
    }
  });
});

describe.skipIf(process.platform === "win32")("vlx dev on a desktop project", () => {
  it("builds the engine, opens the window on it, and opens it anew after a change", async () => {
    const answers = { name: "Notes", dir: "/unused", web: { base: "", url: "" }, packageManager: "npm", install: false, git: false, cli: "^0.0.0", targets: ["desktop"] } as never;
    const root = project(Object.fromEntries([...plan(answers).files].filter(([name]) => name !== "package.json" && name !== "valance.json")));
    const log = join(tmpdir(), `vlx-window-${Date.now()}.log`);
    const stand = join(tmpdir(), `vlx-window-${Date.now()}.mjs`);

    writeFileSync(
      stand,
      `#!${process.execPath}\nimport { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(log)}, process.env.VLX_ENGINE + "\\n");\nsetInterval(() => {}, 1000);\n`,
    );
    chmodSync(stand, 0o755);
    process.env["VLX_WINDOW"] = stand;

    const lines: Array<string> = [];
    const running = await dev(root, { log: (line) => void lines.push(line) });

    try {
      const opened = (): ReadonlyArray<string> => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
      const until = async (done: () => boolean): Promise<void> => {
        for (let tries = 0; !done(); tries += 1) {
          if (tries > 500) {
            throw new Error(`timed out: ${lines.join(" | ")}`);
          }

          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      };

      await until(() => opened().length === 1);
      expect(opened()[0]).toMatch(/engine\.mjs$/);
      writeFileSync(join(root, "content/index.md"), "---\ntitle: Changed\n---\n\n# Changed\n");
      await until(() => opened().length === 2);
    } finally {
      await running.close();
      delete process.env["VLX_WINDOW"];
    }
  }, 120_000);
});
