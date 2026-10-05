#!/usr/bin/env bash
# Changes the reasoning effort of a task between turns: rewrites the worktree's .claude/settings.local.json, records
# the change in task.json and, with --restart, restarts the idle agent so the new level applies. It never sends
# `/effort <level>` to an agent, because that would save the level in the user's own settings.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/herdr/set-effort.sh --id ID --level LEVEL [--max LEVEL] --reason TEXT [--restart] [--ignore-load]

  --id ID         Task created by scripts/herdr/new-task.sh
  --level LEVEL   low, medium, high or xhigh
  --max LEVEL     Highest level the agent may run at (default: same as --level)
  --reason TEXT   Why the level changes; stored in the task's effort history
  --restart       If the agent is idle or done, exit it and resume its conversation so the level applies now
  --ignore-load   With --restart, restart although the load average is above HERDR_MAX_LOAD
USAGE
}

ID= LEVEL= MAX= REASON= RESTART=0 IGNORE_LOAD=0
while [ $# -gt 0 ]; do
  case $1 in
    --id) need_arg "$1" $#; ID=${2:-}; shift 2 ;;
    --level) need_arg "$1" $#; LEVEL=${2:-}; shift 2 ;;
    --max) need_arg "$1" $#; MAX=${2:-}; shift 2 ;;
    --reason) need_arg "$1" $#; REASON=${2:-}; shift 2 ;;
    --restart) RESTART=1; shift ;;
    --ignore-load) IGNORE_LOAD=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
done

require_herdr
[ -n "$ID" ] && [ -n "$LEVEL" ] && [ -n "$REASON" ] || { usage >&2; die "--id, --level and --reason are required"; }
MAX=${MAX:-$LEVEL}
valid_effort "$LEVEL" || die "--level must be one of: $EFFORT_LEVELS"
valid_effort "$MAX" || die "--max must be one of: $EFFORT_LEVELS"
[ "$(effort_rank "$MAX")" -ge "$(effort_rank "$LEVEL")" ] || die "--max ($MAX) is below --level ($LEVEL)"
load_task "$ID"
[ -z "$TASK_REMOVED_AT" ] || die "task '$ID' was removed on $TASK_REMOVED_AT"

occupant=$(agent_in_pane "$TASK_PANE" || true)
state=
if [ -n "$occupant" ]; then
  state=$(jq -r '.agent_status' <<<"$occupant")
  case $state in
    idle | done) ;;
    *) die "the agent in $TASK_PANE is '$state'; change the effort at a safe point (idle or done), not mid-operation" ;;
  esac
fi

ensure_effort_excluded "$TASK_REPO"
write_effort_settings "$TASK_WORKTREE" "$LEVEL" "$MAX"
update_task "$ID" '.effort.level = $l | .effort.max = $m | .effort.reason = $r | .effort.verified = null
  | .effort.history += [{ at: $at, level: $l, max: $m, reason: $r }]' \
  --arg l "$LEVEL" --arg m "$MAX" --arg r "$REASON" --arg at "$(utc_now)"
log "Task $ID: effort $LEVEL (max $MAX) written to $TASK_WORKTREE/.claude/settings.local.json."

if [ -z "$occupant" ]; then
  log "No agent is running; the level applies when it starts (scripts/herdr/start-agent.sh)."
  exit 0
fi
name=$(jq -r '.name // empty' <<<"$occupant")
if [ "$RESTART" = 0 ]; then
  log "The running agent keeps its current level until it restarts. At a safe point run:"
  log "  scripts/herdr/set-effort.sh --id $ID --level $LEVEL --max $MAX --reason \"…\" --restart"
  log "(it exits the agent and resumes the same conversation with claude --continue)."
  exit 0
fi

[ -n "$name" ] || die "the agent in $TASK_PANE has no name; restart it by hand"
# Checked before the exit: start-agent.sh would refuse a loaded machine and leave the agent stopped.
check_load "$IGNORE_LOAD" || exit 1
log "Exiting '$name'…"
herdr agent prompt "$name" "/exit" >/dev/null || true
for _ in $(seq 1 30); do
  [ -z "$(agent_in_pane "$TASK_PANE" || true)" ] && break
  sleep 1
done
[ -z "$(agent_in_pane "$TASK_PANE" || true)" ] || die "'$name' did not exit; check the pane with: herdr pane read $TASK_PANE --source visible"
"$SCRIPT_DIR/start-agent.sh" --id "$ID" --name "$name" --continue --ignore-load
