// Units on the Desktop's engine path, in a real window: the engine built by `vlx build` for a desktop project is the one a `vlx-window` runs, under a virtual display, with real key presses
// (xdotool) reaching the window's own controls. What is looked at is what the window and the engine say to each other: the engine's screens (draw and update) as the window got them, and the events
// the window sent back. The acceptance of the units (WP5) is the same as in a browser: a disclosure's open state follows its row when the list is re-sorted, and is not the application's.
//
// It needs the window program of the Desktop PORT (`VLX_WINDOW_BIN`: the path of a built `vlx-window`), a virtual display (`xvfb-run`) and `xdotool`; without them it is skipped, and says so by its name.
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as MeshRuntime from "@valancex/mesh-runtime";
import { afterEach, describe, expect, it } from "vitest";

import { build } from "../src/build.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const window = process.env["VLX_WINDOW_BIN"];
const has = (program: string): boolean => {
  try {
    execFileSync("which", [program], { stdio: "ignore" });

    return true;
  } catch {
    return false;
  }
};
const available = window !== undefined && process.platform === "linux" && has("xvfb-run") && has("xdotool");
const supported = typeof (MeshRuntime as { readonly raise?: unknown }).raise === "function";

const MAIN = `import { component, defineApp, field, unit } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
import disclosure from "./disclosure.mprx";

const Item = Schema.Struct({ id: Schema.String, name: Schema.String });

export default defineApp({
  state: { items: field(Schema.Array(Item), [{ id: "a", name: "Ann" }, { id: "b", name: "Bo" }]) },
  commands: (command) => ({ reverse: command((state) => ({ ...state, items: [...state.items].reverse() })) }),
  layout: component(layout),
  components: [component(disclosure, { props: { label: Schema.String }, events: {}, unit: unit({ state: { open: field(Schema.Boolean, false) }, commands: { toggle: (state) => ({ open: !state.open }) } }) })],
});
`;
const FILES: Record<string, string> = {
  "content/index.md": PAGE("Home", "Text."),
  "valance.desktop.json": "{}",
  "src/main.ts": MAIN,
  "src/layout.mprx": "<column>{#each items as item (item.id)}<disclosure label={item.name} />{/each}<button on.click={reverse()}>Reverse</button></column>",
  "src/disclosure.mprx": "<column><button on.click={toggle()}>{label}</button>{#if open}<text>open {label}</text>{/if}</column>",
};

const DIALOG_MAIN = `import { component, defineApp, field } from "@valancex/common";
import { Schema } from "effect";
import layout from "./layout.mprx";
export default defineApp({
  state: { confirming: field(Schema.Boolean, false), other: field(Schema.Boolean, false) },
  commands: (command) => ({
    ask: command((state) => ({ ...state, confirming: true })),
    cancel: command((state) => ({ ...state, confirming: false })),
    mark: command((state) => ({ ...state, other: true })),
  }),
  layout: component(layout),
});
`;
const DIALOG_FILES: Record<string, string> = {
  "content/index.md": PAGE("Home", "Text."),
  "valance.desktop.json": "{}",
  "src/main.ts": DIALOG_MAIN,
  "src/layout.mprx":
    '<column><button on.click={ask()}>Delete</button><button on.click={mark()}>Other</button>{#if other}<text>other pressed</text>{/if}<dialog open={confirming} label="Delete this order?" on.dismiss={cancel()}><text>This cannot be undone.</text><button on.click={cancel()}>Keep it</button></dialog></column>',
};

/** What a test of a window can use: the keys it presses, what the engine said, and waiting for it. */
interface Window {
  readonly key: (...keys: ReadonlyArray<string>) => void;
  readonly outgoing: () => ReadonlyArray<{ readonly op: string; readonly tree?: unknown; readonly handler?: string }>;
  readonly texts: (tree: unknown) => string;
  readonly until: (done: () => boolean, what: string) => Promise<void>;
  readonly updates: () => number;
  readonly lastTree: () => string;
}

