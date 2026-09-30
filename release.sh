#!/usr/bin/env bash
# Build an immutable local install snapshot and a standard npm tarball.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
BASE="${DSG_RELEASE_DIR:-$SRC/dist}"
mkdir -p "$BASE"
REL="${1:-$(ls "$BASE" | sed -n 's/^r\([0-9][0-9]*\)$/\1/p' | sort -n | tail -1 | awk '{print $1 + 1}')}"
REL="${REL:-1}"
if [[ ! "$REL" =~ ^[1-9][0-9]*$ ]]; then
  echo 'release number must be a positive integer' >&2
  exit 1
fi
OUT="$BASE/r$REL"
# Existing installs must never be overwritten while a Host may still use them.
mkdir "$OUT"
cp -R "$SRC/host" "$SRC/locale" "$OUT/"
cp "$SRC/client.js" "$SRC/package.json" "$SRC/package-lock.json" \
  "$SRC/cordis.patch.yml" "$SRC/README.md" "$SRC/README.zh-CN.md" "$SRC/LICENSE" "$OUT/"
npm ci --prefix "$OUT" --ignore-scripts --omit=dev --no-audit --no-fund
# prepack runs the source regression suite before producing the distributable.
npm pack "$SRC" --pack-destination "$OUT"
echo "install snapshot: $OUT"
echo "package: $OUT/deepseek-harness-design-$(node -p "require('$SRC/package.json').version").tgz"
