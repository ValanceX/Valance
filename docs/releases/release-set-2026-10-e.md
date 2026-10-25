# Release set: VALANCE 0.13.0, the VALANCE extension 0.1.0, and what they need

Prepared 2026-10-15; **VALANCE 0.13.0 is released** (tag `v0.13.0`, on npm 2026-10-15; `@valancex/router` 0.13.1 followed on 2026-10-16, see [the 0.14 notes](./v0.14.md#valancexrouter-0131)). The next set is [`release-set-2026-10-f.md`](./release-set-2026-10-f.md). The earlier set ([`release-set-2026-10-d.md`](./release-set-2026-10-d.md): VALANCE 0.12.0) is released. **Everything this set needs from PORT is already released**: `@valancex/port-web` 0.6.1 and `@valancex/port-desktop-vocabulary` 0.6.1 are on npm. Nothing in NEXUS or MESH changes.

| # | Repository | What | Kind | Tag | Notes file |
|---|---|---|---|---|---|
| 1 | Valance | `@valancex/valance` 0.13.0, `@valancex/common` 0.13.0, `@valancex/cli` 0.13.0, `@valancex/router` 0.13.0 | minor: the desktop target and more than one target, navigation in the router, `Store` / `Open` / `persist`, keys, `LICENSE` | `v0.13.0` | `docs/releases/v0.13.md` |
| 2 | Valance | the VALANCE extension (`editors/vscode`) 0.1.0 | first release; independent of the packages above | `vscode-v0.1.0` | `editors/vscode/CHANGELOG.md` |
| 3 | Port | `valancex-port-desktop` 0.1.0 (the crate, with `vlx-window`) | first release; **optional for this set** | `desktop-v0.1.0` | `CHANGELOG.md` (Port repository), the `[0.1.0]` entry |

Rows 1 and 2 are independent and can go in either order; row 1 first is natural, since the extension reads the files `vlx` 0.13 writes (`.valance/editor.json` listing every target) and reads the single-target shape an older `vlx` wrote. Row 3 is the only release this set cannot finish without a secret the repository does not have (see below), and the packages work without it: the window is built from the PORT's source until it is published.

## 1. VALANCE 0.13.0

One tag, one workflow ([`release.yml`](../../.github/workflows/release.yml)): all of CI on the tagged commit, the four packages packed, then published to npm with provenance **in dependency order** (`valance`, `common`, `cli`, `router`), and a GitHub release with the four tarballs. The workflow refuses a tag that is not `v` + the packages' common version. It needs the `NPM_ACCESS_TOKEN` secret (an npm granular access token for the `@valancex` organisation; it expires).

Before tagging: merge the release PR; check `npm view @valancex/valance@0.13.0 version` is a 404 (not yet published).

After the tag:

1. Check on the registry: `npm view @valancex/valance@0.13.0 @valancex/common@0.13.0 @valancex/cli@0.13.0 @valancex/router@0.13.0 version`.
2. In an empty directory: `npm install -g @valancex/cli && vlx init demo --web --desktop --yes && cd demo && npm run build`; the project passes `vlx check` and `tsc --noEmit`, and `dist/web/` and `dist/desktop/` exist.
3. Mark the notes "released" (`docs/releases/v0.13.md`, this file, the Provisional rows in `docs/stability.md`).

## 2. The VS Code extension 0.1.0

One tag, [`release-vscode.yml`](../../.github/workflows/release-vscode.yml): all of CI (which runs the extension in a real VS Code, 1.90.0 and the current stable), the `.vsix`, a GitHub release carrying it, then the Visual Studio Marketplace and Open VSX. Things only the owner can do, **before the first publication**:

1. **The publisher.** Create (or confirm) the publisher `valancex` on the Visual Studio Marketplace (https://marketplace.visualstudio.com/manage) and the namespace `valancex` on Open VSX (https://open-vsx.org); the extension id will be `valancex.valance`. **The extension's `name` (`valance`) cannot change once published**, so confirm it first.
2. **The Marketplace, with Microsoft Entra ID (no token).** Global Azure DevOps Personal Access Tokens are retired, so the workflow stores none. Done once: a GitHub **environment** `github-actions-vscode-publish` (restrict its deployment branches and tags to the trusted branch and `vscode-v*`); an Entra app with a **federated credential** whose subject is that environment of this repository; the app's service principal added as a **member of the publisher** `valancex`; and the repository **variables** `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`. The `publish` job signs in with `azure/login` and runs `vsce publish --azure-credential`; `vsce` 3.9.2 (the locked version) has no `--oidc`, so the Marketplace's own trusted publishing is not used.
   - **Before the first release, run the smoke test:** Actions > "Release the VS Code extension" > Run workflow, from the trusted branch, with `verify_auth` ticked and `publish` unticked. It signs in through the same environment and runs `vsce verify-pat valancex --azure-credential`; it never publishes, tags or releases. Only a green run shows the federation works.
3. **Open VSX, with a token for now.** Secret `OVSX_PAT` (an Open VSX access token for the namespace `valancex`); without it Open VSX is skipped with a warning. Open VSX trusted publishing can replace it once a trusted publisher is registered for the namespace (https://open-vsx.org/user-settings/trusted-publishers) and checked.
4. **Optionally an icon.** The package has none (a listing is fine without; it shows a default). `"icon": "icon.png"` (128 by 128 or larger) in `editors/vscode/package.json`, and `!icon.png` in `.vscodeignore`.

The Marketplace step fails the release if the Entra sign-in fails; Open VSX without `OVSX_PAT` is skipped with a warning. The `vsce` flags were checked against the locked `@vscode/vsce` 3.9.2; the Microsoft pages could not be fetched from the authoring environment, so the smoke test is the check.

After the tag: install the `.vsix` from the GitHub release in a clean VS Code (`code --install-extension valance-0.1.0.vsix`), open a project (`vlx init demo --web`), and check the status bar says `VALANCE` and a misspelt tag in `src/layout.mprx` is underlined.

## 3. The Desktop PORT crate (optional)

Prepared in the PORT repository: its `CHANGELOG.md` (`[0.1.0]`), `cargo package` verified, and [`release-desktop.yml`](https://github.com/ValanceX/Port/blob/main/.github/workflows/release-desktop.yml) on the tag `desktop-v0.1.0`: all of CI (Linux and Windows), `vlx-window` built for both and attached to a GitHub release with its SHA-256, and `cargo publish`. Needs a crates.io API token as the `CARGO_REGISTRY_TOKEN` secret (a crate name is claimed on first publish: confirm `valancex-port-desktop`); without it the release and the binaries are made and the publish is skipped with a warning. Until it is published everything above works: the window is `cargo install --git https://github.com/ValanceX/Port valancex-port-desktop --bin vlx-window`.

After it is published, change the install line in `README.md`, `packages/cli/README.md`, `docs/releases/v0.13.md` and the message `vlx dev` prints when it finds no window (`packages/cli/src/dev-desktop.ts`) to `cargo install valancex-port-desktop --bin vlx-window` (a patch release of `@valancex/cli`), or to the prebuilt `vlx-window` from the release.
