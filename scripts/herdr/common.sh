#!/usr/bin/env bash
# Shared helpers for the Herdr task scripts (docs/development/herdr.md). Source it; do not run it.
set -euo pipefail

HERDR_TASKS_ROOT="${HERDR_TASKS_ROOT:-$HOME/resolver-herdr}"
SLOT_MIN=1
SLOT_MAX=9

log() { printf '%s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
# need_arg OPTION ARGC: an option that takes a value must have one (a bare shift 2 would exit silently).
need_arg() { [ "$2" -ge 2 ] || die "$1 needs a value"; }
need() { command -v "$1" >/dev/null 2>&1 || die "'$1' is required but it is not in PATH"; }

require_herdr() {
  need herdr
  need jq
  need git
  [ "${HERDR_ENV:-}" = "1" ] || die "run this from a Herdr pane (HERDR_ENV is not 1)"
  case $HERDR_TASKS_ROOT in /*) ;; *) die "HERDR_TASKS_ROOT must be an absolute path: $HERDR_TASKS_ROOT" ;; esac
}

# Main checkout of the repository that contains DIR, even when DIR is inside a linked worktree.
repo_root_from() {
  local dir=$1 common
  common=$(git -C "$dir" rev-parse --git-common-dir 2>/dev/null) || die "'$dir' is not inside a git repository"
  common=$(cd "$dir" && cd "$common" && pwd -P)
  dirname "$common"
}

task_dir() { printf '%s/tasks/%s\n' "$HERDR_TASKS_ROOT" "$1"; }
task_json() { printf '%s/task.json\n' "$(task_dir "$1")"; }

# Loads task.json into TASK_* variables.
load_task() {
  local file
  file=$(task_json "$1")
  [ -f "$file" ] || die "unknown task '$1' (no $file)"
  TASK_ID=$1
  TASK_BRANCH=$(jq -r '.branch' "$file")
  TASK_WORKTREE=$(jq -r '.worktree' "$file")
  TASK_REPO=$(jq -r '.repo' "$file")
  TASK_BASE_SHA=$(jq -r '.base_sha' "$file")
  TASK_WORKSPACE=$(jq -r '.workspace_id' "$file")
  TASK_PANE=$(jq -r '.pane_id' "$file")
  TASK_SLOT=$(jq -r '.slot' "$file")
  TASK_COMPOSE_PROJECT=$(jq -r '.compose_project' "$file")
  TASK_LOG_DIR=$(jq -r '.log_dir' "$file")
  TASK_AGENT=$(jq -r '.agent // empty' "$file")
  TASK_REMOVED_AT=$(jq -r '.removed_at // empty' "$file")
}

# update_task ID 'jq filter' [jq args...]: rewrites task.json atomically.
update_task() {
  local id=$1 filter=$2 file tmp
  shift 2
  file=$(task_json "$id")
  tmp=$(mktemp "$file.XXXXXX")
  if jq "$@" "$filter" "$file" >"$tmp"; then
    mv "$tmp" "$file"
  else
    rm -f "$tmp"
    return 1
  fi
}

# Ids of the tasks whose worktree has not been removed.
active_task_ids() {
  local f
  for f in "$HERDR_TASKS_ROOT"/tasks/*/task.json; do
    [ -f "$f" ] || continue
    jq -r 'select(.removed_at == null) | .id' "$f"
  done
}

# awk reads all of ss output (no early exit), so pipefail cannot turn a SIGPIPE into a false "free".
port_in_use() { ss -ltnH 2>/dev/null | awk -v p="$1" '$4 ~ ("[:.]" p "$") { found = 1 } END { exit !found }'; }

# slot_ports N: the ports of a slot, one KEY=VALUE per line.
slot_ports() {
  local slot=$1
  printf 'DEV_SERVER_PORT=%s\n' $((5180 + slot))
  printf 'PLAYWRIGHT_PORT=%s\n' $((4180 + slot))
  printf 'SERVER_PORT=%s\n' $((8080 + slot))
  printf 'POSTGRES_PORT=%s\n' $((5440 + slot))
}

# Live agent (JSON) hosted by a pane, or nothing.
agent_in_pane() { herdr agent list | jq -c --arg p "$1" '.result.agents[]? | select(.pane_id == $p)'; }
# Live agent (JSON) with that name, or nothing.
agent_named() { herdr agent list | jq -c --arg n "$1" '.result.agents[]? | select((.name // "") == $n)'; }
agent_state() { herdr agent get "$1" | jq -r '.result.agent.agent_status // .result.agent_status // "unknown"'; }
utc_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
