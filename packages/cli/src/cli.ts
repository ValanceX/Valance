// The `vlx` command.
//
//   vlx init [name] [--web ...]     make a new application (asks what the flags do not say)
//   vlx dev [--port N] [--host H]   serve the project and rebuild it as it changes
//   vlx build                       write the site to dist/web/
//   vlx check [--json]              find mistakes in authored files without building
//   vlx theme check [--json]        the theme: its tokens, recipes, contrast and what each target applies
//   vlx generate page|component <name>   add a page, or a component registered in src/main.ts (alias: g)
//   vlx sync                        bring .valance/ (generated types, manifest, entries) up to date; runs by itself after install and generate
//   vlx help [command]              what a command does
//
// In a terminal, `init`, `dev`, `build` and `check` draw an interface (Ink, `ui/`). Anywhere else (a pipe, CI, `--json`, `--plain`) they print the plain text they always have.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { INIT_HELP, parseInit } from "./args.js";
import type { InitArgs } from "./args.js";
import { build } from "./build.js";
import { packageDesktop } from "./package.js";
import { generateComponent, generatePage, generateTarget, GenerateError, KINDS } from "./add.js";
import type { Kind } from "./add.js";
import { check } from "./check.js";
import { themeReport } from "./theme.js";
import { findRoot } from "./config.js";
import { localCli } from "./delegate.js";
import { dev } from "./dev.js";
import { AppError, format } from "./diagnostics.js";
import { detectPackageManager, directoryFor, directoryProblem, execute, nameProblem, runCommand, titleOf } from "./init.js";
import type { TargetId } from "./targets.js";
import { DEFAULT_TARGETS, TARGETS } from "./targets.js";
import { canAsk, canDraw } from "./tty.js";

const HELP = `vlx <command>

  init [name] [--web]              make a new application
  dev [--port N] [--host H]        serve it and rebuild as it changes
  build                            write the site to dist/web/
  check [--json]                   find mistakes in your files without building
  theme check [--json]             check the theme: tokens, recipes, contrast, and what each target applies
  generate page|component <name>  add a page, or a component (alias: g)
  generate target web|desktop      add a target to the project
  package --desktop                the desktop target as one executable beside its window (unsigned)
  sync                             refresh the generated files (this runs by itself; see vlx help sync)
  help [command]                   say more about one command

Run it in a project (a directory with a valance.json), or any directory inside one.
In a terminal the commands draw an interface; --plain (or a pipe, or CI) prints plain text.
`;

const GENERATE_HELP = `vlx generate <page|component|target> <name>   (alias: vlx g)

  vlx generate page guide/getting-started   content/guide/getting-started.md, with its front matter
                                            (--title "Getting started" to say the title)
  vlx generate component post-card          src/post-card.mprx and src/post-card.ts, imported in
                                            src/main.ts and listed in its \`components\`. Write
                                            <post-card></post-card> in a template to use it.
  vlx generate target desktop               valance.desktop.json and a layout of its own in src/desktop/,
                                            registered in \`targets\` of src/main.ts; the content, the state and
                                            the commands are shared. Nothing the project has is moved.

Nothing is overwritten: a name that is taken is refused.
`;

const COMMAND_HELP: Readonly<Record<string, string>> = {
  init: INIT_HELP,
  generate: GENERATE_HELP,
  g: GENERATE_HELP,
  dev: "vlx dev [--web|--desktop] [--port N] [--host H]\n\nServe the project (the web is served, a desktop project opens its window; a project of more than one target does both, or the one named) and rebuild it as files change. A mistake leaves the last good build serving and shows in the terminal and in the page.\n",
  build:
    "vlx build [--web] [--desktop]\n\nBuild every target the project has (or the ones named). The web: the site, in dist/web/; any host that serves files can serve it. The desktop: the engine, in dist/desktop/.\n",
  sync: "vlx sync\n\nBring .valance/ up to date: the generated types for your templates (so your editor and tsc agree with them), the manifest and the entries. You rarely run it: a new project does it after install (the `prepare` script), `vlx generate` does it after it writes, and dev, build and check do it as they run. It never fails: mistakes in your files are reported by vlx check.\n",
  package:
    "vlx package --desktop [--platform linux-x64|win32-x64] [--window <path>] [--node <path>] [--archive]\n\nBuild the desktop target and package it: the engine as one executable (Node's single executable application, with the MESH runtime inside) beside the Desktop PORT's window program, in dist/package/<platform>/. --window is the window program for that platform (default: VLX_WINDOW, else vlx-window on the PATH; build it from the PORT repository). For another platform, --node is a node binary of this version for it. --archive also writes the package as one file, a .tar.gz (Linux) or a .zip (Windows), with its SHA-256 beside it. The result is unsigned.\n",
  theme:
    "vlx theme check [--json]\n\nCheck the theme: the project's `theme/theme.json` (its tokens by mode, in the Design Tokens format, and its recipes), or the default theme when it has none. Reports a token that does not resolve, a recipe that names a part, state, variant, property or token that does not exist, a removed focus ring, the contrast of every pair the theme declares (WCAG 2.2), and what the web and the desktop apply of it. --json prints the diagnostics, the contrast and the coverage.\n",
  check: "vlx check [--json]\n\nFind mistakes in your files without building. --json prints them as { file, line, column, code, message } for editors and CI.\n",
};

