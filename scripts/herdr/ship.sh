#!/usr/bin/env bash
# Takes a reviewed task to main: checks the branch, pushes it (never a push without a lease), opens or reuses the pull
# request, waits for `Full-stack smoke`, schedules the auto-merge (squash by default, or rebase), waits for it,
# fast-forwards the main
# checkout and retires the task and its review. After a confirmed squash merge it also deletes the task's branch and
# its review's. It never merges locally and never schedules a merge before the smoke check is green. See
# docs/development/herdr.md.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/herdr/ship.sh --task ID --title TITLE --body FILE [--merge squash|rebase] [--no-cleanup]

  --task ID       Task whose branch is shipped
  --title TITLE   Pull request title (a Conventional Commit line)
  --body FILE     Pull request description
  --merge METHOD  squash (default: one commit on main, titled TITLE (#PR), listing the series and its
                  Co-Authored-By trailers) or rebase (every commit lands on main, so each must pass on its own)
  --no-cleanup    Keep the task and its review (skip /exit and remove-task.sh)

After a squash merge that is confirmed (the PR is MERGED into main, its head is the local branch's tip and its merge
commit is on origin/main) the branches of the task and its review are deleted; otherwise they are kept, with a note.
Branches are always kept with --merge rebase.

Environment: HERDR_MERGE_METHOD (default merge method, squash), HERDR_PR_ASSIGNEE (assignee of a new PR), HERDR_POLL_SECONDS (default 20) and
HERDR_SHIP_TIMEOUT_SECONDS (each wait, default 1800).
USAGE
}

ID= TITLE= BODY= CLEANUP=1 METHOD=${HERDR_MERGE_METHOD:-squash}
while [ $# -gt 0 ]; do
  case $1 in
    --task) need_arg "$1" $#; ID=${2:-}; shift 2 ;;
    --title) need_arg "$1" $#; TITLE=${2:-}; shift 2 ;;
    --body) need_arg "$1" $#; BODY=${2:-}; shift 2 ;;
    --merge) need_arg "$1" $#; METHOD=${2:-}; shift 2 ;;
    --no-cleanup) CLEANUP=0; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "unknown argument: $1" ;;
  esac
done

require_herdr
need gh
need jq
[ -n "$ID" ] && [ -n "$TITLE" ] && [ -n "$BODY" ] || { usage >&2; die "--task, --title and --body are required"; }
[ -f "$BODY" ] || die "body file not found: $BODY"
case $METHOD in squash | rebase) ;; *) die "--merge must be squash or rebase: $METHOD" ;; esac
POLL=${HERDR_POLL_SECONDS:-20}
TIMEOUT=${HERDR_SHIP_TIMEOUT_SECONDS:-1800}
[[ $POLL =~ ^[0-9]+$ ]] && [[ $TIMEOUT =~ ^[0-9]+$ ]] || die "HERDR_POLL_SECONDS and HERDR_SHIP_TIMEOUT_SECONDS must be whole numbers"

load_task "$ID"
[ -z "$TASK_REMOVED_AT" ] || die "task '$ID' was removed on $TASK_REMOVED_AT"
[ -d "$TASK_WORKTREE" ] || die "the worktree is missing: $TASK_WORKTREE"
BRANCH=$TASK_BRANCH
[ "$(git -C "$TASK_WORKTREE" branch --show-current)" = "$BRANCH" ] || die "the worktree is not on $BRANCH"

# Everything that can stop the run is checked before anything leaves the machine.
dirty=$(git -C "$TASK_WORKTREE" status --porcelain)
if [ -n "$dirty" ]; then
  printf '%s\n' "$dirty" >&2
  die "the worktree has uncommitted changes; commit them first (nothing was pushed)"
fi
[ "$(git -C "$TASK_REPO" branch --show-current)" = main ] || die "the main checkout $TASK_REPO is not on main; it could not be fast-forwarded after the merge (nothing was pushed)"
[ -z "$(git -C "$TASK_REPO" status --porcelain)" ] || die "the main checkout $TASK_REPO has uncommitted changes (nothing was pushed)"
git -C "$TASK_WORKTREE" fetch -q origin main || die "git fetch origin main failed"
if ! git -C "$TASK_WORKTREE" merge-base --is-ancestor origin/main HEAD; then
  die "$BRANCH does not contain origin/main: rebase it first (git -C $TASK_WORKTREE rebase origin/main), have it reviewed again if needed, and rerun (nothing was pushed)"
