# What is VALANCE?

## The problem

An interactive application is easy to start and hard to keep correct. State ends up in the screen, in the URL, in a component, and in a server response, and those copies disagree. Handling an event, doing work, and changing what is shown get tangled until you cannot say what the application *is* without running it.

## The model

VALANCE keeps four things apart and connects them in one place:

```
   event on the screen                       what the person sees
          │                                          ▲
          ▼                                          │
       command  ──►  STATE  ──►  view(state)  ──►  scope  ──►  view description
   (the only writer)  (the truth)  (which view)   (the values)   (what it looks like)
```

- **State** is one value. It is the only truth.
- **Commands** are the only way to change it. Each takes validated input and produces the next state. A click, a URL change and a test all enter through the same commands.
- **A view** is a function of state. You say which view is current (`view(state)`), what values it needs (`scope(state)`), and what it looks like (a view description).
- **The screen** is drawn from the current view and kept up to date. It never changes state itself; it only reports events, and events run commands.

So the application is *data*: a definition you can start in a browser, render to HTML on a server, or drive headless in a test. Defining one starts nothing.

## What you write

| You write | In |
|---|---|
| The shape of state, and its starting value | a [Schema](https://effect.website/docs/schema/introduction/) (`state: { schema, initial }`) |
| What each view looks like | a view description (MPRX), compiled before you run |
| How each view's values come from state | `scope: (state) => ({ … })` |
| Which view is current | `view: (state) => "name"` |
| What each event does | `commands`: named, validated transitions |
| Where it is drawn | `Web.run` with a table of page elements |

## What VALANCE decides, and what it leaves to you

VALANCE decides **which view is current and whether showing it continues the previous screen** (same view: an update; different view: a fresh draw). It also keeps one lifetime per application, so resources are released exactly once.

You decide everything else: what state means, what a URL means, what to do when work fails. VALANCE has no router, no store you subscribe to, and no global application.

## Where next

[Your first application](first-application.md) builds the smallest one. When you need exact behavior, the [API reference](../use/README.md) and the [contract](../V1_CONTRACT.md) state it; [Understand](../understand/README.md) explains how it is built and why.
