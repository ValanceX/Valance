// Stage 33 in Chromium: the same event-boundary failure semantics as test/async-event.test.ts, with real clicks (userEvent) in a real page.
// Only the sync typed failure, the defect, the caught failure and the follow-up event: enough to show jsdom and Chromium agree.
import type { HydrationResult } from "@valancex/port-web";

import { init } from "@valancex/mesh-runtime";
import wasmUrl from "@valancex/mesh-runtime/mesh-runtime.wasm?url";
import * as Nexus from "@valancex/nexus";
import * as Valance from "@valancex/valance";
import * as Web from "@valancex/valance/web";
import { userEvent } from "@vitest/browser/context";
import { Cause, Effect, Exit, Schema } from "effect";
import { beforeAll, describe, expect, inject, it } from "vitest";

import { primitives } from "../src/catalog/web.js";

const { catalog } = inject("page");

beforeAll(async () => { await init(wasmUrl); });

const ids = ["typed", "defect", "caught"] as const;
const State = Schema.Struct({ items: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })), value: Schema.String });
type State = Schema.Schema.Type<typeof State>;
const show = (exit: Exit.Exit<unknown, unknown>): string => Exit.isSuccess(exit) ? "succeeded" : Cause.isFailType(exit.cause) ? `failed ${JSON.stringify(exit.cause.error)}` : Cause.isDieType(exit.cause) ? `died: ${(exit.cause.defect as Error).message}` : "other";

describe("event-driven command failure, in Chromium", () => {
  it("typed failure and defect land in Mounted.dispatched; state and the page are untouched; a caught failure is ordinary state, visible; later clicks still work", async () => {
    const main = document.createElement("main");

    document.body.append(main);

    try {
      const initial: State = { items: ids.map((id) => ({ id, name: id })), value: "init" };
      const app = Valance.define({
        name: "event-failure",
        state: { schema: State, initial },
        views: { home: { program: catalog.home, scope: (state: State) => ({ title: "Events", count: state.items.length, summary: state.value, firstId: "", items: state.items.map(({ id, name }) => ({ id, name })) }) } },
        view: () => "home" as const,
        commands: (state: Nexus.State.StateHandle<State>) => ({
          "home/open": Nexus.Mesh.bind(Nexus.Command.define("t.open", Schema.Struct({ id: Schema.String }), ({ id }) => id === "typed" ? Effect.fail("typed-boom")
            : id === "defect" ? Effect.die(new Error("defect-boom"))
            : Effect.catchAll(Effect.fail("caught-boom") as Effect.Effect<void, string>, (error) => Effect.asVoid(state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, value: `error: ${error}` }))))),
          (args) => ({ id: (args[0] !== undefined && "value" in args[0] ? args[0].value : "") as string })),
          "home/reverse": Nexus.Mesh.bind(Nexus.Command.define("t.reverse", Schema.Struct({}), () => Effect.asVoid(state.update((current): Effect.Effect<State> => Effect.succeed({ ...current, items: [...current.items].reverse(), value: "reversed" })))), () => ({})),
        }) as unknown as Record<string, Nexus.Mesh.Binding<string, never>>,
      });
      const target: Valance.TargetFactory<Valance.HydratableTarget<HydrationResult>> = (report) => Web.target({ container: main, primitives })(report);

      await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
        const handle = (yield* Valance.start(app as never, { state: initial })) as Valance.ApplicationHandle<State, string>;
        const mounted = (yield* Valance.mount(handle as never, target)) as Valance.Mounted<string>;
        const text = () => main.querySelector("span")?.textContent ?? "";
        const row = (id: string) => main.querySelectorAll("div")[ids.indexOf(id as never)]!.querySelector("button")!;
        const click = (element: Element) => Effect.promise(() => userEvent.click(element));
        const poll = (check: () => boolean) => Effect.promise(async () => { await expect.poll(check).toBe(true); });

        yield* click(row("typed"));
        yield* poll(() => mounted.dispatched.length === 1);
        yield* click(row("defect"));
        yield* poll(() => mounted.dispatched.length === 2);
        expect(mounted.dispatched.map(show)).toEqual(['failed "typed-boom"', "died: defect-boom"]);
        expect(text()).toBe("3 items: init");                                  // nothing rendered, nothing committed
        expect((yield* handle.state).value).toBe("init");

        yield* click(row("caught"));
        yield* poll(() => text() === "3 items: error: caught-boom");           // failure as ordinary state, visible in the page
        expect(show(mounted.dispatched[2]!)).toBe("succeeded");

        yield* click([...main.querySelectorAll("button")].find((button) => button.textContent === "Reverse")!);
        yield* poll(() => text() === "3 items: reversed");                     // still usable after both failures
        expect(show(mounted.dispatched[3]!)).toBe("succeeded");
      })));
    } finally {
      main.remove();
    }
  });
});
