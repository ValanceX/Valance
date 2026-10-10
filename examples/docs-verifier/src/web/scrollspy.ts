// Which heading the reader is at, for "On this page". The page's scrolling is not an event any template can name, so this is the one adapter between the browser and the application:
// it watches the window and reports a heading to the application's `setActive` command, which is where the state lives. It reports a change, never the same heading twice.
export interface Spy {
  /** Stop watching. Safe to call twice. */
  readonly stop: () => void;
}

/** The anchor of the last heading whose top is above `line`, or "" when the reader is above the first. At the very bottom of the page, the last heading: it may never reach the line. */
export const activeAnchor = (win: Window & typeof globalThis, line: number): string => {
  const headings = Array.from(win.document.querySelectorAll<HTMLElement>("main h2[id], main h3[id]"));
  const bottom = win.innerHeight + win.scrollY >= win.document.documentElement.scrollHeight - 2;
  const passed = headings.filter((heading) => heading.getBoundingClientRect().top <= line);

  if (bottom && headings.length > 0 && win.scrollY > 0) { return headings[headings.length - 1]!.id; }

  return passed[passed.length - 1]?.id ?? "";
};

export const watchHeadings = (win: Window & typeof globalThis, report: (anchor: string) => void, line = 96): Spy => {
  let reported: string | undefined;
  let pending = false;
  const check = (): void => {
    pending = false;

    const anchor = activeAnchor(win, line);

    if (anchor !== reported) { reported = anchor; report(anchor); }
  };
  const schedule = (): void => { if (!pending) { pending = true; win.requestAnimationFrame(check); } };
  // A new page replaces the headings without a scroll: look again when the page changes under us.
  const mutations = new win.MutationObserver(schedule);

  win.addEventListener("scroll", schedule, { passive: true });
  win.addEventListener("resize", schedule);
  mutations.observe(win.document.querySelector("#app") ?? win.document.body, { childList: true, subtree: true });
  schedule();

  return { stop: () => { win.removeEventListener("scroll", schedule); win.removeEventListener("resize", schedule); mutations.disconnect(); } };
};
