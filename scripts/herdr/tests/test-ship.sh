#!/usr/bin/env bash
# ship.sh against a fake gh and a local bare remote. Usage: test-ship.sh [scenario...]
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# Slots are chosen again for every scenario: other agents on the machine start and stop servers meanwhile.
mk() {
  mk_env; SA=$(pick_slot) || exit 2; SB=$(pick_slot "$SA") || exit 2; mk_impl "$SA"
  "$HERDR/new-review.sh" --task impl-a --slot "$SB" >/dev/null 2>"$T/err" || { echo "mk: new-review.sh failed: $(cat "$T/err")" >&2; exit 2; }
  echo pass >"$T/state/gh/checks"
}
ship() { "$HERDR/ship.sh" --task impl-a --title "feat: demo" --body "$T/body.md" "$@" 2>&1; }
gh_calls() { cat "$T/state/gh/calls.log" 2>/dev/null || true; }
remote_has() { git --git-dir "$T/remote.git" rev-parse -q --verify "refs/heads/$1" >/dev/null; }
retired() { [ "$(jq -r .removed_at "$T/root/tasks/$1/task.json")" != null ]; }
# After a first ship the fake merged the branch: put main back at the base and move it on, so the branch needs a rebase.
advance_main() {
  local base; base=$(git -C "$W" rev-parse HEAD~1); rm -f "$T/state/gh/auto"
  git --git-dir "$T/remote.git" update-ref refs/heads/main "$base"; git -C "$T/repo" reset -q --hard "$base"
  rm -rf "$T/other"; git clone -q "$T/remote.git" "$T/other"
  git -C "$T/other" -c user.name=o -c user.email=o@x commit -q --allow-empty -m "main moved"; git -C "$T/other" push -q origin main
}
rebase_branch() { git -C "$W" fetch -q origin main; git -C "$W" reset -q --hard origin/main; git -C "$W" commit -q --allow-empty -m "$1"; }
# A shim in front of git that runs a command right before any `git push` (a race after ship.sh read the remote).
push_shim() { mkdir -p "$T/shim"; real=$(command -v git)
  printf '#!/bin/bash\nfor a in "$@"; do if [ "$a" = push ]; then %s; break; fi; done\nexec "%s" "$@"\n' "$1" "$real" >"$T/shim/git"; chmod +x "$T/shim/git"; }

s_dirty() { mk; touch "$W/x"; out=$(ship); check "dirty: refused" test $? -ne 0; check "dirty: message" says x 'uncommitted'; check "dirty: nothing pushed" bash -c "! git --git-dir '$T/remote.git' rev-parse -q --verify refs/heads/feat/impl-a"; }
s_noorigin() { mk; git clone -q "$T/remote.git" "$T/other"; git -C "$T/other" -c user.name=o -c user.email=o@x commit -q --allow-empty -m "main moved"; git -C "$T/other" push -q origin main
  out=$(ship); check "stale base: refused" test $? -ne 0; check "stale base: says rebase" says x 'does not contain origin/main'; check "stale base: nothing pushed" bash -c "! git --git-dir '$T/remote.git' rev-parse -q --verify refs/heads/feat/impl-a"; check "stale base: no gh" test -z "$(gh_calls)"; }
