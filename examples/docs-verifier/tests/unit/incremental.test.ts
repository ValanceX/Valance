// The development branches' incremental path, on this site's real program (a layout slot, a callout slot, a code block with a composite event, a keyed list of blocks):
// MESH's `update` and `updateChanges` give patches, PORT's `patch` applies them in place, and the DOM is what a fresh draw of the new state gives. Valance 0.6.0 does not use this path
// yet (it draws the whole tree on every state change), so this test is how the path is verified on a real application until it does (see FINDINGS.md, F5).
import { createWebPort } from "@valancex/port-web";
import { diff, init, render, update, updateChanges, type Render } from "@valancex/mesh-runtime";
import { JSDOM } from "jsdom";
import { fileURLToPath } from "node:url";
import { beforeAll, expect, it } from "vitest";

import { pageScope } from "../../src/app/scope.js";
import { initial } from "../../src/app/state.js";
import type { AppState } from "../../src/app/state.js";
import type { Site } from "../../src/model/site.js";
import { mapOf } from "../../src/model/site.js";
import { contentOf } from "../../src/app/content.js";
import { siteDir } from "./sites.js";
import { readSite } from "../../build/content/site.js";
import { compilePage } from "../../build/views.js";
import { primitives } from "../../src/web/primitives.js";

let site: Site;
let program: Awaited<ReturnType<typeof compilePage>>;

beforeAll(() => {
  site = readSite(siteDir("docs"));
});

const scopeOf = (state: AppState): Record<string, unknown> => pageScope(mapOf(site), state) as unknown as Record<string, unknown>;
const target = () => {
  const { window } = new JSDOM('<!doctype html><main id="app"></main>');
  const container = window.document.querySelector("#app")!;

  return { container, port: createWebPort({ container, primitives, report: () => {} }) };
};
/** The state on page `id` as a server starts it (the page and its content), with what else the reader has done. */
const on = (page: string, extra: Partial<AppState> = {}): AppState => ({ ...initial, page, content: contentOf(site, page), ...extra });
const states = (): ReadonlyArray<AppState> => [
  on("docs-introduction"),
  on("docs-guides-getting-started"),
  on("docs-guides-getting-started", { copied: "docs-guides-getting-started:6" }),
  on("docs-guides-getting-started", { copied: "docs-guides-getting-started:6", theme: "dark", tabs: { pkg: "pnpm" } }),
  on("docs-guides-state"),
  on("docs-guides-plugins", { tabs: { pkg: "yarn" } }),
  on("docs-guides-state", { menu: true }),
  on("docs-reference-api", { theme: "light" }),
  on("docs-guides-state", { status: "loading", page: "docs-guides-views" }),                      // on its way: the page before, marked busy
  on("docs-guides-views", { status: "failed" }),                                             // could not be had: the page says so and offers to try again
  on("nowhere"),
  on("docs-introduction"),
];

it("a walk through the site, applied as patches (update), gives the DOM a fresh draw gives, at every step", async () => {
  program ??= await compilePage();
  const input = (state: AppState) => ({ program: { root: program.root, templates: program.templates }, model: program.model, snapshot: scopeOf(state) });
  const patched = target();
  let current: Render | undefined;
  let applied = 0;

  for (const state of states()) {
    if (current === undefined) {
      const first = await render(input(state));

      expect(first.diagnostics).toBeUndefined();
      current = first.render!;
      patched.port.draw(current.tree);
    } else {
      const next = await update(current, scopeOf(state));

      expect(next.diagnostics).toBeUndefined();
      patched.port.patch(next.patches!);
      applied += next.patches!.patches.length;
      current.release();
      current = next.render!;
    }

    const fresh = target();

    fresh.port.draw((await render(input(state))).render!.tree);
    expect(patched.container.innerHTML, JSON.stringify(state)).toBe(fresh.container.innerHTML);
  }

  expect(applied).toBeGreaterThan(0);
  current!.release();
});

it("the same walk through the changes form (diff → updateChanges) gives the same DOM, starting from a plain render()", async () => {
  program ??= await compilePage();
  const input = (state: AppState) => ({ program: { root: program.root, templates: program.templates }, model: program.model, snapshot: scopeOf(state) });
  const patched = target();
  let previous = scopeOf(states()[0]!);
  let current: Render = (await render(input(states()[0]!))).render!;

  patched.port.draw(current.tree);

  for (const state of states().slice(1)) {
    const snapshot = scopeOf(state);
    const next = await updateChanges(current, { base: current.version, changes: diff(previous, snapshot) }, { verify: snapshot });

    expect(next.diagnostics).toBeUndefined();
    patched.port.patch(next.patches!);
    current.release();
    current = next.render!;
    previous = snapshot;

    const fresh = target();

    fresh.port.draw((await render(input(state))).render!.tree);
    expect(patched.container.innerHTML, JSON.stringify(state)).toBe(fresh.container.innerHTML);
  }

  current.release();
});

it("an event on the patched DOM still reaches the command through the composite chain", async () => {
  program ??= await compilePage();
  const { dispatch } = await import("@valancex/mesh-runtime");
  const state: AppState = on("docs-guides-getting-started");
  const first = (await render({ program: { root: program.root, templates: program.templates }, model: program.model, snapshot: scopeOf(on("docs-introduction")) })).render!;
  const next = (await update(first, scopeOf(state))).render!;
  // The copy button's handler: the first click handler in the page is the menu's (the header comes first), so find the button that is the code block's.
  type Node = { readonly component?: string; readonly props?: Readonly<Record<string, unknown>>; readonly events?: Readonly<Record<string, string>>; readonly children?: ReadonlyArray<Node> };
  const find = (node: Node): string | undefined => node.component === "button" && node.props?.["class"] === "copy" ? node.events?.["click"] : node.children?.map(find).find((id) => id !== undefined);
  const button = find((next.tree as unknown as { root: Node }).root);

  expect(button).toBeDefined();

  const result = await dispatch(next, button!);

  expect(result.diagnostics).toBeUndefined();
  expect(result.intent!.command).toMatchObject({ name: "copyCode" });
  const first_ = site.pages.find((page) => page.id === state.page)!.blocks.find((block) => block.kind === "code" || block.kind === "codegroup")!;

  // the first copy button in the page: a lone code block's own id, or the first alternative of a code group
  expect(result.intent!.arguments).toEqual([{ value: first_.kind === "codegroup" ? first_.tabs[0]!.id : first_.id }]);
  first.release();
  next.release();
});