fi
HEAD_SHA=$(git -C "$TASK_WORKTREE" rev-parse HEAD)

# Push. A rebased branch has to replace what is on the remote, but only with a lease on the exact commit, and only
# when that commit was this branch's own tip before the rebase (it is in the branch's reflog). A tip that was never
# on this branch (someone else's push, even one that was fetched since) is not overwritten, and neither is one that is
# ahead of the local branch.
remote_sha=$(git -C "$TASK_WORKTREE" ls-remote --heads origin "refs/heads/$BRANCH" | awk 'NR == 1 { print $1 }')
if [ -z "$remote_sha" ]; then
  log "Pushing $BRANCH (new on origin)…"
  git -C "$TASK_WORKTREE" push -q -u origin "$BRANCH"
elif [ "$remote_sha" = "$HEAD_SHA" ]; then
  log "$BRANCH is already on origin at $HEAD_SHA."
else
  known=0
  git -C "$TASK_WORKTREE" cat-file -e "$remote_sha^{commit}" 2>/dev/null && known=1
  if [ "$known" = 1 ] && git -C "$TASK_WORKTREE" merge-base --is-ancestor "$remote_sha" HEAD; then
    log "Pushing $BRANCH (fast-forward from $remote_sha)…"
    git -C "$TASK_WORKTREE" push -q -u origin "$BRANCH"
  elif [ "$known" = 1 ] && git -C "$TASK_WORKTREE" merge-base --is-ancestor HEAD "$remote_sha"; then
    die "origin/$BRANCH ($remote_sha) is ahead of the local branch; nothing was pushed. Integrate it into the branch before shipping"
  else
    own_tips=$(git -C "$TASK_WORKTREE" reflog show --format=%H "refs/heads/$BRANCH" 2>/dev/null || true)
    if ! grep -Fqx "$remote_sha" <<<"$own_tips"; then
      die "origin/$BRANCH is at $remote_sha, which this branch never pointed at: it is someone else's work and ship.sh does not overwrite it. Look at it (git fetch origin $BRANCH; git log HEAD..FETCH_HEAD), integrate it into the branch (merge or rebase onto it) and rerun; nothing was pushed"
    fi
    log "origin/$BRANCH ($remote_sha, this branch's own earlier tip) diverged from the local branch (rebased history): pushing with a lease on that commit…"
    git -C "$TASK_WORKTREE" push -q -u --force-with-lease="refs/heads/$BRANCH:$remote_sha" origin "$BRANCH" \
      || die "the push was rejected: origin/$BRANCH moved after it was read; nothing was forced"
  fi
fi

