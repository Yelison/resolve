#!/usr/bin/env bash
# One line per active task: branch, slot, Herdr ids, live agent state and how far the checkout moved.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

require_herdr
agents=$(herdr agent list)
fmt='%-26s %-30s %-4s %-5s %-7s %-24s %-14s %s\n'
# shellcheck disable=SC2059
printf "$fmt" TASK BRANCH SLOT WS PANE AGENT EFFORT GIT
for id in $(active_task_ids); do
  load_task "$id"
  agent=$(jq -r --arg p "$TASK_PANE" '.result.agents[]? | select(.pane_id == $p) | "\(.name // .agent):\(.agent_status)"' <<<"$agents" | head -n 1)
  if [ -d "$TASK_WORKTREE" ]; then
    dirty=$(git -C "$TASK_WORKTREE" status --porcelain | wc -l | tr -d ' ')
    ahead=$(git -C "$TASK_WORKTREE" rev-list --count "$TASK_BASE_SHA..HEAD")
    gitinfo="+$ahead commit(s), $dirty changed file(s)"
  else
    gitinfo="worktree missing"
  fi
  effort=$(jq -r 'if .effort then "\(.effort.level)/\(.effort.max)\(if .effort.verified then " ✓" else "" end)" else "-" end' "$(task_json "$id")")
  # shellcheck disable=SC2059
  printf "$fmt" "$id" "$TASK_BRANCH" "$TASK_SLOT" "$TASK_WORKSPACE" "$TASK_PANE" "${agent:--}" "$effort" "$gitinfo"
done
