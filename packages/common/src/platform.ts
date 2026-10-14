// What a platform supplies the application: its capabilities, by contract. `Web.run` and `Native.run` each take one; the web's is `webPlatform` (`./http`), the desktop's is made in `./desktop`.
import * as Nexus from "@valancex/nexus";

/** A platform that supplies each `[capability, implementation]` given. */
export const platformOf = (capabilities: ReadonlyArray<readonly [{ readonly id: string }, unknown]>): Nexus.Application.Platform =>
  Nexus.Capability.EnvironmentLive(new Map(capabilities.map(([capability, implementation]) => [capability.id, { _tag: "Available" as const, implementation }])) as never);