s_happy() { mk; echo pending:2 >"$T/state/gh/checks"
  out=$(HERDR_PR_ASSIGNEE=Yelison ship); rc=$?
  check "happy: rc 0" test $rc -eq 0; check "happy: pushed" remote_has feat/impl-a
  check "happy: assignee" grep -q -- '--assignee Yelison' <<<"$(gh_calls)"
  head=$(git --git-dir "$T/remote.git" rev-parse refs/heads/feat/impl-a)
  check "happy: merge scheduled with --auto --rebase and the pushed head" grep -q "pr merge 41 --auto --rebase --match-head-commit $head" <<<"$(gh_calls)"
  check "happy: merge after the smoke polls" test "$(grep -n 'pr merge' "$T/state/gh/calls.log" | cut -d: -f1)" -gt "$(grep -n 'pr checks' "$T/state/gh/calls.log" | tail -1 | cut -d: -f1)"
  want=$(git --git-dir "$T/remote.git" rev-parse refs/heads/main)
  check "happy: prints merged sha" grep -qx "merged $want" <<<"$out"
  check "happy: main checkout fast-forwarded" test "$(git -C "$T/repo" rev-parse HEAD)" = "$want"
  check "happy: task retired" retired impl-a; check "happy: review retired" retired review-impl-a
  check "happy: worktrees gone" bash -c "! test -e '$W' && ! test -e '$T/root/worktrees/review-impl-a'"
  check "happy: reviewer sent /exit" grep -q '/exit' "$T/state/prompts.log"
  check "happy: volumes removed for each task" test "$(grep -c 'down --volumes' "$T/state/docker.log")" -eq 2; }
s_reuse() { mk; echo '{"number":41,"head":"feat/impl-a","state":"OPEN"}' >"$T/state/gh/pr.json"
  out=$(ship --no-cleanup); check "reuse: rc 0" test $? -eq 0; check "reuse: no pr create" bash -c "! grep -q 'pr create' '$T/state/gh/calls.log'"; check "reuse: says so" says x 'Reusing pull request #41'
  check "no-cleanup: not retired" bash -c "[ \"\$(jq -r .removed_at '$T/root/tasks/impl-a/task.json')\" = null ]"; check "no-cleanup: worktree kept" test -d "$W"; }
s_red() { mk; echo fail >"$T/state/gh/checks"; out=$(ship)
  check "red: refused" test $? -ne 0; check "red: says smoke" says x 'Full-stack smoke is'; check "red: no merge scheduled" bash -c "! grep -q 'pr merge' '$T/state/gh/calls.log'"; check "red: task kept" test "$(jq -r .removed_at "$T/root/tasks/impl-a/task.json")" = null; }
s_absent() { mk; echo absent >"$T/state/gh/checks"; out=$(HERDR_SHIP_TIMEOUT_SECONDS=1 ship)
  check "absent smoke: times out" test $? -ne 0; check "absent smoke: no merge" bash -c "! grep -q 'pr merge' '$T/state/gh/calls.log'"; }
s_multi() { mk; echo multi >"$T/state/gh/checks"; out=$(ship --no-cleanup)
  check "latest run counts: an old failure does not stop a newer pass" test $? -eq 0; check "latest run: merge scheduled" grep -q 'pr merge' "$T/state/gh/calls.log"; }
# B6: a rerun that is still in the queue counts as the newest run, whatever its start time looks like.
s_queued() { mk; local mode
  for mode in queued queued-null; do
    rm -f "$T/state/gh/calls.log"; echo "$mode" >"$T/state/gh/checks"; out=$(HERDR_SHIP_TIMEOUT_SECONDS=1 ship --no-cleanup)
    check "$mode: waits, then gives up" test $? -ne 0; check "$mode: says it did not finish" says x 'did not finish'; check "$mode: no merge scheduled" bash -c "! grep -q 'pr merge' '$T/state/gh/calls.log'"
  done
  echo requeue:2 >"$T/state/gh/checks"; rm -f "$T/state/gh/polls"; out=$(ship --no-cleanup)
  check "requeue: waits for the rerun and then merges" test $? -eq 0; check "requeue: merge scheduled after waiting" grep -q 'pr merge' "$T/state/gh/calls.log"; }
s_stale() { mk; echo 2 >"$T/state/gh/stale"; out=$(ship --no-cleanup); rc=$?
  check "stale head: rc 0" test $rc -eq 0; check "stale head: waited" says x 'Waiting for #41 to show'
  check "stale head: no checks read before the head matched" test "$(grep -n 'headRefOid' "$T/state/gh/calls.log" | tail -1 | cut -d: -f1)" -lt "$(grep -n 'pr checks' "$T/state/gh/calls.log" | head -1 | cut -d: -f1)"
  echo 100 >"$T/state/gh/stale"; out=$(HERDR_SHIP_TIMEOUT_SECONDS=1 ship --no-cleanup); check "head never shown: refused" test $? -ne 0; }
