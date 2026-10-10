import { afterEach, describe, expect, it } from "vitest";

import { dev, stagesFor } from "../src/dev.js";
import { cleanup, PAGE, project } from "./fixture.js";

afterEach(cleanup);

describe("what a change asks for", () => {
  it("content and templates rebuild, styles are the page's own, public reloads, configuration restarts", () => {
    expect(stagesFor("content/guide/a.md")).toEqual(["content"]);
    expect(stagesFor("src/layout.mprx")).toEqual(["program"]);
    expect(stagesFor("src/main.ts")).toEqual(["program"]);
    expect(stagesFor("src/main.ts", "add")).toEqual(["entries", "program"]);
    expect(stagesFor("src/styles.css")).toEqual([]);
    expect(stagesFor("src/styles.css", "add")).toEqual(["entries"]);
    expect(stagesFor("src/styles.css", "unlink")).toEqual(["entries"]);
    expect(stagesFor("public/logo.svg")).toEqual(["reload"]);
    expect(stagesFor("valance.json")).toEqual(["restart"]);
    expect(stagesFor("valance.web.json")).toEqual(["restart"]);
    expect(stagesFor("README.md")).toEqual([]);
    expect(stagesFor("src/notes.txt")).toEqual([]);
  });
});

describe("vlx dev", () => {
  it("serves pages under the base, once: the address it prints, the pages, a 404 for what is not one", async () => {
    const root = project({ "content/index.md": PAGE("Home", "[A](/guide/a)"), "content/guide/a.md": PAGE("A"), "public/x.txt": "x", "valance.web.json": '{ "base": "/docs/" }' });
    const running = await dev(root, { port: 5600 + Math.floor(Math.random() * 300), log: () => undefined });

    try {
      const origin = new URL(running.url).origin;

      expect(new URL(running.url).pathname).toBe("/docs/");

      const home = await fetch(running.url);

      expect(home.status).toBe(200);
      expect(await home.text()).toContain('href="/docs/guide/a"');
      expect((await fetch(`${origin}/docs/guide/a`)).status).toBe(200);
      expect((await fetch(`${origin}/docs/nowhere`)).status).toBe(404);
      expect(await (await fetch(`${origin}/docs/x.txt`)).text()).toBe("x");
      expect((await fetch(`${origin}/docs/.valance/client.ts`)).status).toBe(200);
    } finally {
      await running.close();
    }
  });

  it("starts even when the content is wrong, and reports it where it is", async () => {
    const lines: Array<string> = [];
    const root = project({ "content/index.md": PAGE("Home", "[x](/nowhere)") });
    const running = await dev(root, { port: 5900 + Math.floor(Math.random() * 300), log: (line) => { lines.push(line); } });

    try {
      expect(lines.join("\n")).toContain("content/index.md:7 link-broken");
    } finally {
      await running.close();
    }
  });
});
