#!/usr/bin/env bash
# Creates an isolated task: a Git worktree on a new branch, a Herdr workspace that opens it, and a .env.herdr
# with the task's own ports. Refuses to reuse a branch, a path, a task id or a port slot that already exists.
# See docs/development/herdr.md.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/herdr/new-task.sh --id ID --branch BRANCH [options]

  --id ID          Task id, [a-z0-9][a-z0-9._-]{0,39}, e.g. t0-1-tickets-follow-ups
  --branch NAME    Branch to create; it must not exist yet
  --base REF       Commit the branch starts from (default: main)
  --slot N         Port slot 1-9 (default: the first free one)
  --label TEXT     Herdr workspace label (default: "resolve · ID")
  --effort LEVEL   Reasoning effort for the task's agent: low, medium (default), high or xhigh
  --max-effort L   Highest level the agent may run at (default: same as --effort; raise it with set-effort.sh)
  --effort-reason  One line explaining the level, stored in task.json
  --model ID       Model for the task's agent, e.g. claude-sonnet-5-5 (default: the owner's default model)
  --advisor ID     Advisor model, e.g. claude-opus-5-5, or none (default: the owner's advisor setting)
  --install        Run `npm ci` in frontend/ once the worktree exists
  --ignore-load    Start although the load average is above HERDR_MAX_LOAD (default 1.5 x the number of cores)
  --no-claude-md   Do not copy the local, git-ignored CLAUDE.md into the worktree
  -h, --help       Show this help

HERDR_TASKS_ROOT (default ~/resolver-herdr) holds worktrees/, tasks/ and logs/.
USAGE
}

ID= BRANCH= BASE=main SLOT= LABEL= INSTALL=0 IGNORE_LOAD=0 COPY_CLAUDE_MD=1 EFFORT=medium MAX_EFFORT= EFFORT_REASON= MODEL= ADVISOR=
while [ $# -gt 0 ]; do
  case $1 in
    --id) need_arg "$1" $#; ID=${2:-}; shift 2 ;;
    --branch) need_arg "$1" $#; BRANCH=${2:-}; shift 2 ;;
    --base) need_arg "$1" $#; BASE=${2:-}; shift 2 ;;
    --slot) need_arg "$1" $#; SLOT=${2:-}; shift 2 ;;
    --label) need_arg "$1" $#; LABEL=${2:-}; shift 2 ;;
    --effort) need_arg "$1" $#; EFFORT=${2:-}; shift 2 ;;
    --max-effort) need_arg "$1" $#; MAX_EFFORT=${2:-}; shift 2 ;;
    --effort-reason) need_arg "$1" $#; EFFORT_REASON=${2:-}; shift 2 ;;
    --model) need_arg "$1" $#; MODEL=${2:-}; shift 2 ;;
    --advisor) need_arg "$1" $#; ADVISOR=${2:-}; shift 2 ;;
    --install) INSTALL=1; shift ;;
    --ignore-load) IGNORE_LOAD=1; shift ;;
    --no-claude-md) COPY_CLAUDE_MD=0; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
done

require_herdr
need ss
[ -n "$ID" ] || { usage >&2; die "--id is required"; }
[ -n "$BRANCH" ] || { usage >&2; die "--branch is required"; }
[[ $ID =~ ^[a-z0-9][a-z0-9._-]{0,39}$ ]] || die "invalid task id '$ID'"
git check-ref-format --branch "$BRANCH" >/dev/null 2>&1 || die "invalid branch name '$BRANCH'"
MAX_EFFORT=${MAX_EFFORT:-$EFFORT}
valid_effort "$EFFORT" || die "--effort must be one of: $EFFORT_LEVELS"
valid_effort "$MAX_EFFORT" || die "--max-effort must be one of: $EFFORT_LEVELS"
[ "$(effort_rank "$MAX_EFFORT")" -ge "$(effort_rank "$EFFORT")" ] || die "--max-effort ($MAX_EFFORT) is below --effort ($EFFORT)"

