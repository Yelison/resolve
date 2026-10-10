#!/usr/bin/env bash
# Retires a finished task: stops its Docker Compose project, removes the worktree through Herdr and keeps the
# branch (unless --delete-branch, or --squashed-head for a confirmed squash merge). It refuses while the checkout has uncommitted changes or a live agent, and never forces anything.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/herdr/remove-task.sh --id ID [--delete-branch [--squashed-head SHA]] [--volumes] [--force-leftovers]

  --id ID            Task to retire
  --delete-branch    Also delete the branch, only if git considers it merged (`git branch -d`)
  --squashed-head SHA
                     With --delete-branch: GitHub squash-merged exactly the full 40-character commit SHA, which `git
                     branch -d` cannot see as merged (a squash is one new patch). The branch is deleted only if it
                     still points at SHA when this runs; a branch at any other commit is kept, with a note, and the
                     task is retired all the same. ship.sh passes it once it has confirmed the merge
  --volumes          Also remove the task's Docker volumes (its database data)
  --force-leftovers  Go on although processes still listen on the slot's ports or containers of the task's Compose
                     project exist (the script lists them, and never kills anything itself)
USAGE
}

ID= DELETE_BRANCH=0 SQUASHED_HEAD= VOLUMES=0 FORCE_LEFTOVERS=0
while [ $# -gt 0 ]; do
  case $1 in
    --id) need_arg "$1" $#; ID=${2:-}; shift 2 ;;
    --delete-branch) DELETE_BRANCH=1; shift ;;
    --squashed-head) need_arg "$1" $#; SQUASHED_HEAD=${2:-}; [ -n "$SQUASHED_HEAD" ] || die "--squashed-head needs a full 40-character commit SHA, not an empty value (nothing was removed)"; shift 2 ;;
    --volumes) VOLUMES=1; shift ;;
    --force-leftovers) FORCE_LEFTOVERS=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
done

# Processes listening on PORT, one "port<TAB>pid<TAB>command<TAB>cwd" line each. ss only shows the pid of the user's own
# processes (a docker-proxy, for one, has none): those show as "?" instead of being taken for a free port.
port_listeners() {
  local port=$1 line pids pid cmd cwd
  while IFS= read -r line; do
    pids=$(grep -oE 'pid=[0-9]+' <<<"$line" | cut -d= -f2 | sort -u || true)
    if [ -z "$pids" ]; then
      printf '%s\t?\t(pid not visible to this user)\t?\n' "$port"
      continue
    fi
    for pid in $pids; do
      cmd=$(ps -o args= -p "$pid" 2>/dev/null || true)
      cwd=$(readlink "/proc/$pid/cwd" 2>/dev/null || echo '?')
      printf '%s\t%s\t%s\t%s\n' "$port" "$pid" "${cmd:-?}" "$cwd"
    done
  done < <(ss -ltnpH 2>/dev/null | awk -v p="$port" '$4 ~ ("[:.]" p "$") { print }')
}

# Leftovers of the task: listeners on its slot's ports and containers (any state) of its Compose project.
find_leftovers() {
  local key port
  while IFS='=' read -r key port; do
    port_listeners "$port"
  done < <(slot_ports "$TASK_SLOT") | sort -u | awk -F'\t' '{ printf "  port %s: pid %s, %s (cwd %s)\n", $1, $2, $3, $4 }'
}
find_containers() {
  local found
  command -v docker >/dev/null 2>&1 || return 0
  # A docker that cannot answer is not "no containers": say so, so the task is not retired blind.
  if ! found=$(docker ps -a --filter "label=com.docker.compose.project=$TASK_COMPOSE_PROJECT" --format '{{.ID}} {{.Names}} ({{.Status}})' 2>/dev/null); then
    printf '  could not list the containers of %s (docker ps failed; is the Docker daemon running?)\n' "$TASK_COMPOSE_PROJECT"
    return 0
  fi
  [ -z "$found" ] || awk '{ print "  container " $0 }' <<<"$found"
}

require_herdr
need ss
[ -n "$ID" ] || { usage >&2; die "--id is required"; }
if [ -n "$SQUASHED_HEAD" ]; then
  [ "$DELETE_BRANCH" = 1 ] || die "--squashed-head only makes sense with --delete-branch (nothing was removed)"
  [[ $SQUASHED_HEAD =~ ^[0-9a-f]{40}$ ]] || die "--squashed-head must be a full 40-character commit SHA: $SQUASHED_HEAD (nothing was removed)"
