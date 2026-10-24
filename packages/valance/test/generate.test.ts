// Generated UI (Bet 13; decisions G1 to G14): the profile says what a model may use, a generation checks what arrives and says what to draw, the guard stands in front of the commands, and the record replays.
// Each property is shown failing against a deliberate wrong value (a planted mistake, a tampered line), so a check that stopped checking would be found.
import { check } from "@valancex/mesh-compiler";
import { describe, expect, it } from "vitest";

import { LIMITS, ROUNDS, commandGuard, feedbackOf, generation, previewProgram, profile, promptOf, replayGeneration } from "../src/generate.js";
import type { GenerationLine } from "../src/generate.js";

const manifest = {
  version: 1,
  types: {},
  components: {
    page: {
      props: {},
      events: {},
      commands: {
        refresh: { parameters: [], effect: "read", title: "Refresh the list" },
        add: { parameters: [{ name: "label", type: { kind: "string" } }], effect: "write", title: "Add an item" },
        remove: { parameters: [{ name: "id", type: { kind: "number" } }], effect: "destructive", title: "Delete an item" },
        mystery: { parameters: [] },
        untitled: { parameters: [], effect: "read" },
      },
      scope: { title: { kind: "string" }, count: { kind: "number" } },
    },
    text: { props: {}, events: {}, commands: {}, scope: {} },
    stack: { props: {}, events: {}, commands: {}, scope: {} },
    button: { props: { variant: { type: { kind: "enum", values: ["primary", "quiet"] }, required: false } }, events: { click: {} }, commands: {}, scope: {} },
    secret: { props: {}, events: {}, commands: {}, scope: {} },
  },
};

const PAGE = `<stack>\n<text>{title}</text>\n<button variant="primary" on.click={add(title)}>Add {count}</button>\n<button on.click={refresh()}>Again</button>\n</stack>\n`;
const chunks = (text: string, size: number): string[] => Array.from({ length: Math.ceil(text.length / size) }, (_, index) => text.slice(index * size, (index + 1) * size));

describe("the profile", () => {
  it("offers every component but the page, and the commands that carry an effect and a title, keeping a destructive one back unless it is named", async () => {
    const given = await profile(manifest);

    expect(given.components).toEqual(["text", "stack", "button", "secret"]);
    expect(given.commands.map((each) => each.name)).toEqual(["refresh", "add"]);
    expect(given.omitted).toEqual([
      { what: "command", name: "remove", reason: "destructive-not-named" },
      { what: "command", name: "mystery", reason: "no-effect" },
      { what: "command", name: "untitled", reason: "no-title" },
    ]);
  });

  it("is narrowed by naming (Tier 2), and a destructive command that is named is offered", async () => {
    const given = await profile(manifest, { components: ["text"], commands: ["remove"] });

    expect(given.components).toEqual(["text"]);
    expect(given.commands).toEqual([{ name: "remove", effect: "destructive", title: "Delete an item", parameters: [{ name: "id", type: "number" }] }]);
    expect(given.omitted.filter((each) => each.what === "component").map((each) => each.name)).toEqual(["stack", "button", "secret"]);
  });

  it("refuses a name the manifest does not have, and a page that is not there", async () => {
    await expect(profile(manifest, { components: ["nope"] })).rejects.toThrow(/nope/);
    await expect(profile(manifest, { commands: ["nope"] })).rejects.toThrow(/nope/);
    await expect(profile(manifest, { page: "missing" })).rejects.toThrow(/missing/);
  });

  it("has a hash that names it: the same subset the same hash, another subset another", async () => {
    expect((await profile(manifest)).hash).toBe((await profile(manifest)).hash);
    expect((await profile(manifest, { components: ["text"] })).hash).not.toBe((await profile(manifest)).hash);
  });

  it("is checked against: a component the profile leaves out is an error of the model's, and a command it does not offer is too", async () => {
    const given = await profile(manifest, { components: ["text"] });
    const run = await generation(given);

    await run.push("<secret />");

    const outcome = await run.finish();

    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.map((each) => each.code)).toContain("unknown-component");
  });
});

