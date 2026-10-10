---
title: One value is enough
description: Why an application's state is a single value, and what that buys a reader of the code.
date: 2026-03-12
author: Ada
tags: state, design
---

# One value is enough

An application with its state in **one value** has one place to look. Every screen is a function of that value, and a bug is a value that should not have been reachable.

## What it costs

Nothing is free. A single value means a change must say *which* part it changes, and a command that waits must say what the value looks like while it waits.

- Loading is a value, not a flag somewhere else.
- A failure is a value too.

## What it buys

The page you are reading was drawn from a value like that. The documentation site, which is built from the same parts, says the same thing from the other side: it is a function of one value too.
