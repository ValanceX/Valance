// The `valance` command.
//
//   valance dev [--port N] [--host H]   serve the project and rebuild it as it changes
//   valance build                       write the site to dist/
//   valance check [--json]              find mistakes in authored files without building
import { readFileSync } from "node:fs";

import { build } from "./build.js";
import { check } from "./check.js";
import { findRoot } from "./config.js";
import { dev } from "./dev.js";
import { AppError, format } from "./diagnostics.js";

const HELP = `valance <command>

  dev [--port N] [--host H]   serve the project and rebuild it as it changes
  build                       write the site to dist/
  check [--json]              find mistakes in your files without building

Run it in a project (a directory with a valance.json), or any directory inside one.
`;

const option = (args: ReadonlyArray<string>, name: string): string | undefined => {
  const at = args.indexOf(name);

  return at < 0 ? undefined : args[at + 1];
};

const version = (): string => (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { readonly version: string }).version;

export const main = async (args: ReadonlyArray<string>, cwd: string = process.cwd()): Promise<number> => {
  const [command, ...rest] = args;

  try {
    switch (command) {
      case "dev": {
        const port = option(rest, "--port");
        const host = option(rest, "--host");
        const running = await dev(findRoot(cwd), { ...(port === undefined ? {} : { port: Number(port) }), ...(host === undefined ? {} : { host }) });

        console.log(`valance dev: ${running.url}`);

        // Until interrupted.
        await new Promise<void>((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
        await running.close();

        return 0;
      }
      case "build": {
        const started = Date.now();
        const built = await build(findRoot(cwd));

        console.log(`valance build: ${built.pages.length} pages, ${built.files.length} files → ${built.dir} (${((Date.now() - started) / 1000).toFixed(1)}s)`);

        return 0;
      }
      case "check": {
        const result = await check(findRoot(cwd));

        if (rest.includes("--json")) { console.log(JSON.stringify(result.diagnostics, null, 2)); } else if (result.diagnostics.length === 0) { console.log(`valance check: ${result.pages} pages, ${result.components.length} components, no problems`); } else { result.diagnostics.forEach((each) => { console.error(format(each)); }); console.error(`valance check: ${result.diagnostics.length} problem${result.diagnostics.length === 1 ? "" : "s"}`); }

        return result.diagnostics.length === 0 ? 0 : 1;
      }
      case "--version":
      case "-v":
        console.log(version());

        return 0;
      case undefined:
      case "help":
      case "--help":
      case "-h":
        console.log(HELP);

        return 0;
      default:
        console.error(`valance: unknown command "${command}"\n\n${HELP}`);

        return 2;
    }
  } catch (error) {
    if (error instanceof AppError) {
      error.diagnostics.forEach((each) => { console.error(format(each)); });

      return 1;
    }

    console.error(error instanceof Error ? error.stack ?? error.message : String(error));

    return 1;
  }
};
