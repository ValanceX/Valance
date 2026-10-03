// An application-owned capability: the CONTRACT is the application's; no implementation is chosen here and nothing is
// imported but NEXUS. Whoever starts the application supplies the implementation (`StartOptions.platform`), and may back it
// with a resource the application's lifetime owns.
import * as Nexus from "@valancex/nexus";

export interface CatalogService {
  /** The name the catalog knows an id by. Deterministic for a given implementation. */
  readonly lookup: (id: string) => string;
  /** Releases what backs the implementation. The platform calls it when the application ends; the application never does. */
  readonly close: () => void;
}

export const Catalog = Nexus.Capability.define<CatalogService>("example/catalog");
