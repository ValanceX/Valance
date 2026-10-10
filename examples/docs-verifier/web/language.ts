// The language of the page the reader is on is the page's `lang` (the shell carries it, so it is part of what the application draws), and the document's own `lang` follows it: a reader who
// goes from a page in English to the same page in French changes the language the document is in, which a screen reader and a browser's translation offer both go by. The server wrote the
// first; this keeps it true after the application moves the reader.
export const followLanguage = (win: Window & typeof globalThis, container: Element): (() => void) => {
  const sync = (): void => {
    const lang = container.querySelector(".shell")?.getAttribute("lang");

    if (lang !== null && lang !== undefined && lang !== "" && win.document.documentElement.lang !== lang) { win.document.documentElement.lang = lang; }
  };
  const observer = new win.MutationObserver(sync);

  observer.observe(container, { attributes: true, attributeFilter: ["lang"], subtree: true, childList: true });
  sync();

  return () => { observer.disconnect(); };
};
