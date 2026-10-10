#!/usr/bin/env bash
# Builds and packs the packages this verifier runs against when they are prepared but not published, into <directory> (default: ./.packs).
# Only the packages that changed are packed; with-local-packs.mjs takes the rest from the registry.
#
#   scripts/build-packs.sh [directory]
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
out="$(mkdir -p "${1:-$here/.packs}" && cd "${1:-$here/.packs}" && pwd)"

rm -f "$out"/valancex-nexus-*.tgz "$out"/valancex-valance-*.tgz "$out"/valancex-port-web-*.tgz
(cd "$here/../../../Nexus" && pnpm install --ignore-scripts --frozen-lockfile=false >/dev/null && pnpm build && npm pack --pack-destination "$out" >/dev/null)
(cd "$here/../../../Port/packages/port-web" && pnpm install --ignore-scripts >/dev/null && pnpm build && npm pack --pack-destination "$out" >/dev/null)
(cd "$here/../../packages/valance" && pnpm install --ignore-scripts >/dev/null && pnpm build && npm pack --pack-destination "$out" >/dev/null)
ls "$out"
