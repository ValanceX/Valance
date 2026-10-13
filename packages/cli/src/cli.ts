// The `vlx` command.
//
//   vlx init [name] [--web ...]     make a new application (asks what the flags do not say)
//   vlx dev [--port N] [--host H]   serve the project and rebuild it as it changes
//   vlx build                       write the site to dist/
//   vlx check [--json]              find mistakes in authored files without building
//
// In a terminal, `init`, `dev`, `build` and `check` draw an interface (Ink, `ui/`). Anywhere else (a pipe, CI, `--json`, `--plain`) they print the plain text they always have.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { INIT_HELP, parseInit } from "./args.js";
import type { InitArgs } from "./args.js";
import { build } from "./build.js";
import { check } from "./check.js";
import { findRoot } from "./config.js";
import { localCli } from "./delegate.js";
import { dev } from "./dev.js";
import { AppError, format } from "./diagnostics.js";
import { detectPackageManager, directoryFor, directoryProblem, execute, nameProblem, runCommand, titleOf } from "./init.js";
import { TARGETS } from "./targets.js";
import { canAsk, canDraw } from "./tty.js";

const HELP = `vlx <command>

  init [name] [--web]         make a new application (vlx init --help)
  dev [--port N] [--host H]   serve the project and rebuild it as it changes
  build                       write the site to dist/
  check [--json]              find mistakes in your files without building

Run it in a project (a directory with a valance.json), or any directory inside one.
In a terminal the commands draw an interface; --plain (or a pipe, or CI) prints plain text.
`;

const option = (args: ReadonlyArray<string>, name: string): string | undefined => {
  const at = args.indexOf(name);

  return at < 0 ? undefined : args[at + 1];
};

const version = (): string => (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { readonly version: string }).version;

const runInit = async (args: InitArgs, cwd: string): Promise<number> => {
  if (args.name !== undefined) {
    const problem = nameProblem(args.name) ?? directoryProblem(directoryFor(args.name, cwd));

    if (problem !== undefined) {
      console.error(`vlx init: ${problem}`);

      return 1;
    }
  }

  // Asking needs a terminal to read keys from; with `--yes` nothing is asked, so drawing the progress needs only one to draw on.
  if (!args.plain && (args.yes ? canDraw() : canAsk())) {
    const { drawInit } = await import("./ui/run.js");
    const result = await drawInit(args, cwd, detectPackageManager(), version());

    return result.status === "done" ? 0 : result.status === "cancelled" ? 130 : 1;
  }

  if (args.name === undefined) {
    console.error("vlx init: it cannot ask in this terminal, so it needs a name: vlx init <app-name> --web");

    return 2;
  }

  if (args.targets.length === 0 && !args.yes) {
    console.error(`vlx init: choose a target (${TARGETS.map((each) => `--${each.id}`).join(", ")}), or --yes for all of them`);

    return 2;
  }

  const answers = {
    name: args.name,
    dir: directoryFor(args.name, cwd),
    targets: args.targets.length === 0 ? TARGETS.map((each) => each.id) : args.targets,
    web: { base: args.base ?? "", url: args.url ?? "" },
    packageManager: args.packageManager ?? detectPackageManager(),
    install: args.install ?? true,
    git: args.git ?? true,
    ...(args.cli === undefined ? {} : { cli: args.cli }),
  };
  const outcome = await execute(answers, (step, state, detail) => {
    if (state === "done" || state === "failed") {
      console.log(`vlx init: ${step} ${state === "done" ? "done" : "failed"}${detail === undefined ? "" : ` (${detail.split("\n")[0]})`}`);
    }
  });

  console.log(`vlx init: created ${titleOf(answers.name)} in ${answers.dir} (${outcome.files.length} files)`);
  outcome.notes.forEach((note) => {
    console.log(`vlx init: ${note}`);
  });
  console.log(`vlx init: next: cd ${answers.dir}${outcome.installed ? "" : ` && ${answers.packageManager} install`} && ${runCommand(answers.packageManager)} dev`);

  return 0;
};

export const main = async (args: ReadonlyArray<string>, cwd: string = process.cwd()): Promise<number> => {
  const [command, ...rest] = args;

  // A global `vlx` runs the project's own (see `delegate.ts`).
  if (command === "dev" || command === "build" || command === "check") {
    const local = localCli(cwd);

    if (local !== undefined) {
      const theirs = (await import(pathToFileURL(local).href)) as { readonly main: typeof main };

      return theirs.main(args, cwd);
    }
  }

  const draws = !rest.includes("--plain") && canDraw();

  try {
    switch (command) {
      case "init": {
        if (rest.includes("--help") || rest.includes("-h")) {
          console.log(INIT_HELP);

          return 0;
        }

        const parsed = parseInit(rest);

        if (typeof parsed === "string") {
          console.error(`vlx init: ${parsed}\n\n${INIT_HELP}`);

          return 2;
        }

        return await runInit(parsed, cwd);
      }
      case "dev": {
        const port = option(rest, "--port");
        const host = option(rest, "--host");

        if (draws) {
          const { drawDev } = await import("./ui/run.js");

          await drawDev(findRoot(cwd), { ...(port === undefined ? {} : { port: Number(port) }), ...(host === undefined ? {} : { host }) });

          return 0;
        }

        const running = await dev(findRoot(cwd), { ...(port === undefined ? {} : { port: Number(port) }), ...(host === undefined ? {} : { host }) });

        console.log(`vlx dev: ${running.url}`);

        // Until interrupted.
        await new Promise<void>((resolve) => {
          process.once("SIGINT", resolve);
          process.once("SIGTERM", resolve);
        });
        await running.close();

        return 0;
      }
      case "build": {
        if (draws) {
          const { drawBuild } = await import("./ui/run.js");

          await drawBuild(findRoot(cwd));

          return 0;
        }

        const started = Date.now();
        const built = await build(findRoot(cwd));

        console.log(`vlx build: ${built.pages.length} pages, ${built.files.length} files → ${built.dir} (${((Date.now() - started) / 1000).toFixed(1)}s)`);

        return 0;
      }
      case "check": {
        if (draws && !rest.includes("--json")) {
          const { drawCheck } = await import("./ui/run.js");

          return (await drawCheck(findRoot(cwd))).diagnostics.length === 0 ? 0 : 1;
        }

        const result = await check(findRoot(cwd));

        if (rest.includes("--json")) {
          console.log(JSON.stringify(result.diagnostics, null, 2));
        } else if (result.diagnostics.length === 0) {
          console.log(`vlx check: ${result.pages} pages, ${result.components.length} components, no problems`);
        } else {
          result.diagnostics.forEach((each) => {
            console.error(format(each));
          });
          console.error(`vlx check: ${result.diagnostics.length} problem${result.diagnostics.length === 1 ? "" : "s"}`);
        }

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
        console.error(`vlx: unknown command "${command}"\n\n${HELP}`);

        return 2;
    }
  } catch (error) {
    if (error instanceof AppError) {
      if (draws) {
        const { drawDiagnostics } = await import("./ui/run.js");

        await drawDiagnostics(error.diagnostics);

        return 1;
      }

      error.diagnostics.forEach((each) => {
        console.error(format(each));
      });

      return 1;
    }

    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));

    return 1;
  }
};
