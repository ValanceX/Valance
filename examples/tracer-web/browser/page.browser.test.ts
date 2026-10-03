// Stage 46: a REAL page. A URL under the application's base path is requested from the dev server, which answers with the server-rendered document
// (src/document.ts); the browser loads it into its own window (an iframe, so the document, its script, its history and its lifetime are the page's); the page script
// (src/page.ts) calls the existing web host `run` with `hydrate: true`. Nothing here calls start, mount or hydrate: the page does, through `run`.
import { expect, it } from "vitest";

const text = (doc: Document) => doc.querySelector("#app")?.textContent ?? "";
const button = (doc: Document, label: string) => [...doc.querySelectorAll("button")].find((b) => b.textContent === label)!;

it("loads /tracer/about?tab=details as a real document; its script hydrates through `run`; clicks and history work; hiding the page ends the mount", async () => {
  const frame = document.createElement("iframe");

  frame.src = "/tracer/about?tab=details";
  document.body.append(frame);

  try {
    await new Promise<void>((resolve) => { frame.addEventListener("load", () => { resolve(); }, { once: true }); });
    const doc = frame.contentDocument!;
    const win = frame.contentWindow!;

    expect(text(doc)).toBe("About Tracer: 0 clickstab: detailsBack");                 // the server's HTML, before the page script has run
    await expect.poll(() => doc.querySelector<HTMLElement>("#app")?.dataset["valance"]).toBe("running");   // the page script called `run` and it mounted

    const errors: Array<unknown> = [];
    (win as unknown as { console: Console }).console.error = (...args: Array<unknown>) => { errors.push(args); };          // anything the host reports as an error

    button(doc, "Back").click();                                                       // About -> counter: a different program, drawn fresh
    await expect.poll(() => text(doc)).toBe("0 clicks, last at 0ClickAbout");
    const section = doc.querySelector("section");

    button(doc, "Click").click();                                                      // same program: updated in place, by a command that reads the platform clock
    await expect.poll(() => text(doc)).toMatch(/^1 clicks, last at [1-9]\d+/);
    expect(doc.querySelector("section")).toBe(section);

    button(doc, "About").click();                                                      // navigation reaches the browser's history through the host's `history` option
    await expect.poll(() => win.location.pathname + win.location.search).toBe("/tracer/about?tab=overview");
    expect(text(doc)).toBe("About Tracer: 1 clickstab: overviewBack");

    win.dispatchEvent(new Event("pagehide"));                       // the page is hidden: its one Scope closes
    await expect.poll(() => doc.querySelector("#app")?.innerHTML).toBe("");            // the target was unmounted by the Scope, not by the page script
    expect(errors).toEqual([]);                                                        // a normal end is silent: the host reports only abnormal ones
  } finally {
    frame.remove();
  }
});
