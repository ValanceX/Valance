// Stage 53: the server/browser payload boundary. The document the server sends embeds `{ programs, state }`; the browser builds the application from the bundled
// definition plus that payload. This pins what the payload is: DATA that is a pure function of the build (the MPRX sources) and the request URL, and that state
// is the one the HTML was rendered from. Nothing here is mutable runtime state: the browser's NEXUS state is created from it at `start` and is its own.
import { renderToHtml } from "@valancex/valance/web/server";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { application, primitives, stateFor } from "../src/app.js";
import { compilePrograms } from "../src/compile.js";
import { renderDocument } from "../src/document.js";

const URLS = ["/tracer/", "/tracer/?tab=overview", "/tracer/about?tab=details", "/tracer/about", "/tracer/not-a-view"];
const payloadOf = (html: string) => JSON.parse(/<script type="application\/json" id="valance-boot">(.*?)<\/script>/s.exec(html)![1]!) as { programs: unknown; state: unknown };

describe("the embedded payload", () => {
  for (const url of URLS) {
    it(`${url}: programs are the build's compiled MPRX, state is the state the embedded HTML was rendered from, both a pure function of (build, URL)`, async () => {
      const html = await renderDocument(url);
      const payload = payloadOf(html);
      const programs = await compilePrograms();
      const served = await Effect.runPromise(renderToHtml(application(programs), { primitives, state: stateFor(url) }));

      expect(payload.programs).toEqual(programs);                                    // compiled by the server from the build's sources; the browser never compiles
      expect(payload.state).toEqual(served.state);                                   // the state `renderToHtml` returned (the documented thing to embed) ...
      expect(payload.state).toEqual(stateFor(url));                                  // ... which the application derives from the URL alone
      expect(html).toContain(served.html);                                           // and the body in the document is that render
      expect(await renderDocument(url)).toBe(html);                                  // deterministic: the same request gives the same document
    });
  }
});
