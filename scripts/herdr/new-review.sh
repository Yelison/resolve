#!/usr/bin/env bash
# Creates the independent review of a delivered task (review-<id>: a worktree pinned to the task's HEAD, effort
# fixed, no advisor), fills the review brief and starts the reviewer. With --round N it moves the existing review
# to the task's new HEAD and sends the reviewer a round brief. See docs/development/herdr.md.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/herdr/new-review.sh --task ID [--effort high|medium] [--points FILE] [--name NAME] [--lane X]
                                   [--round N] [--ignore-load]

  --task ID       The delivered task to review (its branch HEAD is the reviewed commit)
  --effort LEVEL  Reasoning effort of the reviewer: high (default) or medium
  --points FILE   Extra points the coordinator wants checked, appended to the brief (markdown)
  --name NAME     Agent name (default: rev-ID, at most 32 characters)
  --lane X        Lane the report ends with (REVISIÓN X: …); default: the one in the task's brief
  --round N       The review already exists and the task advanced: move it to the new HEAD (N >= 2), write
                  brief-ronda-N.md with the points and send it to the reviewer
  --ignore-load   Start the reviewer although the load average is above HERDR_MAX_LOAD

The review is the task review-ID; it is retired with scripts/herdr/remove-task.sh like any other task.
USAGE
}

ID= EFFORT=high POINTS= NAME= NAME_GIVEN=0 LANE= ROUND= IGNORE_LOAD=0
while [ $# -gt 0 ]; do
  case $1 in
    --task) need_arg "$1" $#; ID=${2:-}; shift 2 ;;
    --effort) need_arg "$1" $#; EFFORT=${2:-}; shift 2 ;;
    --points) need_arg "$1" $#; POINTS=${2:-}; shift 2 ;;
    --name) need_arg "$1" $#; NAME=${2:-}; NAME_GIVEN=1; shift 2 ;;
    --lane) need_arg "$1" $#; LANE=${2:-}; shift 2 ;;
    --round) need_arg "$1" $#; ROUND=${2:-}; shift 2 ;;
    --ignore-load) IGNORE_LOAD=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
done

require_herdr
[ -n "$ID" ] || { usage >&2; die "--task is required"; }
case $EFFORT in high | medium) ;; *) die "--effort must be high or medium" ;; esac
[ -z "$POINTS" ] || [ -f "$POINTS" ] || die "points file not found: $POINTS"
[ -z "$ROUND" ] || { [[ $ROUND =~ ^[0-9]+$ ]] && [ "$ROUND" -ge 2 ] || die "--round must be a number >= 2"; }
[ -z "$LANE" ] || [[ $LANE =~ ^[A-Za-z0-9._-]+$ ]] || die "invalid lane '$LANE'"

RID="review-$ID"
[[ $RID =~ ^[a-z0-9][a-z0-9._-]{0,39}$ ]] || die "the review id '$RID' is not a valid task id (at most 40 characters: the task id may have 33)"
NAME=${NAME:-$(printf 'rev-%s' "$ID" | tr -c 'a-z0-9_-' '-' | cut -c1-32)}
[[ $NAME =~ ^[a-z][a-z0-9_-]{0,31}$ ]] || die "invalid agent name '$NAME'"

load_task "$ID"
[ -z "$TASK_REMOVED_AT" ] || die "task '$ID' was removed on $TASK_REMOVED_AT"
IMPL_BRIEF="$(task_dir "$ID")/brief.md"
DELIVERY="$(task_dir "$ID")/delivery.md"
[ -f "$IMPL_BRIEF" ] || die "the task has no brief: $IMPL_BRIEF"
[ -f "$DELIVERY" ] || log "warning: no delivery yet at $DELIVERY"
if [ -d "$TASK_WORKTREE" ]; then
  SHA=$(git -C "$TASK_WORKTREE" rev-parse HEAD)
  if [ -n "$(git -C "$TASK_WORKTREE" status --porcelain)" ]; then
    log "warning: the task worktree has uncommitted changes; the review covers only $SHA"
  fi
else
  SHA=$(git -C "$TASK_REPO" rev-parse --verify --quiet "refs/heads/$TASK_BRANCH^{commit}") || die "no worktree and no branch $TASK_BRANCH"
fi
SHA7=${SHA:0:7}
IMPL_BASE=$TASK_BASE_SHA

# Fields the briefs take from the implementer's brief; each falls back instead of failing on an empty match.
TITLE=$(awk '/^# /{ sub(/^# /, ""); print; exit }' "$IMPL_BRIEF")
TITLE=${TITLE:-$ID}
PLAN_REF=$(awk '/^- Id:/{ sub(/^- /, ""); print; exit }' "$IMPL_BRIEF")
PLAN_REF=${PLAN_REF:-"no plan reference in the brief"}
if [ -z "$LANE" ]; then
  LANE=$(sed -n 's/.*ENTREGA \([A-Za-z0-9._-]*\): LISTA.*/\1/p' "$IMPL_BRIEF" | awk 'NR == 1')
  LANE=${LANE:-$ID}