describe("the prompt", () => {
  it("is written from the data: titles, effects and typed arguments, nothing that was left out, and the same text every time", async () => {
    const given = await profile(manifest);
    const prompt = promptOf(given);

    expect(prompt).toBe(promptOf(given));
    expect(prompt).toContain("add(label: string): Add an item [write]");
    expect(prompt).toContain("refresh(): Refresh the list [read]");
    expect(prompt).toContain('variant?: "primary" | "quiet"');
    expect(prompt).toContain("title: string");
    expect(prompt).not.toContain("remove");
    expect(prompt).not.toContain("mystery");
  });
});

describe("a generation", () => {
  it("draws only what was checked: every preview of every prefix passes the program check, and the last is the whole page", async () => {
    const given = await profile(manifest);
    const run = await generation(given);
    let drawn = 0;
    let last = "";

    for (const chunk of chunks(PAGE, 1)) {
      const update = await run.push(chunk);

      if (update.preview !== undefined) {
        await previewProgram(given, update.preview);
        drawn += 1;
        last = update.preview.text;
      }
    }

    expect(drawn).toBeGreaterThan(20);
    expect(last).toBe(PAGE);
    expect((await run.finish()).ok).toBe(true);
  });

  it("numbers its previews, so a draw that finishes late is dropped", async () => {
    const run = await generation(await profile(manifest));
    const seen: number[] = [];

    for (const chunk of chunks(PAGE, 7)) {
      const update = await run.push(chunk);

      if (update.preview !== undefined) {
        seen.push(update.preview.n);
      }
    }

    expect(seen).toEqual(seen.map((_, index) => index + 1));
  });

  it("hears a planted mistake within 20 bytes of its start, once, and draws nothing after it (and the control: the same page without it draws)", async () => {
    const given = await profile(manifest);
    const wrong = `<stack>\n<text>{title}</text>\n<button variant="loud">Add</button>\n<text>{count}</text>\n</stack>\n`;
    const start = Buffer.byteLength(wrong.slice(0, wrong.indexOf("variant")));
    const heard: Array<{ at: number; code: string }> = [];
    const run = await generation(given);
    let previewAfter = false;
    let sent = 0;
    let hearing = false;

    for (const chunk of chunks(wrong, 1)) {
      sent += Buffer.byteLength(chunk);

      const update = await run.push(chunk);

      update.diagnostics.forEach((each) => heard.push({ at: sent, code: each.code }));
      // a preview before the mistake is heard is a prefix that stops before the tag being written; from the moment it is heard there is none
      previewAfter ||= hearing && update.preview !== undefined;
      hearing ||= heard.length > 0;
    }

    expect(heard).toHaveLength(1);
    expect(heard[0]!.at - start).toBeLessThanOrEqual(20);
    expect(previewAfter).toBe(false);

    const clean = await generation(given);
    let cleanDraws = 0;

    for (const chunk of chunks(wrong.replace("loud", "quiet"), 1)) {
      cleanDraws += (await clean.push(chunk)).preview === undefined ? 0 : 1;
    }

    expect(cleanDraws).toBeGreaterThan(30);
  });

  it("ends a round with exactly the batch check of the whole text, however it was cut", async () => {
    const given = await profile(manifest);
    const text = `<stack>\n<text>{title}</text>\n<button variant="loud" on.click={nope()}>Add {missing}</button>\n</stack>\n`;

    for (const size of [1, 3, 11, 1000]) {
      const run = await generation(given);

      for (const chunk of chunks(text, size)) {
        await run.push(chunk);
      }

      const outcome = await run.finish();
      const batch = await check({ source: text, path: "generated.mprx", model: { manifest: given.manifest, path: "components.json", component: "page" } });

      expect(outcome.diagnostics).toEqual(batch.diagnostics);
    }
  });
});

describe("the correction loop", () => {
  it("sends each mistake once, from its code and place, and stops after the rounds", async () => {
    const given = await profile(manifest);
    const run = await generation(given);
    const text = `<button variant="loud">Add</button>`;

    await run.push(text);

    const first = await run.finish();
    const message = await run.correction(first);

    expect(first.ok).toBe(false);
    expect(message).toContain("unknown-variant");
    expect(message).toContain('variant="loud"'.slice(0, 7));
    expect(message).toBe(
      feedbackOf(
        text,
        first.diagnostics.filter((each) => each.severity === "error"),
      ),
    );
    expect(run.round).toBe(2);

    // the model makes the same mistake again: it was told, so there is nothing new to say and the loop ends
    await run.push(text);

    expect(await run.correction(await run.finish())).toBeUndefined();
    expect(ROUNDS).toBe(3);
  });

  it("does not go past the rounds it was given: with one correction round, the second failure is the last", async () => {
    const run = await generation(await profile(manifest), { rounds: 1 });

    await run.push("<s1 />");

    expect(await run.correction(await run.finish())).toContain("unknown-component");

    await run.push("  <s2 />");

    expect(await run.correction(await run.finish())).toBeUndefined();
  });

  it("is not told anything when the round is ok", async () => {
    const run = await generation(await profile(manifest));

    await run.push(PAGE);

    expect(await run.correction(await run.finish())).toBeUndefined();
  });
});