s_lease() { mk; ship --no-cleanup >/dev/null; old=$(git --git-dir "$T/remote.git" rev-parse refs/heads/feat/impl-a)
  advance_main; rebase_branch "feat: one rebased"
  out=$(ship --no-cleanup); check "lease: rebased push ok" test $? -eq 0; check "lease: remote has the new tip" test "$(git --git-dir "$T/remote.git" rev-parse refs/heads/feat/impl-a)" = "$(git -C "$W" rev-parse HEAD)"; check "lease: said so" says x 'with a lease'; check "lease: the old tip was replaced" test "$old" != "$(git -C "$W" rev-parse HEAD)"; }
# M1: someone else pushed on top of the published tip; fetching it later must not make it overwritable.
s_foreign() { mk; ship --no-cleanup >/dev/null
  git clone -q "$T/remote.git" "$T/other2"; git -C "$T/other2" checkout -q feat/impl-a; git -C "$T/other2" -c user.name=o -c user.email=o@x commit -q --allow-empty -m "someone else"; git -C "$T/other2" push -q origin feat/impl-a
  other=$(git -C "$T/other2" rev-parse HEAD); advance_main; rebase_branch "feat: rebased"
  out=$(ship --no-cleanup); check "foreign tip: refused" test $? -ne 0; check "foreign tip: says it is not overwritten" says x 'ship.sh does not overwrite it'
  git -C "$W" fetch -q origin feat/impl-a
  out=$(ship --no-cleanup); check "foreign tip after a fetch: still refused" test $? -ne 0; check "foreign tip: remote untouched" test "$(git --git-dir "$T/remote.git" rev-parse refs/heads/feat/impl-a)" = "$other"
  check "foreign tip: the message does not offer a way to force" test -z "$(grep -i 'force' <<<"$out")"; }
s_ahead() { mk; ship --no-cleanup >/dev/null
  git -C "$W" commit -q --allow-empty -m "feat: two"; git -C "$W" push -q origin feat/impl-a; git -C "$W" reset -q --hard HEAD~1
  out=$(ship --no-cleanup); check "remote ahead: refused" test $? -ne 0; check "remote ahead: message" says x 'is ahead of the local branch'; }
s_race() { mk; ship --no-cleanup >/dev/null; advance_main; rebase_branch "feat: rebased"
  other=$(git -C "$W" commit-tree -p "$(git -C "$W" rev-parse HEAD~1)" -m raced "$(git -C "$W" rev-parse 'HEAD^{tree}')")
  git -C "$W" push -q origin "$other:refs/heads/race-tmp"
  real=$(command -v git)
  push_shim "\"$real\" --git-dir \"$T/remote.git\" update-ref refs/heads/feat/impl-a $other"
  out=$(PATH="$T/shim:$PATH" ship --no-cleanup); check "race: rejected" test $? -ne 0; check "race: message" says x 'nothing was forced'; check "race: remote kept the raced commit" test "$(git --git-dir "$T/remote.git" rev-parse refs/heads/feat/impl-a)" = "$other"; }
# A reviewer that is still working is not sent /exit.
s_working() { mk; jq '.agent_status="working"' "$T/state/agents/rev-impl-a" >"$T/x" && mv "$T/x" "$T/state/agents/rev-impl-a"
  out=$(ship); check "working agent: stops" test $? -ne 0; check "working agent: says so" says x 'is working, so it was not sent /exit'; check "working agent: no /exit sent" bash -c "! grep -q '/exit' '$T/state/prompts.log' 2>/dev/null"
  check "working agent: the merge is reported" says x "merged "; check "working agent: reviewer still live" test -e "$T/state/agents/rev-impl-a"; }

scen=("$@"); [ ${#scen[@]} -gt 0 ] || scen=(dirty noorigin happy reuse red absent multi queued stale lease foreign ahead race working)
for s in "${scen[@]}"; do echo "== $s"; "s_$s"; done
finish
