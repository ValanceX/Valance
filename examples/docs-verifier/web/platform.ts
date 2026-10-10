// What the browser gives the application, as the capabilities it asks for (../app/capabilities.ts). A plugin, so a page adds it with the others and a test or a server does not: a
// capability the platform does not provide is simply not there, and the commands that need it say so in state. Each is resolved from what this browser has, once, at start.
import * as Nexus from "@valancex/nexus";
import type { Plugin } from "@valancex/valance/web/plugin";
import { Schema } from "effect";

import { Clipboard, Index, Storage } from "../app/capabilities.js";
import { SearchIndex } from "../model/search.js";
import type { AppState } from "../app/state.js";

import type { Built } from "./built.js";

type Resolutions = Map<string, Nexus.Capability.CapabilityResolution<unknown>>;

const available = (resolutions: Resolutions, capability: { readonly id: string }, implementation: unknown): void => { resolutions.set(capability.id, { _tag: "Available", implementation }); };
const unavailable = (resolutions: Resolutions, capability: { readonly id: string }, reason: string): void => { resolutions.set(capability.id, { _tag: "Unavailable", reason }); };

/** The store, if the browser lets this page have one: reading `localStorage` throws when site data is blocked, and a probe write throws when it is full. */
const storeOf = (win: Window): { readonly get: (key: string) => string | undefined; readonly set: (key: string, value: string) => void } | undefined => {
  try {
    const store = win.localStorage;

    store.getItem("docs.probe");

    return {
      get: (key) => { try { return store.getItem(key) ?? undefined; } catch { return undefined; } },
      set: (key, value) => { try { store.setItem(key, value); } catch { /* full or refused: the choice lasts as long as the page */ } },
    };
  } catch {
    return undefined;
  }
};

export const browserPlatform = (win: Window, built: Pick<Built, "search">): Plugin<AppState> => {
  const resolutions: Resolutions = new Map();
  const clipboard = win.navigator.clipboard;
  const store = storeOf(win);

  if (clipboard === undefined || typeof clipboard.writeText !== "function") { unavailable(resolutions, Clipboard, "this browser has no clipboard API, or this page may not use it (it needs a secure context)"); }
  else { available(resolutions, Clipboard, { write: (text: string) => clipboard.writeText(text) }); }

  if (store === undefined) { unavailable(resolutions, Storage, "this browser does not let the page keep anything"); }
  else { available(resolutions, Storage, store); }

  if (built.search === undefined) { unavailable(resolutions, Index, "this build has no search index"); }
  else {
    const url = built.search;
    let loaded: Promise<SearchIndex> | undefined;

    // Fetched once, when first asked, and checked on arrival: a file is data from outside the program, and its type is not its shape.
    available(resolutions, Index, {
      load: () => loaded ??= win.fetch(url).then((response) => {
        if (!response.ok) { throw new Error(`the search index answered ${response.status}`); }

        return response.json();
      }).then((json: unknown) => Schema.decodeUnknownSync(SearchIndex)(json)).catch((error: unknown) => { loaded = undefined; throw error; }),
    });
  }

  return { name: "docs-browser", platform: Nexus.Capability.EnvironmentLive(resolutions) };
};
