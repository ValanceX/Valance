import { JSDOM } from "jsdom";

/** A page load: `html` (server output) inside a container, parsed as a document. */
export const load = (html: string) => {
  const { window } = new JSDOM(`<!doctype html><html><body><main>${html}</main></body></html>`);
  const container = window.document.querySelector("main")!;
  const click = (target: Element) => target.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const nodes = (root: Node): ReadonlyArray<Node> => Array.from(root.childNodes).flatMap((child) => [child, ...nodes(child)]);

  return { window, container, click, nodes: () => nodes(container) };
};

/** Waits, boundedly, for a condition that a background render produces. */
export const until = async (done: () => boolean): Promise<void> => {
  for (let tries = 0; !done(); tries += 1) {
    if (tries > 400) {
      throw new Error("timed out");
    }

    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
