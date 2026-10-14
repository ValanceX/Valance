# Contributing to Valance

Bug reports and pull requests are welcome on [GitHub](https://github.com/ValanceX/Valance/issues). This is how to work on Valance itself; to use it, start at the [README](README.md).

```console
$ pnpm install && pnpm build && pnpm typecheck && pnpm test
$ pnpm test:browser          # Chromium via Playwright
$ pnpm lint                  # oxlint (OXC); `pnpm format` writes the style, `pnpm format:check` is what CI runs
```

## Layout

| Path | Is |
|---|---|
| `packages/valance` | `@valancex/valance`: the composition boundary over NEXUS, MESH and PORT |
| `packages/common` | `@valancex/common`: what an application's `src/main.ts` imports |
| `packages/cli` | `@valancex/cli`: the `vlx` command and the build behind it |
| `examples/` | `docs-app` (the application model), `docs-site`, `tracer-web` (the contract suite), `docs-verifier` (the friction record) |
| `docs/` | the guides, the contract, and `application-model/` (the design record of the CLI) |

To try the CLI from a clone, `pnpm link --global` in `packages/cli`; the walkthrough is in [`docs/application-model/TRY-IT.md`](docs/application-model/TRY-IT.md).

## Windows

The same `pnpm` commands run in PowerShell or cmd. Git should check files out with LF endings (this repository's `.gitattributes` asks for it; tests compare file text, so `core.autocrlf=true` would otherwise hand them CRLF). Workspace links are directory junctions, which need no administrator rights. Scripts in the repository are Node scripts, not shell scripts; set an environment variable for one command with `$env:NAME = "value"; pnpm …` in PowerShell (`NAME=value pnpm …` in a POSIX shell).

## Releasing

The three packages share one version and are released by one `v*` tag ([`release.yml`](.github/workflows/release.yml)): `@valancex/valance`, then `@valancex/common`, then `@valancex/cli`, each depending on the one before. It runs all of CI on the tagged commit, and a manual run without `publish` is a dry run. The steps are in the current release set under [`docs/releases/`](docs/releases/).