# Pull request: reuse the open one for this branch. gh runs in the main checkout, which outlives the task.
cd "$TASK_REPO"
PR=$(gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
if [ -n "$PR" ]; then
  log "Reusing pull request #$PR (its title and description are left as they are)."
else
  create_args=(--base main --head "$BRANCH" --title "$TITLE" --body-file "$BODY")
  [ -z "${HERDR_PR_ASSIGNEE:-}" ] || create_args+=(--assignee "$HERDR_PR_ASSIGNEE")
  url=$(gh pr create "${create_args[@]}" | awk 'NF { last = $0 } END { print last }')
  PR=${url##*/}
  [[ $PR =~ ^[0-9]+$ ]] || die "could not read the pull request number from: $url"
  log "Opened pull request #$PR: $url"
fi

# The PR must show the commit that was just pushed before its checks mean anything (GitHub updates it a moment
# after the push; the checks of the previous head would otherwise count).
SECONDS=0
while :; do
  pr_head=$(gh pr view "$PR" --json headRefOid --jq .headRefOid 2>/dev/null || true)
  [ "$pr_head" != "$HEAD_SHA" ] || break
  [ "$SECONDS" -lt "$TIMEOUT" ] || die "pull request #$PR still shows ${pr_head:-no head} instead of $HEAD_SHA after ${TIMEOUT}s; the merge was not scheduled"
  log "Waiting for #$PR to show $HEAD_SHA (it shows ${pr_head:-nothing})…"
  sleep "$POLL"
done

# Smoke first. gh pr checks exits non-zero while checks are pending or failed, so read its JSON and decide here.
smoke_bucket() {
  # The most recent run if the check ran more than once (reruns); but a run that has not started (pending, or no
  # start time, or Go's zero time) is a rerun in the queue, which counts as the newest: wait for it.
  gh pr checks "$PR" --json name,bucket,startedAt 2>/dev/null \
    | jq -r '[.[]? | select(.name == "Full-stack smoke")] as $r
        | if ($r | length) == 0 then "absent"
          elif any($r[]; .bucket == "pending" or ((.startedAt // "") == "") or ((.startedAt // "") | startswith("0001-"))) then "pending"
          else ($r | sort_by(.startedAt) | last | .bucket) end' 2>/dev/null || true
}
SECONDS=0
while :; do
  bucket=$(smoke_bucket)
  case ${bucket:-absent} in
    pass) log "Full-stack smoke passed."; break ;;
    fail | cancel | skipping)
      gh pr checks "$PR" >&2 || true
      die "Full-stack smoke is '$bucket' on pull request #$PR; the merge was not scheduled" ;;
  esac
  [ "$SECONDS" -lt "$TIMEOUT" ] || { gh pr checks "$PR" >&2 || true; die "Full-stack smoke did not finish in ${TIMEOUT}s (last state: ${bucket:-absent}); the merge was not scheduled"; }
  log "Waiting for Full-stack smoke (${bucket:-absent})…"
  sleep "$POLL"
done

if [ "$METHOD" = squash ]; then
  # One commit on main: the PR title, the series it replaces and every co-author of the series.
  series=$(git -C "$TASK_WORKTREE" log --reverse --format='- %s' origin/main..HEAD)
  coauthors=$(git -C "$TASK_WORKTREE" log --format='%(trailers:key=Co-Authored-By)' origin/main..HEAD | grep -v '^$' | sort -u || true)
  message=$(printf 'Squashed from:\n\n%s\n%s' "$series" "${coauthors:+$'\n'$coauthors}")
  gh pr merge "$PR" --auto --squash --subject "$TITLE (#$PR)" --body "$message" --match-head-commit "$HEAD_SHA" >/dev/null \
    || die "gh pr merge --auto --squash failed for #$PR"
else
  gh pr merge "$PR" --auto --rebase --match-head-commit "$HEAD_SHA" >/dev/null || die "gh pr merge --auto --rebase failed for #$PR"
fi
log "Auto-merge ($METHOD) scheduled for #$PR; waiting for it…"
SECONDS=0
MERGED_SHA= MERGED_HEAD= MERGED_BASE=
while :; do
  # "-" stands for a missing or empty value: tab is IFS whitespace, so an empty field would shift the ones after it.
  if ! view=$(gh pr view "$PR" --json state,mergeCommit,headRefOid,baseRefName --jq 'def d: if . == null or . == "" then "-" else . end; [.state, (.headRefOid | d), (.baseRefName | d), (.mergeCommit.oid | d)] | @tsv'); then
    [ "$SECONDS" -lt "$TIMEOUT" ] || die "gh could not read pull request #$PR in ${TIMEOUT}s; the auto-merge stays scheduled"
    log "gh could not read #$PR; retrying…"
    sleep "$POLL"
    continue
  fi
  IFS=$'\t' read -r state merged_head merged_base merge_oid <<<"$view"
  case $state in
    MERGED) MERGED_SHA=${merge_oid#-}; MERGED_HEAD=${merged_head#-}; MERGED_BASE=${merged_base#-}; break ;;
    CLOSED) die "pull request #$PR was closed without merging" ;;
  esac
  if gh pr checks "$PR" --json bucket 2>/dev/null | jq -e '[.[]? | select(.bucket == "fail")] | length > 0' >/dev/null 2>&1; then
    gh pr checks "$PR" >&2 || true
    die "a check of #$PR failed, so the auto-merge will not run"
  fi
  [ "$SECONDS" -lt "$TIMEOUT" ] || die "pull request #$PR was not merged in ${TIMEOUT}s (state: $state); the auto-merge stays scheduled"
  sleep "$POLL"
done

git -C "$TASK_REPO" fetch -q origin main

# A squash leaves one new patch on main, which `git branch -d` cannot match to the series, so the branches would pile up.
# They are deleted only when GitHub merged exactly what the local branch holds, into main: the PR is MERGED (the wait
# above), its base is main, its head is the local tip and its merge commit is on origin/main. Whichever fails keeps the
# branches and says which. The rebase method is left as it was.
SQUASHED_HEAD=
if [ "$METHOD" = squash ]; then
  local_tip=$(git -C "$TASK_REPO" rev-parse --verify --quiet "refs/heads/$BRANCH" || true)
  squash_note=
  if [ "$MERGED_BASE" != main ]; then
    squash_note="the pull request was merged into '${MERGED_BASE:-an unknown base}', not main"
  elif [ -z "$MERGED_HEAD" ] || [ "$MERGED_HEAD" != "$local_tip" ]; then
    squash_note="GitHub squash-merged ${MERGED_HEAD:-an unknown head} but $BRANCH is at ${local_tip:-nowhere}"
  elif ! [[ $MERGED_SHA =~ ^[0-9a-f]{40}$ ]] || ! git -C "$TASK_REPO" merge-base --is-ancestor "$MERGED_SHA^{commit}" origin/main; then
    squash_note="the merge commit ${MERGED_SHA:-(unknown)} is not on origin/main"
  else
    SQUASHED_HEAD=$MERGED_HEAD
  fi
  [ -z "$squash_note" ] || log "note: $squash_note; the branches are kept"
fi
git -C "$TASK_REPO" merge -q --ff-only origin/main \
  || die "#$PR is merged but the main checkout could not be fast-forwarded; fix it by hand. The task was not retired"
[ -n "$MERGED_SHA" ] || MERGED_SHA=$(git -C "$TASK_REPO" rev-parse origin/main)
log "Merged #$PR into main."
printf 'merged %s\n' "$MERGED_SHA"

if [ "$CLEANUP" = 0 ]; then
  log "Cleanup skipped (--no-cleanup): $ID and review-$ID stay where they are."
  exit 0
fi
# What remove-task.sh gets, and what the messages below tell you to run by hand.
retire_flags=(--volumes)
[ -z "$SQUASHED_HEAD" ] || retire_flags+=(--delete-branch --squashed-head "$SQUASHED_HEAD")
retire() {
  local id=$1 occupant name
  [ -f "$(task_json "$id")" ] || return 0
  load_task "$id"
  [ -z "$TASK_REMOVED_AT" ] || return 0
  occupant=$(agent_in_pane "$TASK_PANE" || true)
  if [ -n "$occupant" ]; then
    name=$(jq -r '.name // empty' <<<"$occupant")
    [ -n "$name" ] || die "the agent in $TASK_PANE has no name; exit it by hand, then: scripts/herdr/remove-task.sh --id $id ${retire_flags[*]}"
    state=$(jq -r '.agent_status // "unknown"' <<<"$occupant")
    case $state in
      working | blocked) die "'$name' is $state, so it was not sent /exit; #$PR is merged (main at $MERGED_SHA). Let it finish, then run: scripts/herdr/remove-task.sh --id $id ${retire_flags[*]}" ;;
    esac
    log "Exiting '$name'…"
    herdr agent prompt "$name" "/exit" >/dev/null || true
    for _ in $(seq 1 30); do
      [ -z "$(agent_in_pane "$TASK_PANE" || true)" ] && break
      sleep 1
    done
    [ -z "$(agent_in_pane "$TASK_PANE" || true)" ] || die "'$name' did not exit; #$PR is merged. Then run: scripts/herdr/remove-task.sh --id $id ${retire_flags[*]}"
  fi
  "$SCRIPT_DIR/remove-task.sh" --id "$id" "${retire_flags[@]}" \
    || die "#$PR is merged (main at $MERGED_SHA) but '$id' was not retired; deal with what it reported and run: scripts/herdr/remove-task.sh --id $id ${retire_flags[*]}"
}
retire "review-$ID"
retire "$ID"
log "Shipped: #$PR merged as $MERGED_SHA; $ID and review-$ID retired."
