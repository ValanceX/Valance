// Stage 8: the deployed-page boundary of `Mounted.followed`, in real Chromium. A page-shaped host (the repository's `run`, public API only) mounts a real
// application into the real DOM; its Scope is tied to the page's `pagehide`, as src/page.ts ties it. The application then gets into the one condition that
// already exists (a commit whose render fails after the first draw, Stage 44), and the question is the operational chain:
//
//   mount becomes inert  →  does the host learn it  →  through what public observation  →  is the report actionable
//
// The operator's channel is the console (Effect's default logger writes console.log), observed here as the page-failure test observes it.
import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import { userEvent } from "@vitest/browser/context";
import { Effect, Fiber, Schema } from "effect";
import { beforeAll, expect, inject, it } from "vitest";

import { run } from "../src/api/shape-b.js";
import { primitives } from "../src/catalog/web.js";

const { catalog } = inject("page");

beforeAll(async () => { await init(wasmUrl); });

const State = Schema.Struct({ bad: Schema.Boolean });
type State = Schema.Schema.Type<typeof State>;

it("a mount that stops following is reported once, with its reason and the event outcomes; the UI is inert, the application keeps running, the page is alive, and pagehide still closes it", async () => {
  const commands: Array<string> = [];
  const app = Valance.define({
    name: "host-report",
    state: { schema: State, initial: { bad: false } },
    views: { only: { program: catalog.notfound, scope: (state: State) => ({ title: state.bad ? (42 as never) : "ok" }) } },   // the render after the second click violates the manifest
    view: () => "only" as const,
    commands: (state: Nexus.State.StateHandle<State>) => ({
      "notfound/back": Nexus.Mesh.bind(Nexus.Command.define("t.back", Schema.Struct({}), () => {
        commands.push("run");

        return commands.length === 1 ? Effect.fail("nope") as Effect.Effect<void, string> : Effect.asVoid(state.update((): Effect.Effect<State> => Effect.succeed({ bad: true })));
      }), () => ({})),
    }) as unknown as Record<string, Nexus.Mesh.Binding<never, never>>,
  });
  const container = document.createElement("main");
  const logs: Array<string> = [];
  const original = console.log;

  document.body.append(container);
  console.log = (...args: Array<unknown>) => { logs.push(args.map(String).join(" ")); original.apply(console, args); };

  // The page's lifecycle, as src/page.ts has it: one Scope, ended by `pagehide` (not persisted).
  const page = Effect.runFork(Effect.scoped(Effect.zipRight(run(app, { container, primitives }), Effect.never)));
  const onPageHide = (event: Event): void => { if (!(event as PageTransitionEvent).persisted) { void Effect.runPromise(Fiber.interrupt(page)); } };

  addEventListener("pagehide", onPageHide);

  try {
    const button = () => container.querySelector("button")!;
    const label = () => container.querySelector("section")?.getAttribute("aria-label");

    await expect.poll(label).toBe("ok");

    await userEvent.click(button());                                          // 1: the command fails (typed), on a healthy page
    await expect.poll(() => commands.length).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(logs).toEqual([]);                                                 // a healthy mount reports nothing, even about a failed event command

    await userEvent.click(button());                                          // 2: succeeds; its commit cannot be rendered
    await expect.poll(() => logs.length).toBeGreaterThanOrEqual(3);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const reported = [...logs];

    expect(reported).toHaveLength(3);                                         // one report per fact
    const stopped = reported.find((line) => line.includes("the page stopped following the application"))!;

    expect(stopped).toMatch(/level=ERROR/);
    expect(stopped).toContain("MeshDiagnostics");                             // the reason, from `followed`'s Failure
    expect(stopped).toContain("runtime-");                                    // MESH's diagnostic code
    expect(stopped).toContain("title");                                       // and what it was about
    expect(reported.some((line) => line.includes("event commands in this mount: 1 succeeded, 1 failed, 0 interrupted"))).toBe(true);
    expect(reported.some((line) => line.includes("event command failed") && line.includes("nope"))).toBe(true);

    // After: the UI is inert (still the last good render) but the application is alive and accepts events; the page is alive; nothing more is reported.
    expect(label()).toBe("ok");
    await userEvent.click(button());                                          // 3: an event on the inert target still reaches the application
    await expect.poll(() => commands.length).toBe(3);
    expect(label()).toBe("ok");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(logs).toEqual(reported);                                           // the host reported once; later events add nothing

    dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));          // the page goes away: the same Scope closes, the target is released
    await expect.poll(() => container.innerHTML).toBe("");
    expect(logs).toEqual(reported);                                           // closing after the report is silent
  } finally {
    removeEventListener("pagehide", onPageHide);
    console.log = original;
    container.remove();
  }
});
