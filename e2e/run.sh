#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE="${1:?usage: e2e/run.sh /absolute/path/deepseek-harness-design-0.5.4.tgz}"
APP="${DSG_HARNESS_APP:-/Applications/DeepSeek Harness.app}"
CLI="$APP/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js"
WORK="$(mktemp -d /tmp/deepseek-harness-design-e2e.XXXXXX)"
PORT="${DSG_E2E_PORT:-19401}"
CDP_PORT="${DSG_E2E_CDP:-19501}"
server_pid=''
chrome_pid=''
cleanup() {
  if [[ -n "$chrome_pid" ]]; then kill "$chrome_pid" 2>/dev/null || true; wait "$chrome_pid" 2>/dev/null || true; fi
  if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
}
trap cleanup EXIT
export DSH_HOME="$WORK/home"
export npm_config_store_dir="$WORK/pnpm-store"
dsh() { ELECTRON_RUN_AS_NODE=1 "$APP/Contents/MacOS/DeepSeek Harness" --expose-internals "$CLI" "$@"; }
dsh plugin --profile web add "$PACKAGE" > "$WORK/install.log" 2>&1
printf -- '- insert:\n    - id: designer-test-seed\n      name: "%s/e2e/test-seed/index.js"\n' "$SOURCE" > "$WORK/test-seed.patch.yml"
HOST_MODULE="$DSH_HOME/profiles/web/node_modules/deepseek-harness-design/host/index.js"
DSG_E2E_HOST_MODULE="file://$HOST_MODULE" dsh --profile web --patch "$WORK/test-seed.patch.yml" --no-open --port "$PORT" > "$WORK/server.log" 2>&1 &
server_pid=$!
ready=false
for ((i=0; i<60; i++)); do
  if rg -q "http://127.0.0.1:$PORT/\?token=" "$WORK/server.log"; then ready=true; break; fi
  if ! kill -0 "$server_pid" 2>/dev/null; then echo "Harness exited; diagnostics: $WORK/server.log" >&2; exit 1; fi
  sleep 1
done
if [[ "$ready" != true ]]; then echo "Harness startup timed out; diagnostics: $WORK/server.log" >&2; exit 1; fi
rg -o "http://127.0.0.1:$PORT/\?token=[A-Za-z0-9_-]*" "$WORK/server.log" | head -1 > "$WORK/appurl.txt"
chmod 600 "$WORK/appurl.txt"
'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  --headless=new --disable-gpu --remote-debugging-port="$CDP_PORT" \
  --user-data-dir="$WORK/chrome-profile" about:blank > "$WORK/chrome.log" 2>&1 &
chrome_pid=$!
DSG_E2E_PORT="$PORT" DSG_E2E_CDP="$CDP_PORT" DSG_E2E_OUT_DIR="$WORK" node "$SOURCE/e2e/e2e.cjs"
echo "Browser artifacts: $WORK"
