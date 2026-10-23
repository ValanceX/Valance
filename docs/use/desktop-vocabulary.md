# The desktop vocabulary

What a template may write when the target is a window (the [Desktop PORT](https://github.com/ValanceX/Port/tree/main/packages/port-desktop)). The same list, as data a build reads, is the PORT's `vocabulary.json`. To learn it by building something, start with [Your first desktop application](../learn/desktop-application.md).

## The components

The list is the [primitives reference](primitives.md), generated from the specifications: the **portable** primitives are the same on the window and the page, the **desktop-only** ones (the table and its parts) are the window's. Each has its role, how it is named, the states it carries, its props and events. The PORT's `vocabulary.json` and `content.json` are the same list as data, and the primitives' tests check them against the specifications.

## Not components

- **Repeating** a part: `{#each items as item (item.id)}` … `{/each}`. The part in parentheses must be different for each item.
- **Showing a part only sometimes**: `{#if flag}` … `{/if}`.
- **A different screen**: the application's `view` function chooses which screen shows; a route says where you are. See [your first desktop application](../learn/desktop-application.md#4-where-you-can-be-and-what-may-stop-you).

## What a screen reads and can do

Each screen is a component of its own, and it states two things in the application's manifest: the values it reads (its **scope**) and the commands it can run. A template can only use what is stated, and a mistake is an error that names the file and line.

## The window

There is no component for it. The window's title comes from the application (a function of its state: where you are), its size from the host, and whether it may close from the application's guards. The same is true of a page's title on the web.

## Naming rules

One word per thing, lower case. Events are few: **click** (a button), **dismiss** (a dialog or popover: the person asked to close it) and **change** (the value of a checkbox or a text field changed; it carries the new value). If a word you expected is missing (an image, a link, a divider), it is not built yet; the [investigation](../application-model/NATIVE-VOCABULARY.md#tiers) says what is planned and why.

## Where the web is different

The web's vocabulary is a different, larger table (26 tags, with `class`, `theme` and the like). A template written in this one can also run in a browser, with a realization table of eight entries; see [the investigation](../application-model/NATIVE-VOCABULARY.md#evidence).

## The content layer

For a site of Markdown pages, the PORT also draws what Markdown produces, named as WAI-ARIA names the same things (the names the [investigation](../application-model/NATIVE-VOCABULARY.md#decided-and-what-is-next) adopted).

| Component | Props | What it is |
|---|---|---|
| `heading` | `level` (1 to 3; optional) | a title for what follows (it is also in the table above) |
| `paragraph` | | a paragraph of text; strong, emphasis, code and links sit inside it |
| `list` | `ordered` (yes or no; optional) | a list; each item is a `listitem` |
| `listitem` | | one item of a list |
| `code` | | code: a box on its own, or monospace inside a run of text |
| `blockquote` | | a quotation |
| `image` | `src`, `label` | an image. Today its description is drawn instead of the picture |
| `strong`, `emphasis` | | important text, and stressed text |
| `link` | `href` | a link. It is an address with no event: activating it tells the application which address, and the application decides what it means |