check_load "$IGNORE_LOAD"
REPO=$(repo_root_from "$SCRIPT_DIR")
BASE_SHA=$(git -C "$REPO" rev-parse --verify --quiet "${BASE}^{commit}") || die "unknown base ref '$BASE'"
WORKTREE="$HERDR_TASKS_ROOT/worktrees/$ID"
TASK_DIR=$(task_dir "$ID")
LOG_DIR="$HERDR_TASKS_ROOT/logs/$ID"
LABEL=${LABEL:-"resolve · $ID"}

# Never touch something that already exists.
if git -C "$REPO" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  die "branch '$BRANCH' already exists; open its checkout with: herdr worktree open --cwd \"$REPO\" --branch \"$BRANCH\""
fi
[ ! -e "$WORKTREE" ] || die "path already exists: $WORKTREE"
[ ! -e "$TASK_DIR" ] || die "task '$ID' already has a record in $TASK_DIR; remove it with scripts/herdr/remove-task.sh or pick another id"
case $WORKTREE in "$REPO"/*) die "the worktree must live outside the repository: $WORKTREE" ;; esac

# Port slot: unique among active tasks and with its ports free right now.
used_slots=$(for t in $(active_task_ids); do jq -r '.slot' "$(task_json "$t")"; done)
if [ -z "$SLOT" ]; then
  for candidate in $(seq "$SLOT_MIN" "$SLOT_MAX"); do
    if ! grep -qx "$candidate" <<<"$used_slots"; then
      SLOT=$candidate
      break
    fi
  done
  [ -n "$SLOT" ] || die "all port slots ($SLOT_MIN-$SLOT_MAX) are in use"
fi
[[ $SLOT =~ ^[0-9]$ ]] && [ "$SLOT" -ge "$SLOT_MIN" ] && [ "$SLOT" -le "$SLOT_MAX" ] || die "--slot must be between $SLOT_MIN and $SLOT_MAX"
if grep -qx "$SLOT" <<<"$used_slots"; then die "slot $SLOT already belongs to another task (scripts/herdr/status.sh)"; fi
while IFS='=' read -r key port; do
  if port_in_use "$port"; then die "slot $SLOT needs port $port ($key) but something is listening on it; choose another --slot"; fi
done < <(slot_ports "$SLOT")

COMPOSE_PROJECT="resolve-$(printf '%s' "$ID" | tr -c 'a-z0-9_-' '-')"
mkdir -p "$HERDR_TASKS_ROOT/worktrees" "$TASK_DIR" "$LOG_DIR"
log "Creating $WORKTREE on branch $BRANCH from $BASE ($BASE_SHA)…"
if ! created=$(herdr worktree create --cwd "$REPO" --branch "$BRANCH" --base "$BASE" --path "$WORKTREE" --label "$LABEL" --no-focus); then
  rmdir "$TASK_DIR" "$LOG_DIR" 2>/dev/null || true
  die "herdr worktree create failed"
fi
WORKSPACE_ID=$(jq -r '.result.workspace.workspace_id // empty' <<<"$created")
TAB_ID=$(jq -r '.result.tab.tab_id // empty' <<<"$created")
PANE_ID=$(jq -r '.result.root_pane.pane_id // empty' <<<"$created")
[ -n "$WORKSPACE_ID" ] && [ -n "$PANE_ID" ] || die "unexpected response from herdr: $created"

head_sha=$(git -C "$WORKTREE" rev-parse HEAD)
head_branch=$(git -C "$WORKTREE" branch --show-current)
[ "$head_sha" = "$BASE_SHA" ] || die "the worktree is at $head_sha, expected $BASE_SHA"
[ "$head_branch" = "$BRANCH" ] || die "the worktree is on '$head_branch', expected '$BRANCH'"

# Per-task environment. .gitignore ignores .env.* so it never reaches a commit.
{
  printf '# Generated by scripts/herdr/new-task.sh for task %s. Ignored by git. Load it with: set -a; . ./.env.herdr; set +a\n' "$ID"
  printf 'HERDR_TASK_ID=%s\n' "$ID"
  printf 'HERDR_TASK_SLOT=%s\n' "$SLOT"
  printf 'HERDR_TASK_BRANCH=%q\n' "$BRANCH"
  printf 'HERDR_TASK_WORKTREE=%q\n' "$WORKTREE"
  printf 'HERDR_TASK_LOG_DIR=%q\n' "$LOG_DIR"
  slot_ports "$SLOT"
  printf 'COMPOSE_PROJECT_NAME=%s\n' "$COMPOSE_PROJECT"
  printf 'DATABASE_URL=jdbc:postgresql://localhost:%s/resolve\n' $((5440 + SLOT))
  printf 'API_PROXY_TARGET=http://localhost:%s\n' $((8080 + SLOT))
  # OIDC sign-in against the task's own Keycloak (docker-compose service `keycloak`, `dev,oidc` profiles).
  printf 'RESOLVE_OIDC_ISSUER=http://localhost:%s/realms/resolve\n' $((8180 + SLOT))
  printf 'RESOLVE_PUBLIC_URL=http://localhost:%s\n' $((5180 + SLOT))
} >"$WORKTREE/.env.herdr"
if ! git -C "$WORKTREE" check-ignore -q .env.herdr; then
  rm -f "$WORKTREE/.env.herdr"
  die ".env.herdr is not ignored by git in this checkout; not leaving it there"
fi

ensure_effort_excluded "$REPO"
write_effort_settings "$WORKTREE" "$EFFORT" "$MAX_EFFORT"
write_model_settings "$WORKTREE" "$MODEL" "$ADVISOR"

if [ "$COPY_CLAUDE_MD" = 1 ] && [ -f "$REPO/CLAUDE.md" ]; then
  if git -C "$WORKTREE" check-ignore -q CLAUDE.md; then
    cp "$REPO/CLAUDE.md" "$WORKTREE/CLAUDE.md"
    log "Copied the local CLAUDE.md (ignored by git)."
  else
    log "warning: CLAUDE.md would not be ignored in the worktree; not copying it."
  fi
fi

jq -n --arg id "$ID" --arg branch "$BRANCH" --arg base "$BASE" --arg base_sha "$BASE_SHA" --arg worktree "$WORKTREE" \
  --arg repo "$REPO" --arg workspace "$WORKSPACE_ID" --arg tab "$TAB_ID" --arg pane "$PANE_ID" --argjson slot "$SLOT" \
  --arg compose "$COMPOSE_PROJECT" --arg log_dir "$LOG_DIR" --arg created "$(utc_now)" \
  --arg effort "$EFFORT" --arg max_effort "$MAX_EFFORT" --arg effort_reason "$EFFORT_REASON" \
  --arg model "$MODEL" --arg advisor "$ADVISOR" '{
    id: $id, branch: $branch, base: $base, base_sha: $base_sha, worktree: $worktree, repo: $repo,
    workspace_id: $workspace, tab_id: $tab, pane_id: $pane, slot: $slot,
    ports: { dev_server: (5180 + $slot), playwright: (4180 + $slot), api: (8080 + $slot), postgres: (5440 + $slot) },
    compose_project: $compose, log_dir: $log_dir, agent: null, created_at: $created, removed_at: null,
    model: (if $model == "" then null else $model end), advisor: (if $advisor == "" then null else $advisor end),
    effort: { level: $effort, max: $max_effort, reason: $effort_reason, verified: null,
              history: [{ at: $created, level: $effort, max: $max_effort, reason: $effort_reason }] }
  }' >"$TASK_DIR/task.json"

if [ "$INSTALL" = 1 ]; then
  log "Running npm ci in $WORKTREE/frontend (log: $LOG_DIR/npm-ci.log)…"
  (cd "$WORKTREE/frontend" && npm ci) >"$LOG_DIR/npm-ci.log" 2>&1 || die "npm ci failed; see $LOG_DIR/npm-ci.log"
fi
cat "$TASK_DIR/task.json"
