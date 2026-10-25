# Components

The reference component library of VALANCE (Bet 12). It is written the way an outside author writes a library: from the published packages, with the documentation as the only guide, and it is the proof that the library tooling works without access to the framework's source.

| Package | What it is |
|---|---|
| `packages/ui` | `@valancex/ui`: four components of the portable core (`labeled-field`, `disclosure`, `tabs`, `data-list`), for the web and the desktop |
| `packages/ui-web` | `@valancex/ui-web`: `badge`, web only (it needs the stylesheet), to show the per-target diagnostic |
| `packages/theme-plain`, `packages/theme-contrast` | two theme packages: swap one for the other in `valance.json`, with no template change |
| `packages/port-terminal` | a third PORT: draws the portable core as text cells (Bet 12, K2) |
| `playground` | an application that uses all of the above the way a consumer does |

What is **not** here: a windowed list. It needs the `window` clause and the `scroller` primitive (Bet 10), which are not built; see `FRICTION.md` (F9).

## Run it

```
pnpm install
pnpm build
pnpm check          # vlx library check, in each library
pnpm test           # boundary, library, terminal, web (Chromium, the Nu Html Checker)
cd playground && pnpm exec vlx dev
```

The web tests need Chromium (`MESH_CHROMIUM` names one; otherwise Playwright's) and Java (the Nu Html Checker).

## The rules this repository keeps

* **Public seams only.** `tests/boundary.mjs` fails on an import of anything that is not a documented entry point, on a link or file dependency, and on a pnpm override that is not the registry. CI runs it first.
* **Registry only.** The lockfile resolves every `@valancex/*` package from npm. While a release is being prepared (not yet on npm), a branch may carry local tarballs in `pnpm-workspace.yaml`; the boundary test accepts that only with `ALLOW_LOCAL_PACKS=1`, and such a commit is marked "DO NOT MERGE BEFORE THE RELEASES".
* **Every friction is logged** in `FRICTION.md` with a severity, and a severity 3 is fixed or recorded as a decision.

## Reference Gate

This repository supplies what the gate needs from a library. It does **not** claim the gate: the two outside parties, the accessibility maintainer and the download check are deferred (decision X7).
