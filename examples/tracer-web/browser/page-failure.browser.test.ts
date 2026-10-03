// Stage 47: the real page when `run` cannot start. The embedded state is corrupt (the dev server's test-only fault injection in vitest.browser.config.ts: a stale
// or damaged server payload, plus an inline observer installed before the page script), so `Valance.start` inside `run` rejects it with a typed StartError.
// Observed BEFORE the page had any policy: the server's HTML stayed, nothing was marked, nothing was reported (no error, no rejection, no console output).
import { expect, it } from "vitest";

it("a real page whose run() cannot start keeps the server's HTML, marks itself failed and reports it once; nothing is mounted and the page is inert", async () => {
  const frame = document.createElement("iframe");

  frame.src = "/tracer/about?tab=details&__corrupt=state";
  document.body.append(frame);

  try {
    await new Promise<void>((resolve) => { frame.addEventListener("load", () => { resolve(); }, { once: true }); });
    const doc = frame.contentDocument!;
    const win = frame.contentWindow! as unknown as { __seen: Array<string> };
    const app = () => doc.querySelector<HTMLElement>("#app")!;

    await expect.poll(() => app().dataset["valance"]).toBe("failed");              // the page's own explicit outcome (it is never "running")
    expect(app().textContent).toBe("About Tracer: 0 clickstab: detailsBack");        // what remains rendered: the server's HTML, untouched

    await expect.poll(() => win.__seen.length).toBeGreaterThan(0);                  // the report follows the marker in the same fiber
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(win.__seen).toHaveLength(1);                                              // one report; no uncaught error, no unhandled rejection
    expect(win.__seen[0]).toMatch(/^log: .*level=ERROR .*the page could not start/);   // Effect's default logger writes every level through console.log
    expect(win.__seen[0]).toContain("InitialValueInvalid");                          // the typed StartError, with the schema's reason (`count`)
    expect(win.__seen[0]).toContain("Expected number, actual");
    expect(win.__seen[0]).toContain("zero");

    app().querySelectorAll("button")[0]!.click();                                    // nothing is mounted: the server's buttons are inert
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(app().textContent).toBe("About Tracer: 0 clickstab: detailsBack");
    expect(app().dataset["valance"]).toBe("failed");
  } finally {
    frame.remove();
  }
});
