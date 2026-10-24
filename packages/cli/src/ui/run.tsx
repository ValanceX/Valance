// Putting the views on the terminal. Ink and React are loaded only here, and only when a command is going to draw: a command that prints plain text never pays for them.
import type { TargetId } from "../targets.js";
import { render } from "ink";
import type { ReactElement } from "react";

import type { InitArgs } from "../args.js";
import type { BuildOptions } from "../build.js";
import { build as runBuild } from "../build.js";
import type { Checked } from "../check.js";
import { check as runCheck } from "../check.js";
import type { Diagnostic } from "../diagnostics.js";
import { dev as runDev } from "../dev.js";
import type { PackageManager } from "../init.js";
import type { Result } from "./init.js";
import { Wizard } from "./init.js";
import type { DevState } from "./report.js";
import { BuildProgress, BuildResult, CheckResult, DevScreen, Diagnostics, Working } from "./report.js";
import type { Built } from "../build.js";

const show = (element: ReactElement) => render(element, { exitOnCtrlC: true });

/** Draws `element` once and leaves it on the screen. */
const leave = async (element: ReactElement): Promise<void> => {
  const shown = show(element);

  shown.unmount();
  await shown.waitUntilExit();
};

export const drawInit = async (args: InitArgs, cwd: string, detected: PackageManager, version: string): Promise<Result> => {
  let result: Result = { status: "cancelled" };
  const shown = render(
    <Wizard
      args={args}
      cwd={cwd}
      detected={detected}
      version={version}
      onFinish={(done) => {
        result = done;
      }}
    />,
    { exitOnCtrlC: true },
  );

  await shown.waitUntilExit();

  return result;
};

export const drawCheck = async (root: string): Promise<Checked> => {
  const shown = show(<Working label="Checking your project" />);

  try {
    const result = await runCheck(root);

    shown.rerender(<CheckResult result={result} />);

    return result;
  } finally {
    shown.unmount();
    await shown.waitUntilExit();
  }
};

export const drawBuild = async (root: string, targets: ReadonlyArray<TargetId> = []): Promise<Built> => {
  const started = Date.now();
  const shown = show(<BuildProgress current="configuration" />);

  try {
    const built = await runBuild(root, {
      ...(targets.length === 0 ? {} : { targets }),
      onStage: ((stage) => shown.rerender(<BuildProgress current={stage} />)) satisfies BuildOptions["onStage"],
    });

    shown.rerender(<BuildResult built={built} seconds={(Date.now() - started) / 1000} />);

    return built;
  } finally {
    shown.unmount();
    await shown.waitUntilExit();
  }
};

/** Mistakes that stopped a command, drawn the way `check` draws them. */
export const drawDiagnostics = (diagnostics: ReadonlyArray<Diagnostic>): Promise<void> => leave(<Diagnostics diagnostics={diagnostics} />);

export const drawDev = async (root: string, options: { readonly target?: TargetId; readonly port?: number; readonly host?: string; readonly record?: string }): Promise<void> => {
  let state: DevState = { open: [], lines: [], starting: true };
  const shown = show(<DevScreen state={state} />);
  const update = (patch: Partial<DevState>): void => {
    state = { ...state, ...patch };
    shown.rerender(<DevScreen state={state} />);
  };
  const running = await runDev(root, {
    ...options,
    log: (line) => {
      update({ lines: [...state.lines, line].slice(-6) });
    },
    onStatus: (open) => {
      update({ open });
    },
  });

  update({ url: running.url, starting: false });

  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve);
    process.once("SIGTERM", resolve);
  });
  await running.close();
  shown.unmount();
  await shown.waitUntilExit();
};
