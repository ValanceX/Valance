# @valancex/valance

Build an interactive application whose state lives in one place, whose screen is a function of that state, and whose only way to change anything is a command. One application, one state, a view derived from it, drawn in a page, on a server, or not at all. (Built on [NEXUS](https://github.com/ValanceX/Nexus), [MESH](https://github.com/ValanceX/Mesh) and [PORT](https://github.com/ValanceX/Port); you do not need to know them to start.)

**Documentation:** [Learn](https://github.com/ValanceX/Valance/blob/main/docs/learn/README.md) (start here) · [Use](https://github.com/ValanceX/Valance/blob/main/docs/use/README.md) (API reference and the contract) · [Understand](https://github.com/ValanceX/Valance/blob/main/docs/understand/README.md) (architecture and evidence).

```ts
import * as Valance from "@valancex/valance";           // define, command, entry, start, mount, hydrate, isRefusal (+ ApplicationHandle, Mounted, TargetFactory)
import * as Web from "@valancex/valance/web";           // Web.run, Web.target, Web.history   (needs @valancex/port-web)
import { renderToHtml } from "@valancex/valance/web/server";
import { manifest } from "@valancex/valance/web/build";   // build time: derives the MESH manifest from your primitives, scopes and commands
```

- **Install** (a strict package manager resolves only what you declare, so declare the application-level and build-time packages yourself):

  ```console
  $ pnpm add @valancex/valance @valancex/nexus@^0.11.0 @valancex/mesh-runtime@^0.9.0 @valancex/port-web@^0.3.0 effect@^3.10.0
  $ pnpm add -D @valancex/mesh-compiler@^0.9.0
  ```

  | Package | Range | Role |
  |---|---|---|
  | `@valancex/valance` | the release you target | this package |
  | `@valancex/nexus` | `^0.11.0` | **application-level**: your commands, state handles and capabilities are written against it. Also this package's own dependency, so use the same range and one copy is shared |
  | `@valancex/mesh-runtime` | `^0.8.0 \|\| ^0.9.0` | peer: renders programs at run time (the one runtime: NEXUS 0.11 shares it) |
  | `@valancex/port-web` | `^0.3.0` | optional peer: needed for `./web` and `./web/server` |
  | `effect` | `^3.10.0` | peer |
  | `@valancex/mesh-compiler` | `^0.9.0` | **build time only** (devDependency): compiles MPRX to the `program` each view takes (`compileProgram`) |

- **Async work and startup:** a command can wait; once admitted it belongs to the application, and closing the application cancels it. Loading and failure are ordinary state; `command(state).waiting` writes a Promise-shaped one without NEXUS or Effect (added in 0.5.0). The optional `start` field of `define` names a command the application runs once when it starts (added in 0.4.0). See [Async work](https://github.com/ValanceX/Valance/blob/main/docs/learn/async-work.md) and [Startup work](https://github.com/ValanceX/Valance/blob/main/docs/learn/startup-work.md).
- **Lifetimes:** the application, each mount and each history live in separate, caller-owned `Scope`s; closing one never closes another. Closing the application's `Scope` ends commits (state stays readable); mounts then end inert.
- **Presentation:** a mount presents committed state as a latest-state consumer: it may skip superseded intermediate states and converges on the latest. Same view is an `update`, another view a `draw`; `hydrate` takes over server markup and then behaves like `mount`. A mount's failure is local to it; recovery is a fresh mount.
- **History:** `Web.history` follows committed state and runs the application's own navigate command on popstate; it owns its listener's `Scope` only.
- **Refusals:** work turned away because the application is closing is a defect with a stable code; `isRefusal(defect)` tells it from a bug.
- **Status:** pre-1.0. `./internal` is the composition protocol for binding authors and tests, unstable by design.
- **The contract:** [`docs/V1_CONTRACT.md`](https://github.com/ValanceX/Valance/blob/main/docs/V1_CONTRACT.md) states what VALANCE guarantees, what the caller owns and what is not guaranteed. Engineering constraints: [`docs/CONSTRAINTS.md`](https://github.com/ValanceX/Valance/blob/main/docs/CONSTRAINTS.md). Historical investigation record: [`docs/FINDINGS.md`](https://github.com/ValanceX/Valance/blob/main/docs/FINDINGS.md). Release notes: [`docs/releases/v0.5.md`](https://github.com/ValanceX/Valance/blob/main/docs/releases/v0.5.md) (current), [`v0.4.md`](https://github.com/ValanceX/Valance/blob/main/docs/releases/v0.4.md), [`v0.3.md`](https://github.com/ValanceX/Valance/blob/main/docs/releases/v0.3.md), [`v0.2.1.md`](https://github.com/ValanceX/Valance/blob/main/docs/releases/v0.2.1.md), [`v0.2.md`](https://github.com/ValanceX/Valance/blob/main/docs/releases/v0.2.md), [`v0.1.md`](https://github.com/ValanceX/Valance/blob/main/docs/releases/v0.1.md).

MIT licensed.