describe("the guard in front of commands", () => {
  it("refuses a command the profile does not offer, runs a read, and asks a person about a write with a prompt built from the manifest", async () => {
    const given = await profile(manifest, { commands: ["refresh", "add", "remove"] });
    const asked: unknown[] = [];
    const guard = commandGuard(given, (prompt) => {
      asked.push(prompt);

      return prompt.command !== "remove";
    });

    expect(await guard("mystery")).toEqual({ allowed: false, reason: "not-offered" });
    expect(await guard("refresh")).toEqual({ allowed: true });
    expect(asked).toEqual([]);
    expect(await guard("add", { label: "milk" })).toEqual({ allowed: true });
    expect(asked).toEqual([{ command: "add", title: "Add an item", effect: "write", arguments: [{ name: "label", value: "milk" }] }]);
    expect(await guard("remove", { id: 3 })).toEqual({ allowed: false, reason: "declined" });
  });

  it("changes nothing without a consent: with none given, only a read runs", async () => {
    const guard = commandGuard(await profile(manifest));

    expect(await guard("refresh")).toEqual({ allowed: true });
    expect(await guard("add", { label: "x" })).toEqual({ allowed: false, reason: "no-consent" });
  });
});

describe("the record of a generation", () => {
  const run = async (options: { readonly pushMs?: number } = {}) => {
    const given = await profile(manifest);
    const lines: GenerationLine[] = [];
    const attempt = await generation(given, { record: (line) => lines.push(line), ...options });

    for (const chunk of chunks(`<button variant="loud">x</button>`, 4)) {
      await attempt.push(chunk);
    }

    const first = await attempt.finish();

    await attempt.correction(first);

    for (const chunk of chunks(`<button variant="quiet">x</button>`, 4)) {
      await attempt.push(chunk);
    }

    await attempt.finish();

    return { given, lines };
  };

  it("holds the chunks verbatim, the rounds and the codes, and nothing of a prompt", async () => {
    const { lines } = await run();

    expect(lines[0]).toMatchObject({ line: "header", profile: "generated" });
    expect(lines.filter((line) => line.line === "round")).toHaveLength(2);
    expect(
      lines
        .filter((line) => line.line === "chunk")
        .map((line) => (line as { text: string }).text)
        .join(""),
    ).toBe(`<button variant="loud">x</button><button variant="quiet">x</button>`);
    expect(JSON.stringify(lines)).not.toMatch(/prompt|reason/i);
  });

  it("replays to the same lines; a changed code is found at its line (the control)", async () => {
    const { given, lines } = await run();

    expect(await replayGeneration(given, lines)).toBeUndefined();

    const wrong = lines.map((line) => (line.line === "close" && line.round === 1 ? { ...line, codes: ["unknown-component@0-1"] } : line));
    const found = await replayGeneration(given, wrong);

    expect(found?.expected).toMatchObject({ line: "close", round: 1 });
  });

  it("refuses a record of another profile", async () => {
    const { lines } = await run();

    await expect(replayGeneration(await profile(manifest, { components: ["text"] }), lines)).rejects.toThrow(/not of this profile/);
  });

  it("logs a budget trip as an input and replays it without a clock", async () => {
    const { given, lines } = await run({ pushMs: 0 });
    const trips = lines.filter((line) => line.line === "budget");

    expect(trips.length).toBeGreaterThan(0);
    expect(await replayGeneration(given, lines)).toBeUndefined();
    // without the trip recorded, the replay checks every push and so differs from a run that stopped at the first
    expect(
      await replayGeneration(
        given,
        lines.filter((line) => line.line !== "budget"),
      ),
    ).toBeDefined();
  });

  it("states its limits", () => {
    expect(LIMITS).toEqual({ bytes: 65_536, elements: 5_000, attributes: 64, depth: 128, pushMs: 50 });
  });
});