/** Builds the project, runs its engine under a window on a virtual display, and gives `run` the window after its first screen has been drawn. */
const inWindow = async (files: Record<string, string>, run: (window: Window) => Promise<void>): Promise<void> => {
  const root = project(files);
  const built = await build(root);
  const directory = mkdtempSync(join(tmpdir(), "vlx-real-window-"));
  const traffic = join(directory, "traffic.log");
  const tee = join(directory, "tee.mjs");

  // The engine, with what it says and what it is told written down as it goes.
  writeFileSync(
    tee,
    `import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
const engine = spawn(process.execPath, [${JSON.stringify(join(built.dir, "desktop", "engine.mjs"))}], { stdio: ["pipe", "pipe", "inherit"] });
createInterface({ input: engine.stdout }).on("line", (line) => { appendFileSync(${JSON.stringify(traffic)}, "OUT " + line + "\\n"); process.stdout.write(line + "\\n"); });
createInterface({ input: process.stdin }).on("line", (line) => { appendFileSync(${JSON.stringify(traffic)}, "IN " + line + "\\n"); engine.stdin.write(line + "\\n"); });
engine.on("exit", (code) => process.exit(code ?? 0));
`,
  );

  const lines = (): ReadonlyArray<string> => {
    try {
      return readFileSync(traffic, "utf8").trim().split("\n");
    } catch {
      return [];
    }
  };
  const outgoing = (): ReadonlyArray<{ readonly op: string; readonly tree?: unknown; readonly handler?: string }> =>
    lines()
      .filter((line) => line.startsWith("OUT "))
      .map((line) => JSON.parse(line.slice(4)));
  const texts = (tree: unknown): string =>
    JSON.stringify(tree)
      .match(/"text":"[^"]*"/g)
      ?.join(" ") ?? "";
  const until = async (done: () => boolean, what: string): Promise<void> => {
    for (let tries = 0; !done(); tries += 1) {
      if (tries > 600) {
        throw new Error(`timed out waiting for ${what}; the traffic was ${lines().join(" | ").slice(0, 800)}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  const display = 200 + (process.pid % 700);
  const session = spawn("xvfb-run", ["-n", String(display), "-s", "-screen 0 1024x768x24 -ac", "sh", "-c", `${window} & W=$!; trap "kill $W" TERM; sleep 40; kill $W`], {
    env: { ...process.env, VLX_ENGINE: `${process.execPath} ${tee}` },
    stdio: "ignore",
    detached: true,
  });
  const xdotool = (...args: ReadonlyArray<string>): string => execFileSync("xdotool", [...args], { env: { ...process.env, DISPLAY: `:${display}` }, stdio: "pipe" }).toString();
  // No window manager gives the window focus here, so it is given: the window is looked for by its class, and focused, before the keys are pressed.
  const key = (...keys: ReadonlyArray<string>): void => {
    let found: string | undefined;

    // the window opens when the engine's first screen has reached it: on a slow machine (a debug build under software rendering) that is a while
    for (let tries = 0; found === undefined && tries < 150; tries += 1) {
      try {
        [found] = xdotool("search", "--onlyvisible", "--class", "vlx-window").trim().split("\n");
      } catch {
        execFileSync("sleep", ["0.2"]);
      }
    }

    if (found === undefined) {
      throw new Error("the window did not appear on the virtual display");
    }

    xdotool("windowfocus", found);
    xdotool("mousemove", "200", "100", "key", "--delay", "150", ...keys);
  };

  try {
    await until(() => outgoing().some((message) => message.op === "draw"), "the first screen");
    // the window has been given the screen; let it open and draw it
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const updates = (): number => outgoing().filter((message) => message.op === "update").length;

    await run({
      key,
      outgoing,
      texts,
      until,
      updates,
      lastTree: () =>
        JSON.stringify(
          outgoing()
            .filter((message) => message.op === "update")
            .at(-1)?.tree ?? null,
        ),
    });
  } finally {
    // the whole group: the wrapper, the display server and the window
    try {
      process.kill(-session.pid!, "SIGTERM");
    } catch {
      // already gone
    }
  }
};

describe.skipIf(!available || !supported)("units in a real window (needs VLX_WINDOW_BIN, xvfb-run, xdotool and MESH 0.15)", () => {
  it("a disclosure toggled with the keyboard in the window opens, and stays open on its row when the list is re-sorted; the application's state never had it", async () => {
    await inWindow(FILES, async ({ key, outgoing, texts, until, updates }) => {
      // Tab to the first disclosure's button, and press it with Space.
      key("Tab", "space");
      await until(() => updates() >= 1, "the update that opens the first disclosure");
      expect(
        texts(
          outgoing()
            .filter((message) => message.op === "update")
            .at(-1)!.tree,
        ),
      ).toContain("open Ann");

      // Tab on to the Reverse button (past the second disclosure's), and press it.
      key("Tab", "Tab", "space");
      await until(() => updates() >= 2, "the update that re-sorts the list");

      const after = texts(
        outgoing()
          .filter((message) => message.op === "update")
          .at(-1)!.tree,
      );

      // Bo is first now, and Ann, who is second, is still open: the open state went with the row.
      expect(after.indexOf("Bo")).toBeLessThan(after.indexOf("Ann"));
      expect(after).toContain("open Ann");
      expect(after).not.toContain("open Bo");
    });
  }, 240_000);

  it("a dialog opened with the keyboard keeps Tab inside it, is dismissed by Escape as the application decides, and gives focus back to the button that opened it (needs PORT 0.12)", async () => {
    await inWindow(DIALOG_FILES, async ({ key, until, updates, lastTree }) => {
      // Tab to "Delete" and press it: the application opens the dialog
      key("Tab", "space");
      await until(() => updates() >= 1, "the update that opens the dialog");
      expect(lastTree()).toContain('"open":true');

      // Tab five times: the dialog has one button, and Tab wraps inside it (a Tab that left would reach "Other"); Space presses the button, which closes the dialog
      key("Tab", "Tab", "Tab", "Tab", "Tab", "space");
      await until(() => updates() >= 2, "the update that closes the dialog");
      expect(lastTree()).toContain('"open":false');
      expect(lastTree()).not.toContain("other pressed");

      // focus is back on "Delete": Space opens the dialog again; Escape is a dismissal and the application closes it
      key("space");
      await until(() => updates() >= 3, "the update that opens the dialog again");
      expect(lastTree()).toContain('"open":true');
      key("Escape");
      await until(() => updates() >= 4, "the update that Escape asks for");
      expect(lastTree()).toContain('"open":false');
      key("space");
      await until(() => updates() >= 5, "the update that opens it again, from the button focus came back to");
      expect(lastTree()).toContain('"open":true');
    });
  }, 240_000);
});
