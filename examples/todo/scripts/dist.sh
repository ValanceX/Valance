#!/usr/bin/env bash
# Builds the to-do desktop app for a platform and archives it: `scripts/dist.sh linux-x64|win32-x64`. Run on Linux. Needs: node 22, pnpm, a Rust toolchain; for win32-x64 also
# `rustup target add x86_64-pc-windows-gnu` and `gcc-mingw-w64-x86-64`. Writes out/<platform>/ (todo-desktop and todo-engine, side by side) and out/todo-<platform>.tar.gz or .zip.
set -euo pipefail

platform="${1:?usage: scripts/dist.sh linux-x64|win32-x64}"
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

case "$platform" in
  linux-x64) triple=x86_64-unknown-linux-gnu; renderer=todo-desktop ;;
  win32-x64) triple=x86_64-pc-windows-gnu; renderer=todo-desktop.exe ;;
  *) echo "unknown platform: $platform" >&2; exit 2 ;;
esac

pnpm build
node scripts/package.mjs "$platform"
(cd native && cargo build --release --locked --target "$triple")
cp "native/target/$triple/release/$renderer" "out/$platform/$renderer"

cd out
if [ "$platform" = win32-x64 ]; then
  rm -f "todo-$platform.zip"
  (cd "$platform" && zip -q -r "../todo-$platform.zip" .)
else
  tar -czf "todo-$platform.tar.gz" -C "$platform" .
fi
ls -la "$platform" todo-"$platform".*
