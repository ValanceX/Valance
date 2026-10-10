---
title: Getting started
description: Create the project, run it, change a page.
order: 1
---

# Getting started

## Run it

```
pnpm install
pnpm dev
```

Open the address `valance dev` prints. Edit this file and save: the page reloads with your change.

## Build it

```
pnpm build
```

The finished site is in `dist/`. Anything that serves files can host it.

## Where things are

1. `content/` holds the pages.
2. `src/layout.mprx` is the shell around every page.
3. `src/styles.css` is the look.
4. `public/` holds files that are served as they are, like the logo.

Next: [writing pages](./writing-pages.md).
