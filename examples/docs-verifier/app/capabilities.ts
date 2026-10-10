// What the application asks of the platform it runs on. Each is a contract, named and typed here; the platform supplies the implementation (../web/platform.ts in a browser, a fake in a
// test, nothing on a server), and a command that needs one handles its absence explicitly. The application names no browser: `navigator.clipboard` is the platform's.
import * as Nexus from "@valancex/nexus";

import type { SearchIndex } from "../model/search.js";

/** Put text on the reader's clipboard. Rejects when the reader's browser refuses. */
export const Clipboard = Nexus.Capability.define<{ readonly write: (text: string) => Promise<void> }>("docs/clipboard");

/** A small key-value store that outlives the page. Both are best effort: a store that is full or refused does not throw to the application. */
export const Storage = Nexus.Capability.define<{ readonly get: (key: string) => string | undefined; readonly set: (key: string, value: string) => void }>("docs/storage");

/** The site's search index, loaded when it is first needed. */
export const Index = Nexus.Capability.define<{ readonly load: () => Promise<SearchIndex> }>("docs/search-index");
