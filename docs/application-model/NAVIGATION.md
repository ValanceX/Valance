# Navigation across targets

**Decision (2026-10-15):** every part of navigation belongs to `@valancex/router`: the model of where the application has been, the moves along it, the guards that may refuse a move, and how it is kept between runs. A target does not invent its own; it realizes the router's model with what its platform already has. Where a platform has no equivalent of a move, the move is left unmapped, not imitated.

This note records what the platforms do (what could and could not be read from here is marked), the abstraction that covers them, and what is built.

## 1. What the platforms do

| | Web | Desktop (a window, no shared convention) | Mobile |
|---|---|---|---|
| **The stack** | Session history: entries, each with a URL and an optional serializable `state`; `pushState` adds, `replaceState` changes, `history.back()` / `forward()` / `go(n)` move. `popstate` fires on a move the page did not make itself; `history.state` is the current entry's. ([MDN, History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API), read through search results, not the page) | None of its own. Windows' guidance has a `Frame` keep a back and a forward stack, a back button at the top left that is **disabled when there is nothing to go back to**, and Alt+Left (and the Back key, the mouse's back button) as back. ([Microsoft, back navigation](https://learn.microsoft.com/en-us/windows/uwp/ui-input/back-navigation), from a search summary: the page itself could not be fetched here, and it is UWP-era guidance) | **Back only.** Android keeps a back stack of destinations; going back pops. Navigation 3 hands the application its back stack as data, and `rememberNavBackStack` keeps it through configuration change and process death if every key is `@Serializable` and a `NavKey`. ([Android, save navigation state](https://developer.android.com/guide/navigation/navigation-3/save-state), read) SwiftUI's `NavigationPath` can be encoded (`codable`) and restored, and its restoration has been reported to crash when what was saved no longer fits; the advice is to store identifiers, not models, and to resolve them against current data on restore. (Apple Developer Forums and community guides, via search results) |
| **Forward** | Yes | Yes, where the application offers it | **No** (push and pop only) |
| **Who may refuse a move** | The page, for its own moves; for the browser's Back and Forward the page can only undo after the fact (`history.go`) | The application | The application, for its own pops |
| **Who keeps it between runs** | The browser (session restore) | Nobody, unless the application does | The operating system's state restoration, from what the application hands it, which must be serializable |
| **Cancel / default keys** | n/a | Return is the default button and Escape the cancel button (SwiftUI documents both as the standard shortcuts: [KeyboardShortcut](https://developer.apple.com/documentation/swiftui/keyboardshortcut)); Apple's current guidance lists Escape as a rare shortcut people use to cancel | n/a |

Not verified from here, so not relied on: the keys for back and forward on macOS (a 1998 Apple guideline gives Option-Left and Option-Right for moving through location history; no current Apple page naming Command-[ and Command-] could be read), and Microsoft's WinUI 3 guidance (the pages read are UWP).

## 2. The abstraction

Three things are the same everywhere. The rest is the platform's.

1. **An ordered list of entries and a position in it.** An entry is a location the application can show, as plain serializable data (a route's name, params and query; for an application with pages, the page). This is Android's `NavKey` stack, SwiftUI's `NavigationPath`, and the web's session history.
2. **Four moves.** *Navigate* (add an entry after the current one and drop what was ahead), *replace* (change the current entry), and *traverse by a distance* (back is -1, forward is +1). A move that would leave the list does nothing.
3. **A question before each move.** May the application leave here, and enter there? The router's guards answer, and are told **why** the move is made: `link`, `programmatic`, `popstate` (the browser moved on its own), `history` (the application traverses its own list: Back and Forward on a target that has no browser), `initial`, or `close`.

What differs, and who owns it:

| Part | Web | Desktop | Mobile |
|---|---|---|---|
| The list | The browser's | The engine's (`trail` and `cursor` in the state) | The operating system's back stack, or the application's, mirrored |
| Back / Forward | `history.go(-1 / +1)`; the page's own Back and Forward buttons are the browser's | The framework's `back` and `forward` commands; Alt+Left and Alt+Right in the window | The system back gesture is `back`; there is no forward, so `canGoForward` is never true |
| Refusing a move | After the fact (the router already undoes a refused popstate by the exact distance) | Before it: a refused `back` changes nothing | Before it |
| Keeping it | Nothing to do: the browser restores | The engine saves the list through the `Store` and restores it **if it asked to** (`persist`) | Hand the list to the platform's restoration; restore through the same validation |
| A move with no equivalent | n/a | A shortcut with no equivalent on a platform is left unmapped | n/a |

**Restoring.** A list read back from storage is data from an earlier run, and the application may have changed since: an entry whose page or route no longer exists is dropped, the position follows the entry that was current (or the nearest that is left), and a list with nothing left starts again at the first page. This is the failure the SwiftUI reports describe; it is a fallback here, not a crash. On the web nothing is restored by the application: the address is the truth, and the browser keeps the list.

## 3. What is built

- `@valancex/router`: `History` (the pure list and its moves, including `restore`), the guard kind `"history"`, and `permit` (the guard runner, now public, with the rule that a guard that fails refuses).
- `@valancex/common`: `defineApp` keeps its `trail` and `cursor` with `History`, not its own arithmetic; `go`, `back` and `forward` ask an optional `guard` (the router's `Guard`) first, with kinds `programmatic` and `history`; `persist` may name `"navigation"` to keep the list between runs (a desktop choice; the web ignores it, since its browser owns the list).
- `@valancex/valance` (`Native.run`), the Desktop PORT and the Web table: Enter is `submit`, Escape is `cancel` on a text field, and the window's Alt+Left and Alt+Right traverse the list. These need the Desktop PORT's vocabulary and protocol to carry them, so they follow the PORT's next release (see `MULTI-TARGET-PLAN.md`).

Not built: the mobile adapter (there is no mobile target), a macOS binding for back and forward (above), and a router-owned `back` for the web (the browser's Back is already a `popstate` the router guards).
