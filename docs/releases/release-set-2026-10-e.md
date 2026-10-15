# Release set: VALANCE 0.13.0, the VALANCE extension 0.1.0, and what they need

Prepared 2026-10-15. Nothing is tagged or published. The earlier set ([`release-set-2026-10-d.md`](./release-set-2026-10-d.md): VALANCE 0.12.0) is released. **Everything this set needs from PORT is already released**: `@valancex/port-web` 0.6.1 and `@valancex/port-desktop-vocabulary` 0.6.1 are on npm. Nothing in NEXUS or MESH changes.

| # | Repository | What | Kind | Tag | Notes file |
|---|---|---|---|---|---|
| 1 | Valance | `@valancex/valance` 0.13.0, `@valancex/common` 0.13.0, `@valancex/cli` 0.13.0, `@valancex/router` 0.13.0 | minor: the desktop target and more than one target, navigation in the router, `Store` / `Open` / `persist`, keys, `LICENSE` | `v0.13.0` | `docs/releases/v0.13.md` |
| 2 | Valance | the VALANCE extension (`editors/vscode`) 0.1.0 | first release; independent of the packages above | `vscode-v0.1.0` | `editors/vscode/CHANGELOG.md` |
| 3 | Port | `valancex-port-desktop` 0.1.0 (the crate, with `vlx-window`) | first release; **optional for this set** | `desktop-v0.1.0` | `CHANGELOG.md` (Port repository), the `[0.1.0]` entry |

Rows 1 and 2 are independent and can go in either order; row 1 first is natural, since the extension reads the files `vlx` 0.13 writes (`.valance/editor.json` listing every target) and reads the single-target shape an older `vlx` wrote. Row 3 is the only release this set cannot finish without a secret the repository does not have (see below), and the packages work without it: the window is built from the PORT's source until it is published.

## 1. VALANCE 0.13.0

One tag, one workflow ([`release.yml`](../../.github/workflows/release.yml)): all of CI on the tagged commit, the four packages packed, then published to npm with provenance **in dependency order** (`valance`, `common`, `cli`, `router`), and a GitHub release with the four tarballs. The workflow refuses a tag that is not `v` + the packages' common version. It stores **no token**: it publishes with npm **trusted publishing** (OIDC). Once, per package (`@valancex/valance`, `common`, `cli`, `router`), on npmjs.com: the package's **Settings > Trusted Publisher > GitHub Actions**, with organization `ValanceX`, repository `Valance`, workflow filename `release.yml` (it must match exactly, `.yml` included) and no environment. The workflow runs Node 24 with npm 11.5.1 or later and `id-token: write`; provenance is attached automatically. A package that does not exist yet cannot have a trusted publisher, so its first version would be published by hand (all four exist). The same is true of Port's two packages (`@valancex/port-web`, `@valancex/port-desktop-vocabulary`, repository `Port`, workflow `release.yml`) for the next PORT release.

Before tagging: merge the release PR; check `npm view @valancex/valance@0.13.0 version` is a 404 (not yet published).

After the tag:

1. Check on the registry: `npm view @valancex/valance@0.13.0 @valancex/common@0.13.0 @valancex/cli@0.13.0 @valancex/router@0.13.0 version`.
2. In an empty directory: `npm install -g @valancex/cli && vlx init demo --web --desktop --yes && cd demo && npm run build`; the project passes `vlx check` and `tsc --noEmit`, and `dist/web/` and `dist/desktop/` exist.
3. Mark the notes "released" (`docs/releases/v0.13.md`, this file, the Provisional rows in `docs/stability.md`).

## 2. The VS Code extension 0.1.0

One tag, [`release-vscode.yml`](../../.github/workflows/release-vscode.yml): all of CI (which runs the extension in a real VS Code, 1.90.0 and the current stable), the `.vsix`, a GitHub release carrying it, then the Visual Studio Marketplace and Open VSX. Things only the owner can do, **before the first publication**:

