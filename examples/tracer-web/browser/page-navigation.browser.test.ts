// Stage 48: the real page across URL changes. One document is loaded from the dev server and driven through: an event-triggered URL change (pushState), traversal
// with history.back()/forward() (popstate), a reload (a genuinely new document), and the page's end (`pagehide`). The question at each step is which mechanism moved the
// URL, whether the same document and the same running application survived it, and what the page's one Scope still owns afterwards.
import { expect, it } from "vitest";

type PageWindow = Window & { __marker?: string; console: Console };

const text = (doc: Document) => doc.querySelector("#app")?.textContent ?? "";
const button = (doc: Document, label: string) => [...doc.querySelectorAll("button")].find((b) => b.textContent === label)!;
const where = (win: Window) => win.location.pathname + win.location.search;
const loaded = (frame: HTMLIFrameElement) => new Promise<void>((resolve) => { frame.addEventListener("load", () => { resolve(); }, { once: true }); });

it("URL changes inside the page are in-place history on ONE document and ONE running application; a reload is a new document that rebuilds from the URL alone; pagehide ends everything", async () => {
  const frame = document.createElement("iframe");

  frame.src = "/tracer/about?tab=details";
  document.body.append(frame);

  try {
    await loaded(frame);
    const doc = frame.contentDocument!;
    const win = frame.contentWindow as PageWindow;
    const reports: Array<unknown> = [];

    await expect.poll(() => doc.querySelector<HTMLElement>("#app")?.dataset["valance"]).toBe("running");
    win.__marker = "first document";                                                  // lives and dies with this document
    for (const level of ["error", "warn", "log"] as const) { win.console[level] = (...args: Array<unknown>) => { reports.push(args); }; }
    const navigations = () => win.performance.getEntriesByType("navigation").length;
    const entries0 = win.history.length;

    // 1. Event-triggered URL changes: counter, an update that is NOT in the URL, then About again.
    button(doc, "Back").click();
    await expect.poll(() => text(doc)).toBe("0 clicks, last at 0ClickAbout");
    await expect.poll(() => where(win)).toBe("/tracer/?tab=overview");
    button(doc, "Click").click();
    await expect.poll(() => text(doc)).toMatch(/^1 clicks, last at [1-9]\d+ClickAbout$/);
    const counterText = text(doc);

    expect(where(win)).toBe("/tracer/?tab=overview");                                 // a state change the URL does not carry writes nothing
    button(doc, "About").click();
    await expect.poll(() => where(win)).toBe("/tracer/about?tab=overview");
    expect(text(doc)).toBe("About Tracer: 1 clickstab: overviewBack");

    expect(win.history.length).toBe(entries0 + 2);                                    // two pushState entries (counter, about), nothing else
    expect(frame.contentDocument).toBe(doc);                                          // the same document object ...
    expect(win.__marker).toBe("first document");                                      // ... the same window and script state ...
    expect(navigations()).toBe(1);                                                    // ... and the browser requested no new document

    // 2. Traversal: popstate. The same application navigates; the in-memory count survives, which no new document could do.
    win.history.back();
    await expect.poll(() => where(win)).toBe("/tracer/?tab=overview");
    await expect.poll(() => text(doc)).toBe(counterText);                             // counter view with count 1 and the same stamp
    win.history.back();
    await expect.poll(() => where(win)).toBe("/tracer/about?tab=details");
    await expect.poll(() => text(doc)).toBe("About Tracer: 1 clickstab: detailsBack");
    win.history.forward();
    await expect.poll(() => where(win)).toBe("/tracer/?tab=overview");
    await expect.poll(() => text(doc)).toBe(counterText);
    expect(frame.contentDocument).toBe(doc);
    expect(win.__marker).toBe("first document");
    expect(navigations()).toBe(1);                                                    // traversing pushState entries is not a document load either
    expect(reports).toEqual([]);                                                       // no host or history report in a healthy lifecycle

    // 3. Reload: a genuinely new document. The URL is all that survives; the count (state the URL does not carry) is rebuilt from the server.
    const reloaded = loaded(frame);

    win.location.reload();
    await reloaded;
    const doc2 = frame.contentDocument!;
    const win2 = frame.contentWindow as PageWindow;

    expect(doc2).not.toBe(doc);
    expect(win2.__marker).toBeUndefined();
    await expect.poll(() => doc2.querySelector<HTMLElement>("#app")?.dataset["valance"]).toBe("running");   // the new document started its own page and application
    expect(where(win2)).toBe("/tracer/?tab=overview");
    expect(text(doc2)).toBe("0 clicks, last at 0ClickAbout");                        // counter view again, with count 0: only what the URL carries came back

    // 4. The page ends: one Scope closes the mount AND the history binding. Traversal afterwards reaches nothing.
    const reports2: Array<unknown> = [];

    for (const level of ["error", "warn", "log"] as const) { win2.console[level] = (...args: Array<unknown>) => { reports2.push(args); }; }
    win2.dispatchEvent(new Event("pagehide"));
    await expect.poll(() => doc2.querySelector("#app")?.innerHTML).toBe("");
    win2.history.back();                                                              // popstate with the history binding already gone
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(doc2.querySelector("#app")?.innerHTML).toBe("");                           // nothing navigates or redraws
    expect(reports2).toEqual([]);                                                      // and nothing is reported
  } finally {
    frame.remove();
  }
});
