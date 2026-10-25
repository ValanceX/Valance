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
import { resolve } from "node:path";
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
import { defaultRecording, replayFile } from "./replay.js";
import { AppError, format } from "./diagnostics.js";
import { detectPackageManager, directoryFor, directoryProblem, execute, install as installDependencies, nameProblem, PACKAGE_MANAGERS, runCommand, titleOf } from "./init.js";
import type { PackageManager } from "./init.js";
import { buildLibrary, checkLibrary, scaffoldLibrary } from "./library.js";
import type { TargetId } from "./targets.js";
import { DEFAULT_TARGETS, TARGETS } from "./targets.js";
import { canAsk, canDraw } from "./tty.js";

const HELP = `vlx <command>

  init [name] [--web]              make a new application
  dev [--port N] [--host H]        serve it and rebuild as it changes (--record [file]: write a session log)
  replay <log> [--route R] [--allow-user-data]  play a session log against this project and find where it differs
  build                            write the site to dist/web/
  check [--json]                   find mistakes in your files without building
  theme check [--json]             check the theme: tokens, recipes, contrast, and what each target applies
  init library <name>              make a component library: a workspace with the package and a playground
  library build|check              build a library's dist/ (JavaScript, declarations, templates, styles); check the package
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

const LIBRARY_HELP = `vlx library <build|check> [--json] [--app <dir>]

Run in a library's package directory (the one with the "valance" export condition; \`vlx init library\` makes one).

  vlx library build    dist/: the TypeScript compiled to JavaScript with declarations (the components' contracts are the
                       types component() gives them), and every .mprx and .css under src/ copied beside it. Templates ship
                       as source: the application's build compiles them. Needs typescript installed in the library.
  vlx library check    the package as a consumer's build needs it: the "valance" condition on exports["."] and the file it
                       names, no other entry a tool without the condition would load, a peer dependency on
                       @valancex/common, stylesheets that exist and "sideEffects" that keeps them; then the playground
                       (--app <dir>, default ../../playground, ./playground or ../playground), an application that depends
                       on this package: it must build every target the package declares and write every template the
                       package ships, and its own \`vlx check\` problems are reported with the library's.

Exits 0 when there is nothing to say, 1 when there is. --json prints the diagnostics.
`;

const INIT_LIBRARY_HELP = `vlx init library <name> [--pm <npm|pnpm|yarn|bun>] [--no-install] [--cli <spec>]

Make a component library: a workspace with packages/<name> (a sample component, written with the portable core, its contract,
a tsconfig and a package.json that is marked as a library) and playground/ (an application that depends on it and builds
the web and the desktop). <name> is the package name (acme-ui, @acme/ui); the directory is the name's last part.
Then: cd <dir>, install, \`vlx library build\` in packages/<name>, \`vlx library check\`, and the playground's \`vlx dev\`.
`;

