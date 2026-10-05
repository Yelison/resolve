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

# Reasoning effort per task (docs/development/herdr.md, "Reasoning effort per task").
# Levels a settings file accepts; `max` only exists as a launch flag or environment variable, so tasks do not use it.
EFFORT_LEVELS="low medium high xhigh"
# Models whose per-model entry is written, so the level holds whichever of them the session resolves to.
EFFORT_MODELS="claude-sonnet-5-5 claude-opus-5-5 claude-fable-5-1"

valid_effort() { case " $EFFORT_LEVELS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }
effort_rank() { local i=0 l; for l in $EFFORT_LEVELS; do [ "$l" = "$1" ] && { echo "$i"; return; }; i=$((i + 1)); done; echo -1; }

# Keeps .claude/settings.local.json out of every worktree through the shared .git/info/exclude.
ensure_effort_excluded() {
  local repo=$1 exclude
  exclude=$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)/info/exclude
  mkdir -p "$(dirname "$exclude")"
  grep -Fqx '/.claude/settings.local.json' "$exclude" 2>/dev/null || {
    printf '%s\n' '# scripts/herdr: per-task reasoning effort' '/.claude/settings.local.json' >>"$exclude"
  }
}

# write_effort_settings WORKTREE LEVEL MAX: merges the effort keys into WORKTREE/.claude/settings.local.json.
write_effort_settings() {
  local worktree=$1 level=$2 max=$3 file tmp models
  file="$worktree/.claude/settings.local.json"
  mkdir -p "$worktree/.claude"
  git -C "$worktree" check-ignore -q .claude/settings.local.json \
    || die "$file would not be ignored by git; run ensure_effort_excluded first"
  [ -f "$file" ] || printf '{}\n' >"$file"
  models=$(printf '%s\n' $EFFORT_MODELS | jq -R . | jq -s .)
  tmp=$(mktemp "$file.XXXXXX")
  if jq --arg level "$level" --arg max "$max" --argjson models "$models" '
      .modelSettings = ((.modelSettings // {}) as $m
        | reduce $models[] as $k ($m; .[$k] = ((.[$k] // {}) + { effortLevel: $level, maxEffortLevel: $max })))
    ' "$file" >"$tmp"; then
    mv "$tmp" "$file"
  else
    rm -f "$tmp"
    die "could not update $file"
  fi
}

# write_model_settings WORKTREE MODEL ADVISOR: sets `model` and `advisorModel` in the worktree's local settings.
# An empty value removes the key, so the session falls back to the owner's own default; ADVISOR=none turns the
# advisor off for that worktree through the settings `env` key (CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1).
write_model_settings() {
  local worktree=$1 model=$2 advisor=$3 file tmp
  file="$worktree/.claude/settings.local.json"
  mkdir -p "$worktree/.claude"
  [ -f "$file" ] || printf '{}\n' >"$file"
  tmp=$(mktemp "$file.XXXXXX")
  if jq --arg model "$model" --arg advisor "$advisor" '
      (if $model == "" then del(.model) else .model = $model end)
      | (if $advisor == "" then del(.advisorModel)
         elif $advisor == "none" then (del(.advisorModel) | .env = ((.env // {}) + { CLAUDE_CODE_DISABLE_ADVISOR_TOOL: "1" }))
         else .advisorModel = $advisor end)
      | (if $advisor != "none" and .env then .env |= del(.CLAUDE_CODE_DISABLE_ADVISOR_TOOL) else . end)
      | (if .env == {} then del(.env) else . end)
    ' "$file" >"$tmp"; then
    mv "$tmp" "$file"
  else
    rm -f "$tmp"
    die "could not update $file"
  fi
}

# Model the agent's session header reports (the part before " with … effort"), or nothing.
agent_model() { agent_effort "$1" | sed -E 's/^ +//; s/ with [a-z]+ effort$//'; }

# Effort level the agent's session header reports ("… with medium effort"), or nothing.
# The header may not be drawn yet right after `herdr agent start`, so read it for a few seconds; never fail,
# because callers run under `set -euo pipefail` and an empty grep must not end the script before the brief is sent.
agent_effort() {
  local line attempt
  for attempt in $(seq 1 "${HERDR_HEADER_ATTEMPTS:-20}"); do
    line=$(herdr agent read "$1" --source recent-unwrapped --lines 400 2>/dev/null \
      | grep -oE '[A-Za-z0-9. ]+ with [a-z]+ effort' | tail -n 1 || true)
    if [ -n "$line" ]; then
      printf '%s\n' "$line"
      return 0
    fi
    [ "$attempt" -lt "${HERDR_HEADER_ATTEMPTS:-20}" ] && sleep 0.5
  done
  return 0
}