/** Refreshes `.valance/` and says so in a line. Best effort: a mistake in the project is `check`'s to report, and a project with no `valance.json` (the install ran before init finished) is left alone. */
const sync = async (from: string): Promise<string> => {
  try {
    const checked = await check(findRoot(from));

    return checked.diagnostics.length === 0
      ? "the generated files are up to date"
      : `the generated files are up to date; ${checked.diagnostics.length} problem${checked.diagnostics.length === 1 ? "" : "s"} in your files (vlx check)`;
  } catch (error) {
    return `skipped (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`;
  }
};

/** The targets named by flags (`--web`, `--desktop`), in the order given. */
const targetFlags = (args: ReadonlyArray<string>): ReadonlyArray<TargetId> => TARGETS.map((each) => each.id).filter((id) => args.includes(`--${id}`));

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
    console.error(`vlx init: choose a target (${TARGETS.map((each) => `--${each.id}`).join(", ")}), or --yes for the web`);

    return 2;
  }

  const answers = {
    name: args.name,
    dir: directoryFor(args.name, cwd),
    targets: args.targets.length === 0 ? DEFAULT_TARGETS : args.targets,
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

  // `vlx dev --help` says what dev does and runs nothing (`init` and `generate` answer for themselves below).
  if (
    command !== undefined &&
    command !== "init" &&
    command !== "generate" &&
    command !== "g" &&
    COMMAND_HELP[command] !== undefined &&
    (rest.includes("--help") || rest.includes("-h"))
  ) {
    console.log(COMMAND_HELP[command]);

    return 0;
  }

  // A global `vlx` runs the project's own (see `delegate.ts`).
  if (
    command === "dev" ||
    command === "build" ||
    command === "package" ||
    command === "check" ||
    command === "theme" ||
    command === "sync" ||
    command === "generate" ||
    command === "g"
  ) {
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
        const picked = targetFlags(rest);

        if (picked.length > 1) {
          console.error("vlx dev: name one target, or none for all of them: vlx dev --web or vlx dev --desktop");

          return 2;
        }

        const target = picked[0];

        if (draws) {
          const { drawDev } = await import("./ui/run.js");

          await drawDev(findRoot(cwd), {
            ...(target === undefined ? {} : { target }),
            ...(port === undefined ? {} : { port: Number(port) }),
            ...(host === undefined ? {} : { host }),
          });

          return 0;
        }

        const running = await dev(findRoot(cwd), {
          ...(target === undefined ? {} : { target }),
          ...(port === undefined ? {} : { port: Number(port) }),
          ...(host === undefined ? {} : { host }),
        });

        console.log(`vlx dev: ${running.url}`);

        // Until interrupted (or, for a desktop project, until the window is closed).
        await new Promise<void>((resolve) => {
          process.once("SIGINT", resolve);
          process.once("SIGTERM", resolve);
          void (running as { readonly closed?: Promise<void> }).closed?.then(resolve);
        });
        await running.close();

        return 0;
      }
      case "build": {
        if (draws) {
          const { drawBuild } = await import("./ui/run.js");

          await drawBuild(findRoot(cwd), targetFlags(rest));

          return 0;
        }

        const started = Date.now();
        const flagged = targetFlags(rest);
        const built = await build(findRoot(cwd), flagged.length === 0 ? {} : { targets: flagged });

        console.log(`vlx build: ${built.pages.length} pages, ${built.files.length} files → ${built.dir} (${((Date.now() - started) / 1000).toFixed(1)}s)`);

        return 0;
      }
      case "package": {
        if (!rest.includes("--desktop")) {
          console.error("vlx package: say what: vlx package --desktop [--platform linux-x64|win32-x64] [--window <path>] [--node <path>] [--archive]");

          return 2;
        }

        const platform = option(rest, "--platform");
        const window = option(rest, "--window");
        const node = option(rest, "--node");
        const packaged = await packageDesktop(findRoot(cwd), {
          ...(platform === undefined ? {} : { platform }),
          ...(window === undefined ? {} : { window }),
          ...(node === undefined ? {} : { node }),
          ...(rest.includes("--archive") ? { archive: true } : {}),
        });

        console.log(`vlx package: ${packaged.files.join(", ")} → ${packaged.dir}`);
        packaged.notes.forEach((note) => console.log(`vlx package: ${note}`));

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
      case "theme": {
        if (rest[0] !== "check") {
          console.error("vlx theme: say what: vlx theme check [--json]");

          return 2;
        }

        const report = themeReport(findRoot(cwd));

        if (rest.includes("--json")) {
          console.log(
            JSON.stringify({ theme: report.name, custom: report.custom, diagnostics: report.diagnostics, contrast: report.contrast, coverage: report.coverage }, null, 2),
          );

          return report.diagnostics.length === 0 ? 0 : 1;
        }

        console.log(`vlx theme check: ${report.custom ? "the project's theme" : "the default theme"} "${report.name}" (modes: ${report.modes.join(", ")})`);

        for (const each of report.contrast) {
          console.log(`  contrast  ${each.mode.padEnd(9)} ${each.text} on ${each.on}  ${each.ratio.toFixed(2)}:1  (min ${each.min})  ${each.passes ? "ok" : "BELOW"}`);
        }

        for (const each of report.coverage) {
          console.log(
            `  ${each.target}: ${each.styled.length} of ${each.styled.length + each.unstyled.length} primitives of the portable core styled${each.unstyled.length === 0 ? "" : ` (not styled: ${each.unstyled.join(", ")})`}`,
          );

          for (const note of each.notApplied) {
            console.log(`    not applied: ${note.primitive} ${note.kind} ${note.name} (${note.support})`);
          }
        }

        report.diagnostics.forEach((each) => {
          console.error(format(each));
        });
        console.log(
          report.diagnostics.length === 0 ? "vlx theme check: no problems" : `vlx theme check: ${report.diagnostics.length} problem${report.diagnostics.length === 1 ? "" : "s"}`,
        );

        return report.diagnostics.length === 0 ? 0 : 1;
      }
      case "sync": {
        const synced = await sync(cwd);

        console.log(synced);

        return 0;
      }
      case "generate":
      case "g": {
        if (rest.includes("--help") || rest.includes("-h")) {
          console.log(GENERATE_HELP);

          return 0;
        }

        const title = option(rest, "--title");
        const positional = rest.filter((each, at) => !each.startsWith("-") && rest[at - 1] !== "--title");
        const kind = positional[0] as Kind | undefined;

        if (kind === undefined || !KINDS.includes(kind) || positional[1] === undefined || positional.length > 2) {
          console.error(`vlx generate: say what and its name: ${KINDS.map((each) => `vlx generate ${each} <name>`).join(", ")}\n\n${GENERATE_HELP}`);

          return 2;
        }

        const root = findRoot(cwd);

        try {
          const made =
            kind === "page" ? generatePage(root, positional[1], title) : kind === "target" ? generateTarget(root, positional[1]) : generateComponent(root, positional[1]);

          made.created.forEach((file) => console.log(`vlx generate: created ${file}`));
          made.changed.forEach((file) => console.log(`vlx generate: changed ${file}`));
          console.log(`vlx generate: ${await sync(root)}`);
          made.notes.forEach((note) => console.log(`vlx generate: ${note}`));

          return 0;
        } catch (error) {
          if (error instanceof GenerateError) {
            console.error(`vlx generate: ${error.message}`);

            return 1;
          }

          throw error;
        }
      }
      case "--version":
      case "-v":
        console.log(version());

        return 0;
      case "help": {
        const about = rest[0];

        if (about === undefined) {
          console.log(HELP);

          return 0;
        }

        const text = COMMAND_HELP[about];

        if (text === undefined) {
          console.error(`vlx help: no command "${about}"\n\n${HELP}`);

          return 2;
        }

        console.log(text);

        return 0;
      }
      case undefined:
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