fi

# Commands for the reviewer: the implementer brief's "## Comandos" block, with the review slot's ports spelled out
# (auto mode may refuse to read .env.herdr).
review_commands() {
  local slot=$1 project=$2 ports cmds
  ports=$(slot_ports "$slot" | paste -sd' ')
  cmds=$(awk '/^## Comandos/{ f = 1; next } f && /^## /{ exit } f && /^```/{ if (inb) exit; inb = 1; next } f && inb { print }' "$IMPL_BRIEF")
  printf '# Your slot (%s): %s\n# Docker Compose: always with -p %s\n' "$slot" "$ports" "$project"
  if [ -n "$cmds" ]; then
    printf '%s\n' "$cmds"
  else
    printf '# The implementer brief lists no commands: take them from its acceptance criteria.\ngit log --oneline %s..%s\ngit diff --stat %s..%s\n' \
      "$TASK_BASE_SHA" "$SHA" "$TASK_BASE_SHA" "$SHA"
  fi
}

# The coordinator's extra points as a section (or nothing).
extra_points() {
  [ -n "$POINTS" ] || return 0
  printf '\n## Extra points from the coordinator\n\n'
  cat "$POINTS"
  printf '\n'
}

if [ -z "$ROUND" ]; then
  [ ! -e "$(task_json "$RID")" ] || die "the review $RID already exists; after fixes run: $0 --task $ID --round 2 (or the next number)"
  # Checked once up front, so a loaded machine cannot leave a half-created review: the scripts below skip it.
  check_load "$IGNORE_LOAD"
  BRANCH="review/$ID-$SHA7"
  new_args=(--id "$RID" --branch "$BRANCH" --base "$SHA" --advisor none --effort "$EFFORT"
    --effort-reason "independent review of $ID at $SHA7" --install --ignore-load)
  "$SCRIPT_DIR/new-task.sh" "${new_args[@]}" >/dev/null
  load_task "$RID"
  REVIEW_DIR=$(task_dir "$RID")
  update_task "$RID" '.review = { of: $of, sha: $sha, base_sha: $base, round: 1, lane: $lane }' \
    --arg of "$ID" --arg sha "$SHA" --arg base "$IMPL_BASE" --arg lane "$LANE"
  # TASK_* now describe the review task; the implementer's values were captured above.
  render_template "$SCRIPT_DIR/review-brief.template.md" '{{' '}}' \
    "TASK_TITLE=$TITLE" "TASK_ID=$ID" "PLAN_REF=$PLAN_REF" "IMPL_BRIEF=$IMPL_BRIEF" "DELIVERY=$DELIVERY" \
    "SHA=$SHA" "BASE_SHA=$IMPL_BASE" "WORKTREE=$TASK_WORKTREE" "BRANCH=$TASK_BRANCH" \
    "COMMANDS=$(TASK_BASE_SHA=$IMPL_BASE review_commands "$TASK_SLOT" "$TASK_COMPOSE_PROJECT")" \
    "EXTRA_POINTS=$(extra_points)" "REVIEW_FILE=$REVIEW_DIR/review.md" "FIXES_PROPOSAL=$REVIEW_DIR/fixes-proposal.md" \
    "LANE=$LANE" >"$REVIEW_DIR/brief.md"
  log "Review brief: $REVIEW_DIR/brief.md"
  start_args=(--id "$RID" --name "$NAME" --brief "$REVIEW_DIR/brief.md" --ignore-load)
  "$SCRIPT_DIR/start-agent.sh" "${start_args[@]}"
  exit 0
fi

# Round N: the review exists; move its worktree to the task's current HEAD.
IMPL_ID=$ID
load_task "$RID"
[ -z "$TASK_REMOVED_AT" ] || die "the review $RID was removed on $TASK_REMOVED_AT"
[ -d "$TASK_WORKTREE" ] || die "the review worktree is missing: $TASK_WORKTREE"
[ -z "$(git -C "$TASK_WORKTREE" status --porcelain)" ] || die "the review worktree has uncommitted changes; the reviewer must leave it clean (nothing was moved)"
occupant=$(agent_in_pane "$TASK_PANE" || true)
AGENT_NAME=
if [ -n "$occupant" ]; then
  state=$(jq -r '.agent_status' <<<"$occupant")
  case $state in idle | done) ;; *) die "the reviewer is '$state'; wait until it is idle or done (nothing was moved)" ;; esac
  AGENT_NAME=$(jq -r '.name // empty' <<<"$occupant")
fi
[ -n "$occupant" ] || check_load "$IGNORE_LOAD"   # a reviewer that must be started again needs a new session
OLD_SHA=$(git -C "$TASK_WORKTREE" rev-parse HEAD)
OLD_BASE=$(jq -r --arg d "$IMPL_BASE" '.review.base_sha // $d' "$(task_json "$RID")")
[ "$OLD_SHA" != "$SHA" ] || die "the task is still at $SHA, which the review already covers (nothing to do)"

