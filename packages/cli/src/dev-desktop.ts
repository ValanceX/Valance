// `vlx dev` for a desktop project: build the engine, open the Desktop PORT's window on it, and when a file changes build again and open the window anew. The window is a separate program
// (`vlx-window`, from the PORT's crate: `cargo install --git https://github.com/ValanceX/Port valancex-port-desktop --bin vlx-window`), found on the PATH or at `VLX_WINDOW`.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { join } from "node:path";

import { build } from "./build.js";
import type { Dev, DevOptions } from "./dev.js";
import { AppError, format } from "./diagnostics.js";

/** How long files must be quiet before a change is built (ms). */
const QUIET = 150;

/** Whether a changed file (relative to the project) is one the application is made of. */
export const mattersToTheEngine = (file: string): boolean => {
  const name = file.split("\\").join("/");

  return /^(content|src|public)\//.test(name) || /^valance(\.\w+)?\.json$/.test(name);
};

export interface DesktopDev extends Dev {
  /** Resolves when the window is closed by the person (not by a rebuild). */
  readonly closed: Promise<void>;
}

export const devDesktop = async (root: string, options: DevOptions = {}): Promise<DesktopDev> => {
  const log = options.log ?? ((line: string) => void console.log(line));
  const program = process.env["VLX_WINDOW"] ?? "vlx-window";
  let window: ChildProcess | undefined;
  let stopping = false;
  let working: Promise<void> = Promise.resolve();
  let timer: NodeJS.Timeout | undefined;
  let leave: () => void = () => undefined;
  const closed = new Promise<void>((resolve) => {
    leave = resolve;
  });

  const stopWindow = async (): Promise<void> => {
    const running = window;

    window = undefined;

    if (running !== undefined && running.exitCode === null) {
      const exited = new Promise<void>((resolve) => running.once("exit", () => resolve()));

      running.kill();
      await exited;
    }
  };

  const openWindow = (engine: string): void => {
    const child = spawn(program, [], { stdio: "inherit", env: { ...process.env, VLX_ENGINE: `${process.execPath} ${engine}` } });

    window = child;
    child.once("error", (error: NodeJS.ErrnoException) => {
      window = undefined;
      log(
        error.code === "ENOENT"
          ? `vlx: no window program "${program}": install it with \`cargo install --git https://github.com/ValanceX/Port valancex-port-desktop --bin vlx-window\`, or name it in VLX_WINDOW`
          : `vlx: the window could not start: ${error.message}`,
      );
    });
    child.once("exit", () => {
      if (window === child && !stopping) {
        window = undefined;
        log("vlx: the window was closed");
        leave();
      }
    });
  };

  const rebuild = async (): Promise<void> => {
    try {
      const built = await build(root);

      options.onStatus?.([]);
      await stopWindow();

      if (!stopping) {
        openWindow(join(built.dir, "engine.mjs"));
        log("vlx: built; the window is open");
      }
    } catch (error) {
      if (error instanceof AppError) {
        options.onStatus?.(error.diagnostics);
        error.diagnostics.forEach((each) => log(format(each)));
      } else {
        log(`vlx: the build failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const queue = (): void => {
    working = working.then(rebuild);
  };

  const watcher = watch(root, { recursive: true }, (_event, file) => {
    if (file !== null && mattersToTheEngine(file)) {
      clearTimeout(timer);
      timer = setTimeout(queue, QUIET);
    }
  });

  queue();
  await working;

  return {
    url: "window",
    closed,
    settled: async () => {
      await working;
    },
    close: async () => {
      stopping = true;
      clearTimeout(timer);
      watcher.close();
      await working;
      await stopWindow();
      leave();
    },
  };
};
