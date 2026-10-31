// The context channel (refinements C-1, MESH 0.18): `defineApp`'s `context` gives values a component reads by listing them in `uses`, without a prop at every level between. `vlx check`
// derives the manifest's `context` from it and each component's `uses` from its contract; MESH checks every read before anything runs.
import { init } from "@valancex/mesh-runtime";
import * as Valance from "@valancex/valance";
import { runningOf } from "@valancex/valance/internal";
import { application } from "@valancex/common/internal";
import { Effect, Exit, Scope } from "effect";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

import { loadAuthor } from "../src/author.js";
import { check } from "../src/check.js";
import { compileViews } from "../src/compile.js";
import { readContent } from "../src/content.js";
import { loadConfig } from "../src/config.js";
import { createLoader } from "../src/vite.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

const MAIN = (options: { readonly context?: string; readonly uses?: string } = {}): string => `import { component, defineApp, field } from "@valancex/common";
import { Redacted, Schema } from "effect";
import layout from "./layout.mprx";
import card from "./card.mprx";
import badge from "./badge.mprx";

export default defineApp({
  state: { theme: field(Schema.Literal("light", "dark"), "dark"), token: field(Schema.RedactedFromSelf(Schema.String), Redacted.make("t")) },
  commands: (command) => ({ lighten: command((state) => ({ ...state, theme: "light" as const })) }),
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

  it("runs: application() gives defineApp's context to every render, and a state change reaches the badge two levels down", async () => {
    const root = project(FILES());
    const config = loadConfig(root);
    const loader = await createLoader(root, config);
    const author = await loadAuthor(loader, root).finally(() => loader.close());
    const built = await compileViews(root, author);

    await init(readFileSync(createRequire(import.meta.url).resolve("@valancex/mesh-runtime/mesh-runtime.wasm")));

    const app = application(readContent(root, config), built.program, author);
    const scope = await Effect.runPromise(Scope.make());
    const badge = async (): Promise<string> => {
      const { render } = await Effect.runPromise(runningOf(handle).render);

      return JSON.stringify(render.tree).match(/"text":"(light|dark)"/)?.[1] ?? "";
    };
    const handle = await Effect.runPromise(Valance.start(app).pipe(Scope.extend(scope)));

    try {
      expect(await badge()).toBe("dark");
      await Effect.runPromise(handle.invoke("app/lighten", []) as never);
      expect(await badge()).toBe("light");
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
  });
});
