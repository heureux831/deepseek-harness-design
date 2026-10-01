#!/usr/bin/env bash
# Build a version-unique, immutable install snapshot and npm tarball.
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
exec node "$SRC/scripts/release.mjs" "$@"
