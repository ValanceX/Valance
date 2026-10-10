---
title: Getting Started
description: Install the packages, describe a view, and define and run the application.
---

# Getting Started

Install the packages, describe a view, and define the application.

## Install

```bash tab="npm" group="pkg"
npm install @valancex/valance @valancex/nexus @valancex/mesh-runtime @valancex/port-web effect
npm install --save-dev @valancex/mesh-compiler
```

```bash tab="pnpm" group="pkg"
pnpm add @valancex/valance @valancex/nexus @valancex/mesh-runtime @valancex/port-web effect
pnpm add --save-dev @valancex/mesh-compiler
```

```bash tab="yarn" group="pkg"
yarn add @valancex/valance @valancex/nexus @valancex/mesh-runtime @valancex/port-web effect
yarn add --dev @valancex/mesh-compiler
```

> [!TIP]
> The choice of package manager is remembered: pick one here and the other install commands in this site follow it.

## Describe a view

A view is an MPRX template compiled against a manifest, which lists the tags the template may use and what it reads and runs.

```ts file=snippets/counter-views.ts
```

## Define the application

State, one view with the scope that feeds it, and the commands that change the state.

```ts file=snippets/counter.ts
```

> [!NOTE]
> A command's name in the table is the name the template calls: `increment()` in the template runs `increment` here.

## Run it

Call `Web.run` with a container and the table that says which element each tag becomes.

```ts file=snippets/run-in-browser.ts
```

See [state and commands](/docs/guides/state) for what a command can do, and [views](/docs/guides/views) for how a template reaches it.
