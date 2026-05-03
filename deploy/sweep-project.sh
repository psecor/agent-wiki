#!/usr/bin/env bash
# Per-project sweep + reindex. Invoked by the Stop-hook async path
# (see sweep-on-stop.sh) and usable directly for ad-hoc sweeps:
#
#   <repo>/deploy/sweep-project.sh <project>
#
# Output is appended to ~/.local/state/agent-wiki/sweep-<project>.log.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: sweep-project.sh <project>" >&2
  exit 2
fi

PROJECT="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/../service" && pwd)"
STATE_DIR="${HOME}/.local/state/agent-wiki"
LOG="${STATE_DIR}/sweep-${PROJECT}.log"

mkdir -p "${STATE_DIR}"

if [[ -f "${SERVICE_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SERVICE_DIR}/.env"
  set +a
fi

cd "${SERVICE_DIR}"

{
  echo "=== sweep ${PROJECT}: $(date -Iseconds) ==="
  /usr/bin/node dist/sweeper/cli.js "${PROJECT}"
  echo ">>> indexer build"
  /usr/bin/node dist/indexer/cli.js build
  echo "=== done: $(date -Iseconds) ==="
  echo
} >> "${LOG}" 2>&1
