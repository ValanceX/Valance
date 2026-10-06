# VALANCE documentation

VALANCE (`@valancex/valance`) is for building an interactive application whose **state lives in one place**, whose **screen is a function of that state**, and whose **only way to change anything is a command**. The same application runs in a browser, renders to HTML on a server, and runs headless in a test, because none of those is part of its definition.

The documentation has three levels. Start at the first and go down only when you need to.

| Level | For | Start here |
|---|---|---|
| **1. Learn** | Understanding the model and building your first application. Uses VALANCE's own words only. | [`learn/`](learn/README.md) |
| **2. Use** | Exact API, options, behavior, lifecycle, failure and what is *not* promised. | [`use/`](use/README.md), then the [contract](V1_CONTRACT.md) |
| **3. Understand** | Why it is built this way, and the evidence: architecture, constraints, investigation record, and the three packages underneath. | [`understand/`](understand/README.md) |

## I want to…

| I want to… | Go to |
|---|---|
| know what VALANCE is and what problem it solves | [What is VALANCE?](learn/what-is-valance.md) |
| build the smallest working application | [Your first application](learn/first-application.md) |
| wait for data, cancel it, or show loading and failure | [Async work](learn/async-work.md) |
| run something when the application starts | [Startup work](learn/startup-work.md) |
| draw the application, hydrate server HTML, or render on a server | [Mounting and hydration](learn/mounting-and-hydration.md) |
| see how state, view and events fit together | [State, views and events](learn/state-views-events.md) |
| see a whole, runnable application (links, search, titles, SSR, hydration) | [`examples/docs-site`](../examples/docs-site) |
| do a common task (add a view, a command, a resource, URLs, server rendering) | [Common tasks](learn/README.md#common-tasks) |
| look up exactly what an API does, and what happens when it fails | [API reference](use/README.md) |
| know what VALANCE guarantees, and what it does not | [The contract](V1_CONTRACT.md) |
| understand how it is implemented, and why | [Understand](understand/README.md) |
| find the evidence behind a design decision | [Concept → evidence](understand/README.md#from-a-concept-to-its-evidence) |
| install it, with the right package versions | [Installation](V1_CONTRACT.md#13-installation-and-package-surface) |
| see what changed in a release | [`releases/`](releases/) |

## Where the files are

| Level | Files |
|---|---|
| Learn | `docs/learn/*` |
| Use | `docs/use/README.md` (index) and `docs/V1_CONTRACT.md` (the reference itself) |
| Understand | `docs/understand/README.md` (index), `docs/CONSTRAINTS.md`, `docs/FINDINGS.md` |
| Releases | `docs/releases/*` |

`V1_CONTRACT.md`, `CONSTRAINTS.md` and `FINDINGS.md` stay where they are: they are cited by name from the source, the tests and earlier releases.