1. **The publisher.** Create (or confirm) the publisher `valancex` on the Visual Studio Marketplace (https://marketplace.visualstudio.com/manage) and the namespace `valancex` on Open VSX (https://open-vsx.org); the extension id will be `valancex.valance`. **The extension's `name` (`valance`) cannot change once published**, so confirm it first.
2. **The Marketplace, without a token.** Global Azure DevOps Personal Access Tokens are retired (the Marketplace points to Microsoft Entra ID instead), so the workflow stores none. Choose one, and set it up once:
   - **Entra ID** (what the Marketplace's publishing page describes). Register an app in Microsoft Entra ID, give it a **federated credential** for GitHub Actions (organization `ValanceX`, repository `Valance`, an entity such as the tag pattern or an environment: the credential's subject must match what GitHub sends), add its service principal as a **member of the publisher** `valancex` (Marketplace > publisher > Members), and set the repository **variables** `AZURE_CLIENT_ID` and `AZURE_TENANT_ID`. The workflow signs in with `azure/login` and runs `vsce publish --azure-credential`. A manual first run with `publish` unset prints nothing secret and fails clearly if the identity is not yet a member.
   - **or the Marketplace's trusted publishing** (`vsce publish --oidc`, in `@vscode/vsce` 4): configure a trusted publishing policy for repository `ValanceX/Valance` and workflow `release-vscode.yml` where the Marketplace offers it, and set the repository variable `VSCE_OIDC` to `true`. (Reports in other projects say the Marketplace backend for this was not complete when `vsce` 4.0.0 shipped: try it, and fall back to Entra ID.)
3. **Open VSX, without a token.** Register a **trusted publisher** for the namespace `valancex` at https://open-vsx.org/user-settings/trusted-publishers (repository `ValanceX/Valance`, workflow `release-vscode.yml`). The workflow runs `ovsx publish --trusted-publishing` (`ovsx` 1.2.0), which exchanges the workflow's OIDC token for a short-lived credential. Nothing to set in GitHub.
4. **Optionally an icon.** The package has none (a listing is fine without; it shows a default). `"icon": "icon.png"` (128 by 128 or larger) in `editors/vscode/package.json`, and `!icon.png` in `.vscodeignore`.

A destination that is not set up is skipped with a warning; the GitHub release is made either way. Everything here was checked against the published `@vscode/vsce` 4.0.0 and `ovsx` 1.2.0 packages (their flags and READMEs), not against the Microsoft pages, which could not be fetched from the authoring environment: read the publishing page once more before the first run.

After the tag: install the `.vsix` from the GitHub release in a clean VS Code (`code --install-extension valance-0.1.0.vsix`), open a project (`vlx init demo --web`), and check the status bar says `VALANCE` and a misspelt tag in `src/layout.mprx` is underlined.

## 3. The Desktop PORT crate (optional)

Prepared in the PORT repository: its `CHANGELOG.md` (`[0.1.0]`), `cargo package` verified, and [`release-desktop.yml`](https://github.com/ValanceX/Port/blob/main/.github/workflows/release-desktop.yml) on the tag `desktop-v0.1.0`: all of CI (Linux and Windows), `vlx-window` built for both and attached to a GitHub release with its SHA-256, and `cargo publish`. The first publish of a crate cannot use trusted publishing (the crate must exist to have a trusted publisher): it needs a one-off crates.io API token as the `CARGO_REGISTRY_TOKEN` secret (confirm the name `valancex-port-desktop`, which is claimed then). After that, register a **trusted publisher** for the crate on crates.io (repository `ValanceX/Port`, workflow `release-desktop.yml`), delete the secret, and later releases need none. Without either, the release and the binaries are made and the publish is skipped with a warning. Until it is published everything above works: the window is `cargo install --git https://github.com/ValanceX/Port valancex-port-desktop --bin vlx-window`.

After it is published, change the install line in `README.md`, `packages/cli/README.md`, `docs/releases/v0.13.md` and the message `vlx dev` prints when it finds no window (`packages/cli/src/dev-desktop.ts`) to `cargo install valancex-port-desktop --bin vlx-window` (a patch release of `@valancex/cli`), or to the prebuilt `vlx-window` from the release.
