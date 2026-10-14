// What may reach the document as a title or a meta: text a reader sees as written. The head is the one place every document string passes, on the server (`renderHead`) and in the browser (`applyHead`).
import { describe, expect, it } from "vitest";

import { applyHead, cleanTitle, plainText, renderHead, TITLE_LIMIT } from "../src/web-plugin.js";

const RLO = "‮";

describe("plainText and cleanTitle", () => {
  it("removes control characters and bidirectional overrides and isolates, which can reorder or hide what surrounds a title", () => {
    expect(plainText(`Inbox${RLO}gnp.exe`)).toBe("Inboxgnp.exe");
    expect(plainText("a\u0000b\u0007c\u007fd\u009fe⁦f⁩g")).toBe("abcdefg");
    expect(cleanTitle(`${RLO}evil`)).toBe("evil");
  });

  it("collapses whitespace, including newlines and tabs, to one space, and trims", () => {
    expect(plainText("  Notes \n\t · \r\n site  ")).toBe("Notes · site");
  });

  it("keeps everything a reader would write: accents, scripts, emoji, a left-to-right mark", () => {
    for (const text of ["Café · Ünï", "ひらがな 日本語", "العربية", "🙂 done", "a‎b"]) {
      expect(cleanTitle(text)).toBe(text);
    }
  });

  it("cuts a long title to the limit, by characters, with an ellipsis, and does not split an emoji", () => {
    const long = "x".repeat(TITLE_LIMIT + 50);
    const cut = cleanTitle(long);

    expect(Array.from(cut)).toHaveLength(TITLE_LIMIT);
    expect(cut.endsWith("…")).toBe(true);
    expect(cleanTitle("🙂".repeat(TITLE_LIMIT + 5)).endsWith("…")).toBe(true);
    expect(cleanTitle("x".repeat(TITLE_LIMIT))).toBe("x".repeat(TITLE_LIMIT));
  });
});

describe("the head applies it, on the server and in the browser", () => {
  it("renderHead writes a clean title and clean meta content, escaped", () => {
    const html = renderHead({
      title: `<b>${RLO} A \n B</b>`,
      meta: [{ name: "description", content: `x${RLO}y\n z` }],
      links: [{ rel: "alternate", href: "/feed.xml", title: `F${RLO}eed` }],
    });

    expect(html).toContain("<title>&lt;b&gt; A B&lt;/b&gt;</title>");
    expect(html).toContain('content="xy z"');
    expect(html).toContain('title="Feed"');
    expect(html).not.toContain(RLO);
  });

  it("applyHead sets a clean title, and writes nothing when it is already the title", () => {
    const writes: Array<string> = [];
    let current = "Old";
    const document = {
      get title() {
        return current;
      },
      set title(value: string) {
        writes.push(value);
        current = value;
      },
      head: { querySelectorAll: () => [], append: () => undefined },
      createElement: () => ({ setAttribute: () => undefined }),
    } as unknown as Document;

    applyHead(document, { title: `New${RLO}` });
    applyHead(document, { title: "New" });
    expect(writes).toEqual(["New"]);
  });
});
