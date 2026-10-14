import { describe, expect, it, vi } from "vitest";

import { ANNOUNCER_ID, announcePage } from "../src/announce.js";
import type { AnnounceDocument, Node_ } from "../src/announce.js";
import { documentTitle } from "../src/scope.js";
import { DEFAULT_TITLE } from "../src/model.js";
import type { Content, Page } from "../src/model.js";

const page = (title: string, path = "/x"): Page => ({ path, title, description: "", section: "", order: 0, blocks: [], outline: [], source: "" }) as unknown as Page;
const content = (title = DEFAULT_TITLE): Content => ({ site: { name: "Site", base: "/", url: "", title, api: "", announce: true }, pages: [] }) as unknown as Content;

describe("the document's title", () => {
  it("writes the page then the site, and the site alone when the page is the site", () => {
    expect(documentTitle(content(), page("Guide"))).toBe("Guide · Site");
    expect(documentTitle(content(), page("Site", "/"))).toBe("Site");
  });

  it("follows the project's format", () => {
    expect(documentTitle(content("{site} — {page}"), page("Guide"))).toBe("Site — Guide");
    expect(documentTitle(content("{page}"), page("Guide"))).toBe("Guide");
  });

  it("takes the parts the application gives, with the status first in parentheses", () => {
    expect(documentTitle(content(), page("Inbox"), { status: "3" })).toBe("(3) Inbox · Site");
    expect(documentTitle(content(), page("Inbox"), { page: "Message from Ada", app: "Mail" })).toBe("Message from Ada · Mail");
    expect(documentTitle(content(), page("Inbox"), { status: "" })).toBe("Inbox · Site");
  });
});

const fakeDocument = (existing: Record<string, Node_> = {}, main?: Node_) => {
  const made: Array<Node_ & { attributes: Record<string, string> }> = [];
  const nodes = { ...existing };
  const document: AnnounceDocument = {
    title: "New page · Site",
    body: { append: (node) => void (nodes[(node as unknown as { attributes: Record<string, string> }).attributes["id"]!] = node as unknown as Node_) },
    getElementById: (id) => nodes[id] ?? (id === "content" ? (main ?? null) : null),
    querySelector: () => null,
    createElement: () => {
      const node = {
        textContent: "",
        attributes: {} as Record<string, string>,
        styles: {} as Record<string, string>,
        style: { setProperty: (name: string, value: string) => void (node.styles[name] = value) },
        setAttribute: (name: string, value: string) => void (node.attributes[name] = value),
      };

      made.push(node);

      return node;
    },
  };

  return { document, made, nodes };
};

describe("announcing a page change", () => {
  it("says the new title in a polite live region it makes once, and says it again for the next page", () => {
    const { document, made, nodes } = fakeDocument();

    announcePage(document, { focus: false });
    expect(made).toHaveLength(1);
    expect(made[0]!.attributes).toMatchObject({ id: ANNOUNCER_ID, role: "status", "aria-live": "polite" });
    expect(nodes[ANNOUNCER_ID]!.textContent).toBe("New page · Site");
    // Hidden by the style object: a `style` attribute would be refused by the policy the build writes.
    expect(made[0]!.attributes).not.toHaveProperty("style");
    expect((made[0] as unknown as { styles: Record<string, string> }).styles).toMatchObject({ position: "absolute", width: "1px" });

    (document as { title: string }).title = "Another · Site";
    announcePage(document, { focus: false });
    expect(made).toHaveLength(1);
    expect(nodes[ANNOUNCER_ID]!.textContent).toBe("Another · Site");
  });

  it("focuses the main content only when the author made it focusable", () => {
    const focus = vi.fn<(options?: { preventScroll?: boolean }) => void>();
    const focusable = { textContent: "", setAttribute: () => undefined, hasAttribute: (name: string) => name === "tabindex", focus };
    const plain = { textContent: "", setAttribute: () => undefined, hasAttribute: () => false, focus: vi.fn<() => void>() };

    announcePage(fakeDocument({}, focusable).document);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    announcePage(fakeDocument({}, plain).document);
    expect(plain.focus).not.toHaveBeenCalled();
  });
});
