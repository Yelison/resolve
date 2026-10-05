#!/usr/bin/env bash
# Starts Claude Code in the root pane of a task workspace and, optionally, hands it a brief to follow.
# It never starts a second agent in the same pane and never reuses a live agent name.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/herdr/start-agent.sh --id ID [--name NAME] [--brief FILE] [--continue] [--timeout MS]

  --id ID        Task created by scripts/herdr/new-task.sh
  --name NAME    Agent name, [a-z][a-z0-9_-]{0,31}, unique among live agents (default: derived from the id)
  --brief FILE   Once the agent is ready, prompt it to read and follow this file
  --continue     Resume the most recent conversation of this worktree (claude --continue)
  --timeout MS   Startup timeout for `herdr agent start` (default 60000)
USAGE
}

ID= NAME= BRIEF= TIMEOUT=60000 CONTINUE=0
while [ $# -gt 0 ]; do
  case $1 in
    --id) need_arg "$1" $#; ID=${2:-}; shift 2 ;;
    --name) need_arg "$1" $#; NAME=${2:-}; shift 2 ;;
    --brief) need_arg "$1" $#; BRIEF=${2:-}; shift 2 ;;
    --continue) CONTINUE=1; shift ;;
    --timeout) need_arg "$1" $#; TIMEOUT=${2:-}; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
done

require_herdr
[ -n "$ID" ] || { usage >&2; die "--id is required"; }
load_task "$ID"
[ -z "$TASK_REMOVED_AT" ] || die "task '$ID' was removed on $TASK_REMOVED_AT"
[ -d "$TASK_WORKTREE" ] || die "the worktree is missing: $TASK_WORKTREE"
if [ -z "$NAME" ]; then
  NAME=$(printf '%s' "$ID" | tr -c 'a-z0-9_-' '-')
  [[ $NAME =~ ^[a-z] ]] || NAME="t-$NAME"
  NAME=${NAME:0:32}
fi
[[ $NAME =~ ^[a-z][a-z0-9_-]{0,31}$ ]] || die "invalid agent name '$NAME'"
if [ -n "$BRIEF" ]; then
  [ -f "$BRIEF" ] || die "brief not found: $BRIEF"
  BRIEF=$(cd "$(dirname "$BRIEF")" && pwd -P)/$(basename "$BRIEF")
fi

existing=$(agent_named "$NAME")
[ -z "$existing" ] || die "an agent named '$NAME' is already live: $existing"
occupant=$(agent_in_pane "$TASK_PANE")
[ -z "$occupant" ] || die "pane $TASK_PANE already hosts an agent: $occupant"
herdr pane get "$TASK_PANE" >/dev/null 2>&1 || die "pane $TASK_PANE no longer exists; reopen the checkout with: herdr worktree open --cwd \"$TASK_REPO\" --path \"$TASK_WORKTREE\" and update tasks/$ID/task.json"

log "Starting Claude Code as '$NAME' in pane $TASK_PANE ($TASK_WORKTREE)…"
agent_args=()
[ "$CONTINUE" = 0 ] || agent_args=(-- --continue)
# A pane that was just created may still be starting its shell (agent_pane_busy); give it a few seconds.
for attempt in $(seq 1 15); do
  if err=$(herdr agent start "$NAME" --kind claude --pane "$TASK_PANE" --timeout "$TIMEOUT" "${agent_args[@]}" 2>&1 >/dev/null); then
    break
  fi
  if [[ $err == *agent_pane_busy* ]] && [ "$attempt" -lt 15 ] && [ -z "$(agent_in_pane "$TASK_PANE" || true)" ]; then
    sleep 1
    continue
  fi
  die "herdr agent start failed: $err"
done
update_task "$ID" '.agent = $name | .agent_started_at = $at' --arg name "$NAME" --arg at "$(utc_now)"
state=$(agent_state "$NAME")
log "Agent '$NAME' is $state."
expected_model=$(jq -r '.model // empty' "$(task_json "$ID")")
if [ -n "$expected_model" ]; then
  shown=$(agent_model "$NAME")
  log "Session model: ${shown:-unknown} (task asks for $expected_model)."
  update_task "$ID" '.model_verified = { at: $at, header: $h }' --arg at "$(utc_now)" --arg h "$shown"
fi
expected=$(jq -r '.effort.level // empty' "$(task_json "$ID")")
header=$(agent_effort "$NAME")
if [ -n "$expected" ]; then
  if [[ $header == *" with $expected effort" ]]; then
    log "Effort verified from the session header: $header"
    update_task "$ID" '.effort.verified = { at: $at, header: $h }' --arg at "$(utc_now)" --arg h "$header"
  else
    log "warning: expected '$expected' effort, the session header says '${header:-nothing}'."
    log "Check with: herdr agent prompt $NAME '/effort status'   (never send '/effort <level>': it saves to the user's settings)"
  fi
fi
if [ "$state" = blocked ]; then
  log "It is waiting for an answer (on a new checkout this is usually the folder-trust dialog). Screen:"
  herdr agent read "$NAME" --source visible --lines 30 >&2
  log "Answer with: herdr agent send-keys $NAME <key>   then give it the brief with: herdr agent prompt $NAME \"Read <brief> in full and follow it.\""
  exit 0
fi
if [ -n "$BRIEF" ]; then
  prompt="Read $BRIEF in full and follow it. Work only inside $TASK_WORKTREE on branch $TASK_BRANCH; verify both before editing anything. If the brief does not match what you find, or you need a file it reserves, stop and report it the way the brief says."
  herdr agent prompt "$NAME" "$prompt" >/dev/null \
    || die "the prompt may or may not have been submitted; read the agent before retrying: herdr agent read $NAME --source recent-unwrapped --lines 120"
  herdr agent wait "$NAME" --until working --timeout 15000 >/dev/null \
    || log "warning: no 'working' state within 15 s; check with: herdr agent get $NAME"
  log "Brief sent. Follow it with: herdr agent get $NAME · herdr agent read $NAME --source recent-unwrapped --lines 120"
fi