fi
load_task "$ID"
if [ -n "$SQUASHED_HEAD" ]; then
  git -C "$TASK_REPO" cat-file -e "$SQUASHED_HEAD^{commit}" 2>/dev/null || die "--squashed-head $SQUASHED_HEAD is not a commit of this repository (nothing was removed)"
fi
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

leftovers=$(find_leftovers; find_containers)
if [ -n "$leftovers" ]; then
  printf 'Still running for task %s:\n%s\n' "$ID" "$leftovers" >&2
  if [ "$FORCE_LEFTOVERS" = 1 ]; then
    log "Going on (--force-leftovers); nothing listed above is killed here, only the Compose project is stopped below."
  else
    down_cmd="docker compose -p $TASK_COMPOSE_PROJECT down"
    [ "$VOLUMES" = 0 ] || down_cmd="$down_cmd --volumes"
    die "the task left processes or containers behind (nothing was removed). Stop them yourself ($down_cmd for the containers, the owner for the processes) or rerun with --force-leftovers"
  fi
fi

ahead=$(git -C "$TASK_REPO" rev-list --count "main..$TASK_BRANCH" 2>/dev/null || echo 0)
if git -C "$TASK_REPO" rev-parse --verify --quiet "$TASK_BRANCH@{upstream}" >/dev/null; then
  unpushed=$(git -C "$TASK_REPO" rev-list --count "$TASK_BRANCH@{upstream}..$TASK_BRANCH")
  [ "$unpushed" = 0 ] || log "note: $unpushed commit(s) of $TASK_BRANCH are not pushed yet; the branch is kept"
else
  log "note: $TASK_BRANCH has no upstream; its $ahead commit(s) beyond main stay in the local branch"
fi

# Without --volumes, only a project Compose still lists is stopped. With it, the volumes are removed even when no
# container is left (compose ls derives the projects from containers, so it would not list a project that only has
# volumes), through the project's own compose file.
project_listed=0
if command -v docker >/dev/null 2>&1 \
  && docker compose ls -a --format json 2>/dev/null | jq -e --arg n "$TASK_COMPOSE_PROJECT" '.[] | select(.Name == $n)' >/dev/null; then
  project_listed=1
fi
if [ "$VOLUMES" = 1 ] || [ "$project_listed" = 1 ]; then
  command -v docker >/dev/null 2>&1 || die "docker is required to remove the volumes of $TASK_COMPOSE_PROJECT (nothing was removed)"
  compose_file="$TASK_WORKTREE/docker-compose.yml"
  [ -f "$compose_file" ] || compose_file="$TASK_REPO/docker-compose.yml"
  log "Stopping Docker Compose project $TASK_COMPOSE_PROJECT…"
  if [ "$VOLUMES" = 1 ]; then
    docker compose -p "$TASK_COMPOSE_PROJECT" -f "$compose_file" down --volumes \
      || die "could not remove the volumes of $TASK_COMPOSE_PROJECT (nothing else was removed)"
  else
    docker compose -p "$TASK_COMPOSE_PROJECT" -f "$compose_file" down \
      || die "could not stop $TASK_COMPOSE_PROJECT (nothing else was removed)"
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

if [ "$DELETE_BRANCH" = 1 ] && [ -n "$SQUASHED_HEAD" ]; then
  # The tip is read here, right before the deletion, not taken from an earlier read: a commit made after the merge makes
  # it differ from SHA, and then the branch holds something GitHub did not merge, so it stays.
  tip=$(git -C "$TASK_REPO" rev-parse --verify --quiet "refs/heads/$TASK_BRANCH" || true)
  if [ "$tip" = "$SQUASHED_HEAD" ]; then
    if git -C "$TASK_REPO" branch -q -D "$TASK_BRANCH"; then
      log "Branch $TASK_BRANCH deleted: it is exactly the head GitHub squash-merged ($SQUASHED_HEAD)."
    else
      log "warning: could not delete $TASK_BRANCH (is it checked out in another worktree?); the branch is kept"
    fi
  else
    log "Branch $TASK_BRANCH kept: it is at ${tip:-nowhere}, not at the head GitHub squash-merged ($SQUASHED_HEAD)."
  fi
elif [ "$DELETE_BRANCH" = 1 ]; then
  git -C "$TASK_REPO" branch -d "$TASK_BRANCH" || die "git refused to delete $TASK_BRANCH (not merged); the branch is kept"
else
  log "Branch $TASK_BRANCH kept ($ahead commit(s) beyond main)."
fi
update_task "$ID" '.removed_at = $at' --arg at "$(utc_now)"
log "Task $ID retired. Logs stay in $TASK_LOG_DIR."
