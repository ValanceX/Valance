// Who keeps the list of places the person has been (docs/explanation/application-model/navigation.md). A page has the browser's: its session history holds the list, restores it, and moves along it with the
// person's Back and Forward. A window has none, so the engine keeps the list in its state; a platform that supplies this capability is one of those, and only there does `persist: ["navigation"]`
// do anything (restoring a stored page on the web would argue with the address, which is the truth there).
import * as Nexus from "@valancex/nexus";

/** The platform has no history of its own: the engine keeps the list (`trail` and `cursor`). */
export interface NavigationOwner {
  readonly owner: "engine";
}

export const Navigation = Nexus.Capability.define<NavigationOwner>("valance/navigation");
