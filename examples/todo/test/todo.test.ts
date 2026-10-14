// The to-do application, used the way a person would, through a target with no DOM: the lists, one list, editing, the guards. Every step goes through the real compiler, the real MESH runtime,
// NEXUS commands and the router.
import * as Valance from "@valancex/valance";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { application, initial, sample, starting } from "../src/app.js";
import type { TodoState } from "../src/routes.js";
import { compilePrograms } from "../src/compile.js";
import { textTarget } from "../src/text-target.js";
import type { TextTarget } from "../src/text-target.js";

const wait = async (done: () => boolean, limit = 400): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > limit) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const programs = await compilePrograms();

/** Runs the application on the text target and hands a person-like driver to `use`. */
const session = async <A>(start: TodoState, use: (ui: Driver) => Promise<A>): Promise<A> => {
  let target!: TextTarget;

  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* Valance.start(application(programs, start));
        const factory = textTarget();

        yield* Valance.mount(handle, (report) => (target = factory(report)));

        const driver: Driver = {
          screen: () => target.screen(),
          state: () => Effect.runPromise(handle.state),
          drawn: () => target.drawn(),
          // Each action waits for the screen to change, or for a short while if nothing visible should.
          act: async (action) => {
            const before = target.screen();

            action(target);
            await wait(() => target.screen() !== before, 40).catch(() => undefined);
            await new Promise((resolve) => setTimeout(resolve, 10));
          },
        };

        return yield* Effect.promise(() => use(driver));
      }),
    ),
  );
};

interface Driver {
  readonly screen: () => string;
  readonly state: () => Promise<TodoState>;
  readonly drawn: () => { readonly draws: number; readonly updates: number };
  readonly act: (action: (target: TextTarget) => void) => Promise<void>;
}

describe("the lists", () => {
  it("starts empty, and makes a list from what is typed", async () => {
    await session(initial(), async (ui) => {
      expect(ui.screen()).toContain("No lists yet");

      await ui.act((t) => t.type("New list", "  Groceries  "));
      await ui.act((t) => t.press("Add list"));
      expect(ui.screen()).toContain("[ Groceries (0 of 0 open) ]");
      expect(ui.screen()).not.toContain("No lists yet");
      expect((await ui.state()).entry).toBe("");
    });
  });

  it("ignores an empty name", async () => {
    await session(initial(), async (ui) => {
      await ui.act((t) => t.type("New list", "   "));
      await ui.act((t) => t.press("Add list"));
      expect((await ui.state()).lists).toEqual([]);
    });
  });
});

describe("one list", () => {
  it("opens, shows its items, and ticks one off", async () => {
    await session(sample(), async (ui) => {
      expect(ui.screen()).toContain("Groceries (1 of 2 open)");
      await ui.act((t) => t.press("Groceries"));
      expect(ui.screen()).toContain("# Groceries");
      expect(ui.screen()).toContain("1 of 2 open");
      expect((await ui.state()).route).toMatchObject({ name: "list", params: { id: "l1" } });

      await ui.act((t) => t.toggle("Milk"));
      expect(ui.screen()).toContain("0 of 2 open");
    });
  });

  it("adds items, clears the done ones, and deletes one", async () => {
    await session(sample("/lists/l1"), async (ui) => {
      await ui.act((t) => t.type("New item", "Eggs"));
      await ui.act((t) => t.press("Add item"));
      expect((await ui.state()).lists[0]!.items.map((item) => item.title)).toEqual(["Milk", "Bread", "Eggs"]);

      await ui.act((t) => t.press("Clear done"));
      expect((await ui.state()).lists[0]!.items.map((item) => item.title)).toEqual(["Milk", "Eggs"]);
      expect(ui.screen()).toContain("[ Clear done ] (disabled)");

      await ui.act((t) => t.press("Delete", 0));
      expect((await ui.state()).lists[0]!.items.map((item) => item.title)).toEqual(["Eggs"]);
    });
  });

  it("shows a hint for an empty list, and deleting a list returns to the lists", async () => {
    await session(sample("/lists/l2"), async (ui) => {
      expect(ui.screen()).toContain("Nothing to do");
      await ui.act((t) => t.press("Delete list"));
      expect((await ui.state()).route.name).toBe("lists");
      expect((await ui.state()).lists.map((list) => list.id)).toEqual(["l1"]);
    });
  });
});

