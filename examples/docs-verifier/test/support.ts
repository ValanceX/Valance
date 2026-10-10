// What a test needs to stand in for a browser: a platform with fakes for the capabilities the application asks for, that records what was done with them.
import * as Nexus from "@valancex/nexus";

import { Clipboard, Index, Storage } from "../app/capabilities.js";
import type { SearchIndex } from "../model/search.js";

export interface Fakes {
  /** `undefined`: the platform has no clipboard. A function: what writing does (reject to refuse). */
  readonly clipboard?: ((text: string) => Promise<void>) | undefined;
  /** `undefined`: the platform keeps nothing. */
  readonly storage?: Record<string, string> | undefined;
  /** `undefined`: no index. A function: what loading does. */
  readonly index?: (() => Promise<SearchIndex>) | undefined;
}

export const fakePlatform = (fakes: Fakes = { clipboard: async () => undefined, storage: {}, index: undefined }) => {
  const written: Array<string> = [];
  const resolutions = new Map<string, Nexus.Capability.CapabilityResolution<unknown>>();

  resolutions.set(Clipboard.id, fakes.clipboard === undefined ? { _tag: "Unavailable", reason: "no clipboard here" } : { _tag: "Available", implementation: { write: async (text: string) => { written.push(text); await fakes.clipboard!(text); } } });
  resolutions.set(Storage.id, fakes.storage === undefined ? { _tag: "Unavailable", reason: "nothing is kept here" } : { _tag: "Available", implementation: { get: (key: string) => fakes.storage![key], set: (key: string, value: string) => { fakes.storage![key] = value; } } });
  resolutions.set(Index.id, fakes.index === undefined ? { _tag: "Unavailable", reason: "no index here" } : { _tag: "Available", implementation: { load: fakes.index } });

  return { platform: Nexus.Capability.EnvironmentLive(resolutions), written };
};
