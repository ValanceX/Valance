# @valancex/valance

The application-composition boundary over [NEXUS](https://github.com/ValanceX/Nexus) (behavior), [MESH](https://github.com/ValanceX/Mesh) (template semantics) and [PORT](https://github.com/ValanceX/Port) (target realization): one application, one NEXUS state, a view derived from it, MESH programs rendered to a PORT target.

```ts
import * as Valance from "@valancex/valance";           // define, start, mount, hydrate (+ ApplicationHandle, Mounted, TargetFactory)
import * as Web from "@valancex/valance/web";           // Web.target, Web.history        (needs @valancex/port-web)
import { renderToHtml } from "@valancex/valance/web/server";
```

- **Install** (a strict package manager resolves only what you declare, so declare the application-level and build-time packages yourself):

  ```console
  $ pnpm add @valancex/valance @valancex/nexus@^0.10.1 @valancex/mesh-runtime@^0.7.0 @valancex/port-web@^0.2.2 effect@^3.10.0
  $ pnpm add -D @valancex/mesh-compiler@^0.7.0
  ```

  | Package | Range | Role |
  |---|---|---|
  | `@valancex/valance` | the release you target | this package |
  | `@valancex/nexus` | `^0.10.1` | **application-level**: your commands, state handles and capabilities are written against it. Also this package's own dependency, so use the same range and one copy is shared |
  | `@valancex/mesh-runtime` | `^0.7.0` | peer: renders programs at run time |
  | `@valancex/port-web` | `^0.2.2` | optional peer: needed for `./web` and `./web/server` |
  | `effect` | `^3.10.0` | peer |
  | `@valancex/mesh-compiler` | `^0.7.0` | **build time only** (devDependency): compiles MPRX to the `program` each view takes |

- **Lifetimes:** the application, each mount and each history live in separate, caller-owned `Scope`s; closing one never closes another. Closing the application's `Scope` ends commits (state stays readable); mounts then end inert.
- **Presentation:** a mount presents committed state as a latest-state consumer: it may skip superseded intermediate states and converges on the latest. Same view is an `update`, another view a `draw`; `hydrate` takes over server markup and then behaves like `mount`. A mount's failure is local to it; recovery is a fresh mount.
- **History:** `Web.history` follows committed state and runs the application's own navigate command on popstate; it owns its listener's `Scope` only.
- **Status:** pre-1.0. `./internal` is the composition protocol for binding authors and tests, unstable by design.
- **The contract:** [`docs/V1_CONTRACT.md`](https://github.com/ValanceX/Valance/blob/main/docs/V1_CONTRACT.md) states what VALANCE guarantees, what the caller owns and what is not guaranteed. Engineering constraints: [`docs/CONSTRAINTS.md`](https://github.com/ValanceX/Valance/blob/main/docs/CONSTRAINTS.md). Historical investigation record: [`docs/FINDINGS.md`](https://github.com/ValanceX/Valance/blob/main/docs/FINDINGS.md). Release notes: [`docs/releases/v0.2.md`](https://github.com/ValanceX/Valance/blob/main/docs/releases/v0.2.md) (current), [`v0.1.md`](https://github.com/ValanceX/Valance/blob/main/docs/releases/v0.1.md).

MIT licensed.
