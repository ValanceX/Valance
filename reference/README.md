# Reference builds

Two repositories-to-be, built here as directories because the repositories cannot be created from this work (decision X7: the outside parties are deferred; the repositories themselves wait for an owner to create them). Each has its own `package.json`, lockfile, CI workflow files and licence, and installs from the registry only: no workspace link to this repository, no private seam. They are not part of this repository's workspace, lint or format.

| Directory | Becomes | What it is |
|---|---|---|
| `components/` | `ValanceX/Components` | the reference component library (Bet 12): `@valancex/ui` (four portable components), `@valancex/ui-web` (`badge`, web only), two theme packages, a terminal PORT, a playground, built as an outsider, with the boundary test and registry-only CI |
| `ecosystem-ci/` | `ValanceX/ecosystem-ci` | downstream CI (K16), seeded with the reference library and `acme-ui` |

`.github/workflows/` inside each directory is the workflow the repository will run once it is its own repository; GitHub does not run it from here.

Each directory keeps a `FRICTION.md` (K17). To move one out: `git subtree split --prefix=reference/components`, or copy the directory.

**Until the 0.15 release set is on npm** a registry-only lockfile cannot exist for `components/`; the branch carries it in one commit marked "DO NOT MERGE BEFORE THE RELEASES" (local tarballs, overrides, lockfile), which is reverted on the branch. After the release, `pnpm install` in `components/` writes the registry lockfile.
