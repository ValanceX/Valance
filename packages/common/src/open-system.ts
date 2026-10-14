// The desktop's opener: the system's own, given the address as an argument (never through a shell, so the address is data and nothing else). Node only.
import { Effect } from "effect";
import { spawn as nodeSpawn } from "node:child_process";

import { OpenError, refusal } from "./open.js";
import type { OpenClient } from "./open.js";

/** The program and arguments that open `address` on `platform`. */
export const openerFor = (address: string, platform: NodeJS.Platform = process.platform): { readonly program: string; readonly args: ReadonlyArray<string> } =>
  platform === "win32"
    ? { program: "rundll32", args: ["url.dll,FileProtocolHandler", address] }
    : platform === "darwin"
      ? { program: "open", args: [address] }
      : { program: "xdg-open", args: [address] };

type Spawn = (program: string, args: ReadonlyArray<string>) => { readonly on: (event: "error", listener: (error: Error) => void) => unknown; readonly unref: () => void };

export const systemOpen = (
  spawn: Spawn = (program, args) => nodeSpawn(program, [...args], { detached: true, stdio: "ignore" }),
  platform: NodeJS.Platform = process.platform,
): OpenClient => ({
  open: (address) => {
    const reason = refusal(address);

    if (reason !== undefined) {
      return Effect.fail(new OpenError("Refused", reason));
    }

    const { program, args } = openerFor(address, platform);

    return Effect.async<void, OpenError>((resume) => {
      try {
        const child = spawn(program, args);

        child.on("error", () => resume(Effect.fail(new OpenError("Unavailable", `${program} could not be started`))));
        child.unref();
        // handed over: the opener is the system's, and does not report back to a program that asked
        setTimeout(() => resume(Effect.void), 0);
      } catch {
        resume(Effect.fail(new OpenError("Unavailable", `${program} could not be started`)));
      }
    });
  },
});
