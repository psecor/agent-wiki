#!/usr/bin/env bash
# Claude Code Stop-hook target: when an agent session ends, fire a
# per-project sweep for the project the session was working in.
#
# Wired into ~/.claude/settings.json as a Stop hook entry. Reads the
# hook payload (JSON) on stdin, extracts cwd, and:
#   1. Skips silently if cwd isn't under PROJECTS_ROOT or the project
#      has no AGENTS.md.
#   2. Skips if a sweep was already kicked off in the last 60 min
#      (debounce — Stop fires every turn during active dev).
#   3. Otherwise fires sweep-project.sh asynchronously via systemd-run
#      so the Stop hook returns immediately and never blocks the agent.
#
# All hook scripts must exit 0 quickly: failures here must NOT break
# the user's Claude session, so we swallow errors and log them.
#
# Set PROJECTS_ROOT in the environment (or via service/.env, which is
# sourced below) to point at the parent dir of the projects you want
# swept on Stop. With no PROJECTS_ROOT set, the hook does nothing.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_DIR="$(cd "${SCRIPT_DIR}/../service" && pwd)"
STATE_DIR="${HOME}/.local/state/agent-wiki"
DEBOUNCE_DIR="${STATE_DIR}/last-sweep"
HOOK_LOG="${STATE_DIR}/stop-hook.log"
DEBOUNCE_SECS=3600  # 60 min

mkdir -p "${DEBOUNCE_DIR}"

log() { echo "$(date -Iseconds) $*" >> "${HOOK_LOG}"; }

# Pick up PROJECTS_ROOT from service/.env if not already set.
if [[ -z "${PROJECTS_ROOT:-}" && -f "${SERVICE_DIR}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${SERVICE_DIR}/.env"
  set +a
fi

if [[ -z "${PROJECTS_ROOT:-}" ]]; then
  exit 0
fi

INPUT="$(cat)"
CWD="$(printf '%s' "${INPUT}" | python3 -c \
  'import sys, json; d=json.load(sys.stdin); print(d.get("cwd",""))' 2>/dev/null \
  || true)"

if [[ -z "${CWD}" ]]; then
  exit 0
fi

# cwd must be under PROJECTS_ROOT.
if [[ "${CWD}" != "${PROJECTS_ROOT}/"* ]]; then
  exit 0
fi

# Project name = first path component after PROJECTS_ROOT.
REL="${CWD#${PROJECTS_ROOT}/}"
PROJECT="${REL%%/*}"

if [[ -z "${PROJECT}" || "${PROJECT}" == .* ]]; then
  exit 0
fi

if [[ ! -f "${PROJECTS_ROOT}/${PROJECT}/AGENTS.md" ]]; then
  exit 0
fi

# Debounce.
STAMP="${DEBOUNCE_DIR}/${PROJECT}"
if [[ -f "${STAMP}" ]]; then
  NOW=$(date +%s)
  # BSD stat (macOS) uses -f %m; GNU stat (Linux) uses -c %Y.
  THEN=$(stat -f %m "${STAMP}" 2>/dev/null || stat -c %Y "${STAMP}" 2>/dev/null || echo 0)
  AGE=$(( NOW - THEN ))
  if (( AGE < DEBOUNCE_SECS )); then
    log "skip ${PROJECT}: swept ${AGE}s ago"
    exit 0
  fi
fi

# Claim the slot before forking, so concurrent Stops bail.
touch "${STAMP}"

# Fire-and-forget. On Linux we prefer systemd-run --user --no-block (transient
# unit owned by the user manager, surfaces in journalctl). On macOS — or any
# host without systemd-run — fall back to a detached nohup background process,
# which is enough for fire-and-forget since the sweep is short-lived and we
# already log its output to STATE_DIR.
if command -v systemd-run >/dev/null 2>&1; then
  if ! systemd-run --user --no-block \
        --unit="agent-wiki-sweep-${PROJECT}-$$" \
        --description="agent-wiki sweep ${PROJECT}" \
        "${SCRIPT_DIR}/sweep-project.sh" "${PROJECT}" >/dev/null 2>&1; then
    log "systemd-run failed for ${PROJECT}"
    exit 0
  fi
else
  nohup "${SCRIPT_DIR}/sweep-project.sh" "${PROJECT}" >/dev/null 2>&1 </dev/null &
  disown 2>/dev/null || true
fi

log "queued ${PROJECT}"
exit 0
