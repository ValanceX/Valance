---
title: Writing pages
description: Front matter, headings, links and images.
order: 2
---

# Writing pages

A page starts with an optional block of settings, then Markdown.

## Front matter

`title`, `description` and `order` are the three settings. Without a `title`, the first `#` heading is used.

> Anything else in the front matter is an error, so a typo never goes unnoticed.

## Links and images

Link to another page by its address, like [Getting started](/guide/getting-started), or by its file, like [the first page](./getting-started.md). A link that leads nowhere fails the build and names the line.

Images live in `public/` and are named from the site's root: `![Alt text](/logo.svg)`.