describe("editing, and the guards", () => {
  it("edits an item, and saving returns to its list", async () => {
    await session(sample("/lists/l1/items/i1"), async (ui) => {
      expect(ui.screen()).toContain("<Milk>");
      await ui.act((t) => t.type("What needs doing?", "Oat milk"));
      expect(ui.screen()).toContain("Unsaved changes");

      await ui.act((t) => t.press("Save"));
      const state = await ui.state();

      expect(state.route.name).toBe("list");
      expect(state.draft).toBeNull();
      expect(state.lists[0]!.items[0]!.title).toBe("Oat milk");
      expect(ui.screen()).toContain("Oat milk");
    });
  });

  it("will not leave an edit with unsaved text until it is discarded", async () => {
    await session(sample("/lists/l1/items/i1"), async (ui) => {
      await ui.act((t) => t.type("What needs doing?", "Oat milk"));
      await ui.act((t) => t.press("Back to list"));
      expect((await ui.state()).route.name).toBe("item"); // the guard said no
      expect(ui.screen()).toContain("Unsaved changes");

      await ui.act((t) => t.press("Discard"));
      expect(ui.screen()).not.toContain("Unsaved changes");
      expect(ui.screen()).toContain("<Milk>");

      await ui.act((t) => t.press("Back to list"));
      expect((await ui.state()).route.name).toBe("list");
    });
  });

  it("typing the saved text back is not an edit", async () => {
    await session(sample("/lists/l1/items/i1"), async (ui) => {
      await ui.act((t) => t.type("What needs doing?", "Oat milk"));
      await ui.act((t) => t.type("What needs doing?", "Milk"));
      expect((await ui.state()).draft).toBeNull();
      await ui.act((t) => t.press("Back to list"));
      expect((await ui.state()).route.name).toBe("list");
    });
  });

  it("renames a list", async () => {
    await session(sample("/lists/l1"), async (ui) => {
      await ui.act((t) => t.press("Rename"));
      expect((await ui.state()).route.name).toBe("listEdit");
      await ui.act((t) => t.type("List name", "Food"));
      await ui.act((t) => t.press("Save"));
      expect((await ui.state()).lists[0]!.name).toBe("Food");
      expect(ui.screen()).toContain("# Food");
    });
  });

  it("sends an address for a list or item that does not exist to the lists, and an unknown address to not found", async () => {
    await session(await starting(sample(), "/lists/nope"), async (ui) => {
      expect((await ui.state()).route.name).toBe("lists");
      expect(ui.screen()).toContain("Your lists");
    });
    await session(await starting(sample(), "/lists/l1/items/nope"), async (ui) => {
      expect((await ui.state()).route.name).toBe("lists");
    });
    await session(await starting(sample(), "/lists/l1/items/i2"), async (ui) => {
      expect((await ui.state()).route).toMatchObject({ name: "item", params: { id: "l1", itemId: "i2" } });
    });
    await session(sample("/elsewhere"), async (ui) => {
      expect(ui.screen()).toContain("There is nothing here");
      await ui.act((t) => t.press("Back to lists"));
      expect((await ui.state()).route.name).toBe("lists");
    });
  });

  it("draws a new screen for a different route and updates the same one for a change within it", async () => {
    await session(sample(), async (ui) => {
      const first = ui.drawn();

      await ui.act((t) => t.press("Groceries"));
      await ui.act((t) => t.toggle("Milk"));

      const after = ui.drawn();

      expect(after.draws - first.draws).toBe(1);
      expect(after.updates - first.updates).toBeGreaterThanOrEqual(1);
    });
  });
});