const COMMAND_HELP: Readonly<Record<string, string>> = {
  init: `${INIT_HELP}\n${INIT_LIBRARY_HELP}`,
  library: LIBRARY_HELP,
  generate: GENERATE_HELP,
  g: GENERATE_HELP,
  replay:
    "vlx replay <log> [--route changes,update,render] [--json] [--allow-user-data]\n\nPlay a session log (written by vlx dev --record, or one of MESH's conformance logs) against this project's templates by the three routes of the equivalence law, and find the first line where one differs from the log: a tree, an event's outcome, a program or manifest that is not the one recorded. It runs no command and reads no clock. Exits 0 when every route gave what the log recorded, 1 when one did not, 2 when the log cannot be read. A log that holds user data (every recording does: its header says containsUserData) is refused unless you pass --allow-user-data: a divergence prints what was typed and shown.\n",
  dev: "vlx dev [--web|--desktop] [--port N] [--host H] [--record [file]]\n\nServe the project (the web is served, a desktop project opens its window; a project of more than one target does both, or the one named) and rebuild it as files change. A mistake leaves the last good build serving and shows in the terminal and in the page. --record writes the web page's session as a log (default .valance/sessions/<time>.jsonl) for vlx replay: development only, never uploaded, and it holds what the person typed.\n",
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

/** `--record` alone, `--record file` or `--record=file`: the file, `""` for the default, nothing when it is not there. A word after it that is another flag is not its file. */
const recordOption = (args: ReadonlyArray<string>): string | undefined => {
  const joined = args.find((each) => each.startsWith("--record="));

  if (joined !== undefined) {
    return joined.slice("--record=".length);
  }

  const at = args.indexOf("--record");
  const next = at < 0 ? undefined : args[at + 1];

  return at < 0 ? undefined : next === undefined || next.startsWith("-") ? "" : next;
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

const runInitLibrary = async (args: ReadonlyArray<string>, cwd: string): Promise<number> => {
  const positional = args.filter((each, index) => !each.startsWith("-") && !["--pm", "--cli"].includes(args[index - 1] ?? ""));
  const name = positional[0];
  const manager = option(args, "--pm") as PackageManager | undefined;

  if (name === undefined || !/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) {
    console.error(`vlx init library: name the package: vlx init library acme-ui (lowercase letters, digits, - . _; or @scope/name)\n\n${INIT_LIBRARY_HELP}`);

    return 2;
  }

  if (manager !== undefined && !PACKAGE_MANAGERS.includes(manager)) {
    console.error(`vlx init library: --pm is one of ${PACKAGE_MANAGERS.join(", ")}`);

    return 2;
  }

  const dir = directoryFor(name.replace(/^@[^/]+\//, ""), cwd);
  const problem = directoryProblem(dir);

  if (problem !== undefined) {
    console.error(`vlx init library: ${problem}`);

    return 1;
  }

  const answers = { name, dir, packageManager: manager ?? detectPackageManager(), ...(option(args, "--cli") === undefined ? {} : { cli: option(args, "--cli")! }) };
  const files = scaffoldLibrary(answers);

  console.log(`vlx init library: created ${name} in ${dir} (${files.length} files)`);

  if (!args.includes("--no-install")) {
    const ran = await installDependencies(answers);

    console.log(
      ran.ok ? "vlx init library: installed" : `vlx init library: the dependencies were not installed (${answers.packageManager} install failed); run it yourself in ${dir}`,
    );
  }

  console.log(`vlx init library: next: cd ${dir}/packages/${name.replace(/^@[^/]+\//, "")} && vlx library build && vlx library check`);

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
    command === "replay" ||
    command === "build" ||
    command === "package" ||
    command === "check" ||
    command === "theme" ||
    command === "library" ||
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

        if (rest[0] === "library") {
          return await runInitLibrary(rest.slice(1), cwd);
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
        const asked = recordOption(rest);
        const record = asked === undefined ? undefined : asked === "" ? defaultRecording(findRoot(cwd)) : resolve(cwd, asked);

        if (draws) {
          const { drawDev } = await import("./ui/run.js");

          await drawDev(findRoot(cwd), {
            ...(record === undefined ? {} : { record }),
            ...(target === undefined ? {} : { target }),
            ...(port === undefined ? {} : { port: Number(port) }),
            ...(host === undefined ? {} : { host }),
          });

          return 0;
        }

        const running = await dev(findRoot(cwd), {
          ...(record === undefined ? {} : { record }),
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
      case "replay": {
        const file = rest.find((each, index) => !each.startsWith("-") && rest[index - 1] !== "--route");

        if (file === undefined) {
          console.error("vlx replay: name a log: vlx replay <log> [--route changes,update,render] [--json]");

          return 2;
        }

        const routes = option(rest, "--route");
        const replayed = await replayFile(findRoot(cwd), resolve(cwd, file), {
          ...(routes === undefined ? {} : { routes: routes.split(",") }),
          json: rest.includes("--json"),
          allowUserData: rest.includes("--allow-user-data"),
        });

        (replayed.code === 0 ? console.log : console.error)(replayed.output);

        return replayed.code;
      }
      case "build": {
        if (draws) {
          const { drawBuild } = await import("./ui/run.js");

          await drawBuild(findRoot(cwd), targetFlags(rest));

          return 0;
        }

        const started = Date.now();
        const flagged = targetFlags(rest);
        const built = await build(findRoot(cwd), { ...(flagged.length === 0 ? {} : { targets: flagged }), onReport: (report) => report.forEach((line) => console.log(line)) });

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
      case "library": {
        const sub = rest[0];

        if (sub !== "build" && sub !== "check") {
          console.error("vlx library: say what: vlx library build | vlx library check [--json] [--app <dir>]");

          return 2;
        }

        const dir = cwd;
        const json = rest.includes("--json");
        const given = option(rest, "--app");
        const report = (diagnostics: ReadonlyArray<{ readonly file: string; readonly line: number; readonly code: string; readonly message: string }>): number => {
          if (json) {
            console.log(JSON.stringify({ diagnostics }, null, 2));
          } else {
            diagnostics.forEach((each) => console.error(`${each.file}${each.line > 0 ? `:${each.line}` : ""} ${each.code}: ${each.message}`));
            console.log(diagnostics.length === 0 ? `vlx library ${sub}: no problems` : `vlx library ${sub}: ${diagnostics.length} problem${diagnostics.length === 1 ? "" : "s"}`);
          }

          return diagnostics.length === 0 ? 0 : 1;
        };

        if (sub === "build") {
          const built = buildLibrary(dir);

          if (!json && built.diagnostics.length === 0) {
            console.log(`vlx library build: dist/ written; ${built.copied.length} template and stylesheet file${built.copied.length === 1 ? "" : "s"} copied as source`);
          }

          return report(built.diagnostics);
        }

        return report(await checkLibrary(dir, given === undefined ? {} : { app: resolve(cwd, given) }));
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
