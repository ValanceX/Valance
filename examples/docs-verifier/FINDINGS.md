# Findings (friction log)

| # | Finding | Area |
|---|---------|------|
| F1 | Valance `manifest()` does not derive composites or `mesh-slot`; `views/composites.json` is hand-written. | Valance |
| F2 | `mesh-slot` must be declared in the manifest by hand. | Valance/Mesh |
| F3 | No inline marks (bold, code, links in text); text is plain. | Mesh |
| F4 | Lists flatten to `item` blocks with a bullet character. | Mesh |
| F5 | Valance 0.6.0 redraws the whole tree; `update`/`patch` are verified directly only. | Valance |
| F6 | Kind dispatch needs seven sibling `mesh-if`s; no switch/else. | Mesh |
| F7 | One unnamed slot per template; a layout gets one region. | Mesh |
| F8 | Copy-to-clipboard needs a platform capability; not implemented. | Port |
| F9 | No on-page TOC (no anchor/scroll support). | Port |
| F10 | No search in the slice. | App |
| F11 | Dev checkouts need sibling `link:` overrides. | Tooling |
