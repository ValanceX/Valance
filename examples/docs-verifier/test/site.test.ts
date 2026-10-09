// The site without a browser: the document the server renders (layout slot, callout slot, code block with its composite event), the application's commands, and the not-found page.
import * as Valance from "@valancex/valance";
import { Effect, Exit, Scope } from "effect";
import { beforeAll, expect, it } from "vitest";

import { application } from "../app/application.js";
import { routes } from "../app/routes.js";
import type { AppState } from "../app/state.js";
import { initial } from "../app/state.js";
import { compilePage } from "../web/compile.js";
import { readGeneratedSite, renderDocument } from "../web/document.js";
import { readSite } from "../tooling/content.js";
import { fileURLToPath } from "node:url";
import type { Site } from "../model/site.js";

let site: Site;

beforeAll(() => { site = readSite(fileURLToPath(new URL("../content", import.meta.url))); });

it("a page is rendered on the server through the layout's slot: title, navigation, headings, a callout and a code block", async () => {
  const html = await renderDocument(site, "/docs/guides/getting-started", "/assets/page.js");

  expect(html).toContain("<title>Getting Started · Valance</title>");
  expect(html).toContain('<a href="/docs/guides/state"');
  expect(html).toMatch(/<h1[^>]*>(<span>)+Getting Started(<\/span>)+<\/h1>/);     // each run is wrapped: a composite has one root element (FINDINGS F3)
  expect(html).toMatch(/<aside[^>]*><strong[^>]*>tip<\/strong>/);                       // the callout composite, with its text placed by its slot
  expect(html).toMatch(/<figure[^>]*><pre[^>]*>import \* as Valance/);                 // the code-block composite
  expect(html).toMatch(/<button[^>]*>Copy<\/button>/);
  expect(html).toContain("The features verifier");                                      // the layout's own footer, around the slot
  expect(html).toMatch(/id="valance-boot"/);
});

it("an unknown page is the application's own Not found, not an error", async () => {
  const html = await renderDocument(site, "/docs/nowhere", "/assets/page.js");

  expect(html).toContain("<title>Valance</title>");
  expect(html).toContain("There is no such page.");
  expect(routes(site).known("/docs/nowhere")).toBe(false);
});

it("the URL and the title are the application's functions of its state", () => {
  const { urlOf, stateOf, titleOf, stateFor } = routes(site);

  expect(urlOf({ ...initial, page: "guides-state" })).toBe("/docs/guides/state");
  expect(stateOf(new URL("http://x/docs/reference/api"))).toEqual({ id: "reference-api" });
  expect(titleOf({ ...initial, page: "reference-api" })).toBe("API · Valance");
  expect(stateFor("/").page).toBe("introduction");
});

it("the copy button's composite event travels code-block → block → page to the copyCode command, and the page then says Copied", async () => {
  const program = await compilePage();
  const scope = Effect.runSync(Scope.make());
  const handle = await Effect.runPromise(Valance.start(application(program, site)).pipe(Scope.extend(scope)));
  const state = () => Effect.runSync(handle.state as never) as AppState;

  await Effect.runPromise(handle.invoke("app/go", [{ value: "guides-getting-started" }]) as never);
  expect(state().page).toBe("guides-getting-started");

  const code = site.pages.find((page) => page.id === "guides-getting-started")!.blocks.find((block) => block.kind === "code")!;

  await Effect.runPromise(handle.invoke("app/copyCode", [{ value: code.id }]) as never);
  expect(state().copied).toBe(code.id);
  await Effect.runPromise(handle.invoke("app/go", [{ value: "guides-state" }]) as never);
  expect(state().copied).toBe("");                                                      // moving on clears it

  await Effect.runPromise(Scope.close(scope, Exit.void));
});

it("the page shows Copied for the copied block", async () => {
  const { renderToHtml } = await import("@valancex/valance/web/server");
  const { primitives } = await import("../web/primitives.js");
  const program = await compilePage();
  const code = site.pages.find((page) => page.id === "guides-getting-started")!.blocks.find((block) => block.kind === "code")!;
  const { html } = await Effect.runPromise(renderToHtml(application(program, site), { primitives, state: { page: "guides-getting-started", copied: code.id } }));

  expect(html).toMatch(/<button[^>]*>Copied<\/button>/);
  expect(html).not.toMatch(/<button[^>]*>Copy<\/button>/);
});

it("the generated site is the content's site (pnpm build:content ran)", () => {
  expect(readGeneratedSite()).toEqual(site);
});

it("inline marks (strong, code, link) are runs the views draw", async () => {
  const html = await renderDocument(site, "/docs/introduction", "/assets/page.js");

  expect(html).toMatch(/<strong[^>]*>one value<\/strong>/);
  expect(html).toMatch(/<code[^>]*>Valance\.command<\/code>/);
  expect(html).toMatch(/<a href="\/docs\/guides\/getting-started"[^>]*>(<span>)*getting-started guide/);
});
