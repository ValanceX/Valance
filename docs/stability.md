# API stability

What each public surface of VALANCE promises. The tiers have one meaning each, shared with MESH and NEXUS.

| Tier | Meaning |
|---|---|
| **Stable** | In a released version. VALANCE is pre-1.0, so a minor version may change it, but only with the change named in that version's release notes, never silently. |
| **Unreleased** | On the development branch and not in any release. May change before one. |
| **Provisional** | Named so in the documentation. |
| **Internal** | Not a contract. Exists for binding authors and tests; may change in any release without notice. |

## By surface

| Entry | Tier |
|---|---|
| `@valancex/valance` (`define`, `start`, `mount`, `hydrate`, `command`, `entry` and their types) | Stable |
| `@valancex/valance/web` (`Web.target`, `Web.history`, `Web.run`, `Web.link`, `Web.event`, the PORT table helpers) | Stable |
| `@valancex/valance/web/server` (`renderToHtml`) | Stable |
| `@valancex/valance/web/build` (`manifest` and its helpers) | Stable |
| `@valancex/valance/internal` | **Internal**: the composition protocol for binding authors and tests, unstable by design |
| `ValanceError`, `ValanceErrorCode`, `isValanceError`, `isRefusal` (the defects' stable `code`s) (since 0.6.0) | Stable |
| A start-time command's failure is **logged** (`Effect.logError`, message `start-time work failed`, with the whole cause) (since 0.6.0) | Stable |
| A finished event dispatch leaves a mount's `pending` list at once (since 0.6.0) | Stable (observable only through memory and the tracer tests) |
| `Target.patch` (optional): a later render of the same view reaches a target that has it as MESH's patches, and `update` otherwise (since 0.7.0) | Stable |

## What is logged

VALANCE writes to Effect's logger in two places: a failed popstate or link navigation (C28) and a start-time command that fails (C35). Both log **the whole `Cause`**, which includes whatever the failing command's errors carry. VALANCE does not inspect or redact it: an application whose errors can hold secrets or personal data keeps them out of the errors it lets escape a command, or installs a logger that redacts. A failure the application wants the user to see is state, not a log line.
