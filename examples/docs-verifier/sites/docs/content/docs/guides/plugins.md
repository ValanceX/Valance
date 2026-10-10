---
title: Plugins
description: A plugin is a value that adds tags, capabilities, a URL policy or a head. Nothing registers on import.
---

# Plugins

Valance has no router, content pipeline, static generator, dev server or server adapter. It has *seams*, so those can be packages that you pass in, without rewiring the application.

## A plugin is a value

```ts file=snippets/a-plugin.ts
```

A plugin has a `name` and any of `primitives`, `platform`, `routes` and `head`. It has no view, state, command or lifecycle of its own, and it does nothing until you pass it in `plugins`.

## Compose them

The same plugins drive the server and the browser, so the document the server writes and the page the browser keeps say the same thing.

```ts file=snippets/compose-plugins.ts
```

> [!TIP] Static first
> `renderToHtml` returns the head with the HTML. A static export writes it once per page; a server writes it per request. The application does not change.

## When two plugins disagree

| Seam | Declared | If two parties declare it |
|:--|:--|:--|
| Tags | Once | An error, naming both owners |
| URL policy | Once | An error, naming both owners |
| Capabilities | In order | The later one wins |
| Head | In order | The first title wins; a meta or link is not repeated |

Read the [API reference](/docs/reference/api) for the names, and [errors](/docs/reference/errors#composition) for the codes.
