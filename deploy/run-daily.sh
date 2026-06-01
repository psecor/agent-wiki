#!/usr/bin/env bash
# Daily agent-wiki maintenance: sweep all projects against recent git activity,
# then rebuild the indexes (which also refreshes per-project backlinks blocks).
#
# Invoked by agent-wiki-sweeper.service via the matching .timer. Output is
# captured by systemd's journal AND tee'd to ~/.local/state/agent-wiki/last-run.log
# for quick at-a-glance access without `journalctl` ceremony.
#
# Run interactively to dry-test:
#   <repo>/deploy/run-daily.sh

set -euo pipefail

# Resolve SERVICE_DIR relative to this script's location so the path works
# regardless of where the repo is checked out.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/../service" && pwd)"
STATE_DIR="${HOME}/.local/state/agent-wiki"
LOG="${STATE_DIR}/last-run.log"

mkdir -p "${STATE_DIR}"

# Load .env so ANTHROPIC_API_KEY (and any other sweeper config) is available.
# The CLI also calls `dotenv/config`, so this is belt-and-suspenders for
# subprocesses launched outside Node.
if [[ -f "${SERVICE_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SERVICE_DIR}/.env"
  set +a
fi

cd "${SERVICE_DIR}"

# Resolve node from PATH so this works on macOS (Homebrew at /opt/homebrew/bin)
# and Linux (typically /usr/bin/node) without hardcoding a path.
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
if [[ -z "${NODE_BIN}" ]]; then
  echo "node not found on PATH" >&2
  exit 1
fi

{
  echo "=== agent-wiki daily run: $(date -Iseconds) ==="
  echo

  echo ">>> sweeper --all"
  "${NODE_BIN}" dist/sweeper/cli.js --all
  echo

  echo ">>> indexer build"
  "${NODE_BIN}" dist/indexer/cli.js build
  echo

  echo "=== done: $(date -Iseconds) ==="
} 2>&1 | tee "${LOG}"