if git -C "$TASK_WORKTREE" merge-base --is-ancestor "$OLD_SHA" "$SHA"; then
  git -C "$TASK_WORKTREE" merge --ff-only "$SHA" >/dev/null
  HISTORY_NOTE="The new commits sit on top of the previous one: review \`$OLD_SHA..$SHA\` and then the whole range."
else
  NEW_BRANCH="review/$IMPL_ID-$SHA7"
  if git -C "$TASK_REPO" show-ref --verify --quiet "refs/heads/$NEW_BRANCH"; then
    [ "$(git -C "$TASK_REPO" rev-parse "refs/heads/$NEW_BRANCH")" = "$SHA" ] || die "branch $NEW_BRANCH exists at another commit"
    git -C "$TASK_WORKTREE" switch -q "$NEW_BRANCH"
  else
    git -C "$TASK_WORKTREE" switch -q -c "$NEW_BRANCH" "$SHA"
  fi
  update_task "$RID" '.branch = $b' --arg b "$NEW_BRANCH"
  TASK_BRANCH=$NEW_BRANCH
  IMPL_BASE=$(git -C "$TASK_REPO" merge-base "$SHA" origin/main 2>/dev/null || git -C "$TASK_REPO" merge-base "$SHA" main 2>/dev/null || echo "$IMPL_BASE")
  HISTORY_NOTE="The history was rewritten (rebase or amend), so \`$OLD_SHA\` is not an ancestor: compare with \`git range-diff $OLD_BASE..$OLD_SHA $IMPL_BASE..$SHA\`."
fi
[ "$(git -C "$TASK_WORKTREE" rev-parse HEAD)" = "$SHA" ] || die "the review worktree is not at $SHA after moving it"
update_task "$RID" '.review.sha = $sha | .review.base_sha = $base | .review.round = ($round | tonumber)' \
  --arg sha "$SHA" --arg base "$IMPL_BASE" --arg round "$ROUND"

REVIEW_DIR=$(task_dir "$RID")
FIXES="$(task_dir "$IMPL_ID")/fixes-$((ROUND - 1)).md"
if [ -f "$FIXES" ]; then FIXES_REF="\`$FIXES\`"; else FIXES_REF="none written (the implementer's delivery lists what changed)"; fi
ROUND_BRIEF="$REVIEW_DIR/brief-ronda-$ROUND.md"
render_template "$SCRIPT_DIR/review-round.template.md" '{{' '}}' \
  "TASK_TITLE=$TITLE" "ROUND=$ROUND" "FIRST_BRIEF=$REVIEW_DIR/brief.md" "TASK_ID=$IMPL_ID" "PLAN_REF=$PLAN_REF" \
  "IMPL_BRIEF=$IMPL_BRIEF" "DELIVERY=$DELIVERY" "SHA=$SHA" "OLD_SHA=$OLD_SHA" "HISTORY_NOTE=$HISTORY_NOTE" \
  "WORKTREE=$TASK_WORKTREE" "BRANCH=$TASK_BRANCH" "FIXES=$FIXES_REF" \
  "COMMANDS=$(TASK_BASE_SHA=$IMPL_BASE review_commands "$TASK_SLOT" "$TASK_COMPOSE_PROJECT")" \
  "EXTRA_POINTS=$(extra_points)" "REVIEW_FILE=$REVIEW_DIR/review-ronda-$ROUND.md" \
  "FIXES_PROPOSAL=$REVIEW_DIR/fixes-proposal-ronda-$ROUND.md" "LANE=$LANE" >"$ROUND_BRIEF"
log "Round $ROUND brief: $ROUND_BRIEF (review moved from $OLD_SHA to $SHA)"

if [ -n "$AGENT_NAME" ]; then
  herdr agent prompt "$AGENT_NAME" "Round $ROUND: read $ROUND_BRIEF in full and follow it. Your worktree $TASK_WORKTREE is now on branch $TASK_BRANCH at $SHA; verify both before checking anything." >/dev/null \
    || die "the prompt may or may not have been submitted; read the agent before retrying: herdr agent read $AGENT_NAME --source recent-unwrapped --lines 120"
  herdr agent wait "$AGENT_NAME" --until working --timeout 15000 >/dev/null \
    || log "warning: no 'working' state within 15 s; check with: herdr agent get $AGENT_NAME"
  log "Round brief sent to $AGENT_NAME."
else
  log "No reviewer is running; starting one that resumes the last conversation."
  [ "$NAME_GIVEN" = 1 ] || NAME=$(jq -r --arg d "$NAME" '.agent // $d' "$(task_json "$RID")")
  "$SCRIPT_DIR/start-agent.sh" --id "$RID" --name "$NAME" --continue --brief "$ROUND_BRIEF" --ignore-load
fi
