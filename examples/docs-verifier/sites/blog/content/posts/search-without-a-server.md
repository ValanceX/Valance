---
title: Search without a server
description: A site that is only files can still search itself, if the build leaves an index beside the pages.
date: 2026-02-20
author: Ada
tags: search, static
---

# Search without a server

A static site has no server to ask. The build writes an **index** beside the pages instead, one entry for each section, and the browser loads it the first time the reader types.

## The trade

| Where the work is | Static index | A search server |
|:--|:--|:--|
| Built | Once, with the site | Never |
| Asked | In the browser | On a machine |

That is enough for a few thousand sections. After that, a server earns its keep.
