---
title: Views
description: A view is an MPRX template: structure, bindings and intent, checked before it runs.
---

# Views

A view is written in MPRX, a small language that looks like the HTML and JSX you know. It has no code and no side effects: it can say what is on the screen and what a click *means*, and nothing else.

## A template

```mprx
<page>
  <text>Count: {count}</text>
  <button on.click={increment()}>Add one</button>
</page>
```

`{count}` reads the view's scope. `increment()` is a request: it names a command, and the application decides what it does.

## Composites

A template can use another template as a tag. Its props and the events it raises are *inferred* from how it is used, so there is no contract file to keep in step.

- `mesh-slot` places the caller's content, and `mesh-fill` fills a named slot.
- `mesh-each` repeats, `mesh-if` chooses, and `mesh-switch` picks one of several cases.
  - Each repeated item has a `key`, which is its identity across updates.
  - A conditional may have an else branch: its second child.

## Nothing is made up

A template draws the elements it names and no others. There is no wrapper around text, around a repeated item or around a block, so the page is exactly what the author wrote. See [plugins](/docs/guides/plugins) for how the tags themselves are supplied.
