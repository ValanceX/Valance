# @valancex/valance

The application-composition boundary over [NEXUS](https://github.com/ValanceX/Nexus) (behavior), [MESH](https://github.com/ValanceX/Mesh) (template semantics) and [PORT](https://github.com/ValanceX/Port) (target realization): one application, one NEXUS state, a view derived from it, MESH programs rendered to a PORT target.

```ts
import * as Valance from "@valancex/valance";           // define, start, mount, hydrate (+ ApplicationHandle, Mounted, TargetFactory)
import * as Web from "@valancex/valance/web";           // Web.target, Web.history        (needs @valancex/port-web)
import { renderToHtml } from "@valancex/valance/web/server";
```

- **Compatibility set (0.1.0):** `@valancex/nexus` ^0.10.1 (a dependency); peers `@valancex/mesh-runtime` ^0.7.0, `@valancex/port-web` ^0.2.2 (optional, for the Web entries) and `effect` ^3.10.0.
- **Lifetimes:** the application lives in the caller's `Scope`; each mount lives in the caller's (separate) `Scope`.
- **Status:** pre-1.0. `./internal` is the composition protocol for binding authors and tests, unstable by design.
- **Architecture, ownership rules and evidence:** [`docs/FINDINGS.md`](https://github.com/ValanceX/Valance/blob/main/docs/FINDINGS.md) (see "Architectural checkpoint" and "Canonical lifecycle architecture"); constraints in [`docs/CONSTRAINTS.md`](https://github.com/ValanceX/Valance/blob/main/docs/CONSTRAINTS.md); release notes in [`docs/releases/v0.1.md`](https://github.com/ValanceX/Valance/blob/main/docs/releases/v0.1.md).

MIT licensed.
