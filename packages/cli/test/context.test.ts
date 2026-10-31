// The context channel (refinements C-1, MESH 0.18): `defineApp`'s `context` gives values a component reads by listing them in `uses`, without a prop at every level between. `vlx check`
// derives the manifest's `context` from it and each component's `uses` from its contract; MESH checks every read before anything runs.
import { afterEach, describe, expect, it } from "vitest";

import { check } from "../src/check.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const MAIN = (options: { readonly context?: string; readonly uses?: string } = {}): string => `import { component, defineApp, field } from "@valancex/common";
import { Redacted, Schema } from "effect";
import layout from "./layout.mprx";
import card from "./card.mprx";
import badge from "./badge.mprx";

export default defineApp({
  state: { theme: field(Schema.Literal("light", "dark"), "dark"), token: field(Schema.RedactedFromSelf(Schema.String), Redacted.make("t")) },
  context: ${options.context ?? "(state) => ({ theme: state.theme })"},
  layout: component(layout),
  components: [component(card), component(badge, { props: {}, events: {}, uses: ${options.uses ?? '["theme"]'} })],
});
`;
const FILES = (main = MAIN(), badge = '<span class="b">{theme}</span>'): Record<string, string> => ({
  "content/index.md": PAGE("Home", "Text."),
  "src/main.ts": main,
  // The layout passes nothing to the card, and the card nothing to the badge.
  "src/layout.mprx": '<shell class="x" theme="light"><card /></shell>',
  "src/card.mprx": '<div class="c"><badge /></div>',
  "src/badge.mprx": badge,
});

describe("the context channel in a project", () => {
  it("checks clean: the manifest declares the context and the badge's uses, so the badge reads the theme two levels down", async () => {
    expect((await check(project(FILES()))).diagnostics).toEqual([]);
  });

  it("a component that reads a context name it does not list in uses is a diagnostic at its template", async () => {
    const found = (await check(project(FILES(MAIN({ uses: "[]" }))))).diagnostics;

    expect(found.map((each) => each.file)).toContain("src/badge.mprx");
  });

  it("a uses name the context does not declare is MESH's diagnostic", async () => {
    const found = (await check(project(FILES(MAIN({ uses: '["theme", "locale"]' }))))).diagnostics;

    expect(found.map((each) => `${each.code} ${each.message}`).join("\n")).toContain("locale");
  });

  it("a context projection that reads a Schema.Redacted field is redacted-in-view", async () => {
    const found = (await check(project(FILES(MAIN({ context: "(state) => ({ theme: Redacted.value(state.token) === 'x' ? 'light' : state.theme })" }))))).diagnostics;

    expect(found).toContainEqual(expect.objectContaining({ code: "redacted-in-view", file: "src/main.ts" }));
  });

  it("a context name the layout does not read has no type: the definition is refused, naming it", async () => {
    await expect(check(project(FILES(MAIN({ context: "() => ({ mood: 'calm' })" }))))).rejects.toThrow(/mood/);
  });
});
