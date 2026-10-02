// The asynchronous variant of the application-owned capability (cf. ./service.ts): the same ownership, but the operation is
// an Effect that can suspend, fail, and be interrupted. The contract is the application's; imports are NEXUS and Effect only.
import type { Effect } from "effect";

import * as Nexus from "@valancex/nexus";

export interface CatalogEntry {
  readonly id: string;
  readonly name: string;
}

export type LookupError = { readonly _tag: "LookupError"; readonly id: string };

export interface CatalogAsync {
  /** The entry the catalog knows for an id. Completes when the backing resource answers; may fail; may be interrupted. */
  readonly lookup: (id: string) => Effect.Effect<CatalogEntry, LookupError>;
}

export const CatalogAsync = Nexus.Capability.define<CatalogAsync>("example/catalog-async");
