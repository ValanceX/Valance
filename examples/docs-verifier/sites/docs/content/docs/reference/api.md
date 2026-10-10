---
title: API
description: The names Valance exports, by entry.
---

# API

The names each entry exports.

## Core

Imported from `@valancex/valance`.

- `define` makes an application from state, views and commands.
- `start`, `mount` and `hydrate` run it.
- `command` makes a command; `command(state).waiting` makes one that waits.
- `isRefusal` and `ValanceError` tell work turned away by a closing application from a bug.

## Web

| Entry | Names |
|:--|:--|
| `@valancex/valance/web` | `run`, `target`, `history`, `link`, `textField`, `event`, and the PORT table helpers |
| `@valancex/valance/web/server` | `renderToHtml` |
| `@valancex/valance/web/build` | `manifest` |
| `@valancex/valance/web/plugin` | `Plugin`, `compose`, `renderHead`, `staticPaths`, and the types they use |

## Stability

1. **Stable**: in a release, changed only with a note in the release notes.
2. **Unreleased**: on the development branch.
3. **Provisional**: named so in the documentation.
4. **Internal**: not a contract.

> [!WARNING]
> `@valancex/valance/internal` is internal. It is the composition protocol for binding authors and tests, and may change in any release.
