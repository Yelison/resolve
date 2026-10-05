#!/usr/bin/env bash
# Retires a finished task: stops its Docker Compose project, removes the worktree through Herdr and keeps the
# branch. It refuses while the checkout has uncommitted changes or a live agent, and never forces anything.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/herdr/remove-task.sh --id ID [--delete-branch] [--volumes]

  --id ID          Task to retire
  --delete-branch  Also delete the branch, only if git considers it merged (`git branch -d`)
  --volumes        Also remove the task's Docker volumes (its database data)
USAGE
}

ID= DELETE_BRANCH=0 VOLUMES=0
while [ $# -gt 0 ]; do
  case $1 in
    --id) need_arg "$1" $#; ID=${2:-}; shift 2 ;;
    --delete-branch) DELETE_BRANCH=1; shift ;;
    --volumes) VOLUMES=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
done

require_herdr
[ -n "$ID" ] || { usage >&2; die "--id is required"; }
load_task "$ID"
[ -z "$TASK_REMOVED_AT" ] || die "task '$ID' was already removed on $TASK_REMOVED_AT"

if [ -d "$TASK_WORKTREE" ]; then
  dirty=$(git -C "$TASK_WORKTREE" status --porcelain)
  if [ -n "$dirty" ]; then
    printf '%s\n' "$dirty" >&2
    die "the worktree has uncommitted changes; commit or stash them first (nothing was removed)"
  fi
  occupant=$(agent_in_pane "$TASK_PANE" || true)
  [ -z "$occupant" ] || die "an agent is still running in pane $TASK_PANE; let it finish and exit it first (nothing was removed)"
fi

ahead=$(git -C "$TASK_REPO" rev-list --count "main..$TASK_BRANCH" 2>/dev/null || echo 0)
if git -C "$TASK_REPO" rev-parse --verify --quiet "$TASK_BRANCH@{upstream}" >/dev/null; then
  unpushed=$(git -C "$TASK_REPO" rev-list --count "$TASK_BRANCH@{upstream}..$TASK_BRANCH")
  [ "$unpushed" = 0 ] || log "note: $unpushed commit(s) of $TASK_BRANCH are not pushed yet; the branch is kept"
else
  log "note: $TASK_BRANCH has no upstream; its $ahead commit(s) beyond main stay in the local branch"
fi

if command -v docker >/dev/null 2>&1 \
  && docker compose ls -a --format json 2>/dev/null | jq -e --arg n "$TASK_COMPOSE_PROJECT" '.[] | select(.Name == $n)' >/dev/null; then
  compose_file="$TASK_WORKTREE/docker-compose.yml"
  [ -f "$compose_file" ] || compose_file="$TASK_REPO/docker-compose.yml"
  log "Stopping Docker Compose project $TASK_COMPOSE_PROJECT…"
  if [ "$VOLUMES" = 1 ]; then
    docker compose -p "$TASK_COMPOSE_PROJECT" -f "$compose_file" down --volumes
  else
    docker compose -p "$TASK_COMPOSE_PROJECT" -f "$compose_file" down
  fi
fi

if herdr workspace get "$TASK_WORKSPACE" >/dev/null 2>&1; then
  log "Removing the worktree through Herdr (workspace $TASK_WORKSPACE)…"
  herdr worktree remove --workspace "$TASK_WORKSPACE" >/dev/null || die "herdr worktree remove failed (nothing was forced)"
elif [ -d "$TASK_WORKTREE" ]; then
  log "Workspace $TASK_WORKSPACE is gone; removing the worktree with git…"
  git -C "$TASK_REPO" worktree remove "$TASK_WORKTREE" || die "git worktree remove failed (nothing was forced)"
fi
if git -C "$TASK_REPO" worktree list --porcelain | grep -Fqx "worktree $TASK_WORKTREE"; then
  die "the worktree is still registered: $TASK_WORKTREE (if its folder is gone, run git worktree prune in $TASK_REPO)"
fi

if [ "$DELETE_BRANCH" = 1 ]; then
  git -C "$TASK_REPO" branch -d "$TASK_BRANCH" || die "git refused to delete $TASK_BRANCH (not merged); the branch is kept"
else
  log "Branch $TASK_BRANCH kept ($ahead commit(s) beyond main)."
fi
update_task "$ID" '.removed_at = $at' --arg at "$(utc_now)"
log "Task $ID retired. Logs stay in $TASK_LOG_DIR."
