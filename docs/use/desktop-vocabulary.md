# The desktop vocabulary

What a template may write when the target is a window (the [Desktop PORT](https://github.com/ValanceX/Port/tree/main/packages/port-desktop)). The same list, as data a build reads, is the PORT's `vocabulary.json`. To learn it by building something, start with [Your first desktop application](../learn/desktop-application.md).

## The components

| Component | Props (required unless marked) | Events | What it is |
|---|---|---|---|
| `window` | `title` (text) | | The top of a screen. Its title is the window's title. |
| `column` | | | Its children, one under the next. |
| `row` | | | Its children side by side, wrapping when the window is narrow. |
| `heading` | | | A title for what follows. |
| `text` | | | A run of text. Text is text: nothing in it is markup. |
| `button` | `disabled` (yes or no; optional) | `press` | Something to press. What is inside it is its label. A disabled button does nothing. |
| `checkbox` | `checked` (yes or no) | `toggle` | A box that is ticked or not. The application decides whether it is: a press reports `toggle`, and the box shows what comes back. |
| `textfield` | `value` (text), `placeholder` (text; optional) | `change` (the text) | A line of text the person edits. The person's typing wins until the application changes the value itself (a save, a clear). |

## Not components

- **Repeating** a part: `{#each items as item (item.id)}` … `{/each}`. The part in parentheses must be different for each item.
- **Showing a part only sometimes**: `{#if flag}` … `{/if}`.
- **A different screen**: the application's `view` function chooses which screen shows; a route says where you are. See [your first desktop application](../learn/desktop-application.md#4-where-you-can-be-and-what-may-stop-you).

## What a screen reads and can do

Each screen is a component of its own, and it states two things in the application's manifest: the values it reads (its **scope**) and the commands it can run. A template can only use what is stated, and a mistake is an error that names the file and line.

## Naming rules

One word per thing, lower case. Events say what a person does, not what device they used: **press**, **toggle**, **change**. If a word you expected is missing (an image, a link, a divider), it is not built yet; the [investigation](../application-model/NATIVE-VOCABULARY.md#tiers) says what is planned and why.

## Where the web is different

The web's vocabulary is a different, larger table (26 tags, with `class`, `theme` and the like). A template written in this one can also run in a browser, with a realization table of eight entries; see [the investigation](../application-model/NATIVE-VOCABULARY.md#evidence).
