---
title: Introduction
description: Valance keeps an application's state in one place; the screen is a function of that state, and a command is the only way to change it.
---

# Introduction

Valance keeps an application's state in **one value**. The screen is a function of that state, and a command is the only way to change it.

> [!NOTE] About this site
> This site is the features verifier: it is built on the development branches of MESH, NEXUS, PORT and VALANCE to find where composing an application is still a chore.

## What you get

- State in **one value**, validated where it enters.
- Views written once, in MPRX, and drawn on the server and in the browser.
- Commands that can wait, with loading and failure as ordinary state.
- A head, a URL policy and a set of tags that arrive as *plugins*, so a site is composed rather than wired.

## How the pieces fit

| Package | Owns | Does not own |
|:--|:--|:--|
| MESH | The view language (MPRX), its compiler and runtime | Rendering, state |
| NEXUS | State, commands and capabilities | Any user interface |
| PORT | Drawing a view on a target, such as the browser | What a view means |
| VALANCE | Composing the three into an application | A router, a content pipeline, a server |

## Where to go next

Start with the [getting-started guide](/docs/guides/getting-started), then read about [state and commands](/docs/guides/state#commands), and how a site is [composed from plugins](/docs/guides/plugins).
