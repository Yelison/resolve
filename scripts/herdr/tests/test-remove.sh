#!/usr/bin/env bash
# remove-task.sh: leftovers (processes on the slot's ports, containers) and --volumes.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
mk_env; SA=$(pick_slot) || exit 2; PORT=$((5180 + SA))
new() { "$HERDR/new-task.sh" --id "$1" --branch "feat/$1" --slot "$SA" --effort medium --effort-reason r >/dev/null 2>&1; }
removed() { [ "$(jq -r .removed_at "$T/root/tasks/$1/task.json")" != null ]; }

echo "== clean task"
new left-a; out=$("$HERDR/remove-task.sh" --id left-a 2>&1); check "clean: rc 0" test $? -eq 0; check "clean: retired" removed left-a

echo "== T2: a dirty worktree is refused before any docker compose down"
new left-w; echo "# local edit" >>"$T/root/worktrees/left-w/.gitignore"; rm -f "$T/state/docker.log"; echo resolve-left-w >"$T/state/compose-projects"
out=$("$HERDR/remove-task.sh" --id left-w --volumes 2>&1); rc=$?
check "dirty: refused" test $rc -ne 0; check "dirty: says uncommitted" says x 'uncommitted'
check "dirty: no docker down" bash -c "! grep -q 'down' '$T/state/docker.log' 2>/dev/null"
check "dirty: the worktree stays" test -d "$T/root/worktrees/left-w"; check "dirty: not retired" bash -c "[ \"\$(jq -r .removed_at '$T/root/tasks/left-w/task.json')\" = null ]"
git -C "$T/root/worktrees/left-w" checkout -q -- .gitignore; rm -f "$T/state/compose-projects"
out=$("$HERDR/remove-task.sh" --id left-w --volumes 2>&1); check "dirty fixed: retired" removed left-w

echo "== a process listening on the slot's port"
new left-b; mkdir -p "$T/srv"
(cd "$T/srv" && exec python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1) & PID=$!
for _ in $(seq 1 25); do ss -ltnH | grep -q ":$PORT " && break; sleep 0.2; done
out=$("$HERDR/remove-task.sh" --id left-b 2>&1); rc=$?
check "listener: refused" test $rc -ne 0; check "listener: shows the pid" says x "pid $PID,"; check "listener: shows the command" says x "http.server $PORT"
check "listener: shows the cwd" says x "cwd $T/srv"; check "listener: nothing removed" test -d "$T/root/worktrees/left-b"; check "listener: the process is still alive" kill -0 "$PID"
kill "$PID"; wait "$PID" 2>/dev/null

echo "== a container of the project"
rm -f "$T/state/docker.log"; echo "abc123 resolve-left-b-postgres-1 (Exited (0) 2 minutes ago)" >"$T/state/containers"
out=$("$HERDR/remove-task.sh" --id left-b 2>&1); rc=$?
check "container: refused" test $rc -ne 0; check "container: listed" says x 'container abc123 resolve-left-b-postgres-1'
check "container: nothing stopped by the script" bash -c "! grep -q 'down' '$T/state/docker.log'"
check "container: the advice is plain down" says x 'docker compose -p resolve-left-b down for'
out=$("$HERDR/remove-task.sh" --id left-b --volumes 2>&1)
check "container with --volumes: the advice says down --volumes" says x 'docker compose -p resolve-left-b down --volumes'

echo "== M2: --volumes removes the volumes even when compose lists no project"
: >"$T/state/containers"; rm -f "$T/state/compose-projects" "$T/state/docker.log"
out=$("$HERDR/remove-task.sh" --id left-b --volumes 2>&1); rc=$?
check "volumes: rc 0" test $rc -eq 0; check "volumes: retired" removed left-b
check "volumes: down --volumes ran for the project" grep -q 'compose -p resolve-left-b -f .* down --volumes' "$T/state/docker.log"
new left-c; rm -f "$T/state/docker.log"; out=$("$HERDR/remove-task.sh" --id left-c 2>&1)
check "no --volumes and no project: compose is left alone" bash -c "! grep -q 'down' '$T/state/docker.log'"

echo "== --squashed-head: the head GitHub squash-merged is deleted, anything else is kept"
has_branch() { git -C "$T/repo" rev-parse -q --verify "refs/heads/$1" >/dev/null; }
tip_of() { git -C "$T/repo" rev-parse "refs/heads/$1"; }
commit_in() { echo "$2" >"$T/root/worktrees/$1/$2"; git -C "$T/root/worktrees/$1" add "$2"; git -C "$T/root/worktrees/$1" commit -q -m "feat: $2"; }
# What GitHub's squash merge leaves in main: the whole series as one new patch, which `git branch -d` does not see as merged.
land_squashed() { git -C "$T/repo" cherry-pick -n "$1~1" "$1" >/dev/null && git -C "$T/repo" commit -q -m "feat: squashed"; }
new sq-a; commit_in sq-a a1.txt; commit_in sq-a a2.txt; land_squashed feat/sq-a
out=$("$HERDR/remove-task.sh" --id sq-a --delete-branch 2>&1); check "without the flag: git refuses the squashed series, as before" test $? -ne 0; check "without the flag: the branch is kept" has_branch feat/sq-a
# The refused task keeps its slot until it is retired: retire it (the branch goes by hand) so the next ones can use it.
git -C "$T/repo" branch -q -D feat/sq-a; out=$("$HERDR/remove-task.sh" --id sq-a 2>&1); check "without the flag: retired once the branch is gone" removed sq-a
new sq-b; commit_in sq-b b1.txt; commit_in sq-b b2.txt; land_squashed feat/sq-b; head=$(tip_of feat/sq-b)
out=$("$HERDR/remove-task.sh" --id sq-b --delete-branch --squashed-head "$head" 2>&1); rc=$?
check "squashed head: rc 0" test $rc -eq 0; check "squashed head: retired" removed sq-b
check "squashed head: the branch is deleted" bash -c "! git -C '$T/repo' rev-parse -q --verify refs/heads/feat/sq-b"; check "squashed head: says why" says x 'exactly the head GitHub squash-merged'
new sq-c; commit_in sq-c c1.txt; commit_in sq-c c2.txt; land_squashed feat/sq-c; head=$(tip_of feat/sq-c); commit_in sq-c late.txt
out=$("$HERDR/remove-task.sh" --id sq-c --delete-branch --squashed-head "$head" 2>&1); rc=$?
check "a commit past the squashed head: rc 0" test $rc -eq 0; check "a commit past the squashed head: retired" removed sq-c
check "a commit past the squashed head: the branch is kept" has_branch feat/sq-c; check "a commit past the squashed head: says so" says x 'Branch feat/sq-c kept'
check "a commit past the squashed head: the late commit is still there" test "$(git -C "$T/repo" log -1 --format=%s feat/sq-c)" = "feat: late.txt"
new sq-d; commit_in sq-d d1.txt; head=$(tip_of feat/sq-d); other=$(git -C "$T/repo" rev-parse main)
out=$("$HERDR/remove-task.sh" --id sq-d --delete-branch --squashed-head "$other" 2>&1); rc=$?
check "a SHA that is not the tip: rc 0" test $rc -eq 0; check "a SHA that is not the tip: the branch is kept" has_branch feat/sq-d; check "a SHA that is not the tip: its commit is intact" test "$(tip_of feat/sq-d)" = "$head"
echo "== --squashed-head: options that are wrong remove nothing"
new sq-e; commit_in sq-e e1.txt; head=$(tip_of feat/sq-e); w="$T/root/worktrees/sq-e"
refused() { out=$("$HERDR/remove-task.sh" --id sq-e "$@" 2>&1); rc=$?; [ $rc -ne 0 ] && test -d "$w" && has_branch feat/sq-e && [ "$(jq -r .removed_at "$T/root/tasks/sq-e/task.json")" = null ]; }
check "without --delete-branch: refused, nothing removed" refused --squashed-head "$head"; check "without --delete-branch: says it needs --delete-branch" says x 'only makes sense with --delete-branch'
check "a short SHA: refused, nothing removed" refused --delete-branch --squashed-head "${head:0:7}"; check "a short SHA: says it must be a full SHA" says x 'full 40-character commit SHA'
check "a ref that is not a SHA: refused, nothing removed" refused --delete-branch --squashed-head main
check "an unknown commit: refused, nothing removed" refused --delete-branch --squashed-head 0000000000000000000000000000000000000000; check "an unknown commit: says so" says x 'is not a commit of this repository'
check "no value: refused, nothing removed" refused --delete-branch --squashed-head
check "an empty value: refused, nothing removed" refused --delete-branch --squashed-head ""; check "an empty value: says it needs a SHA" says x 'not an empty value'
check "an empty value without --delete-branch: refused, nothing removed" refused --squashed-head ""
echo "# local edit" >>"$w/.gitignore"
check "a dirty worktree: refused, the branch is intact" refused --delete-branch --squashed-head "$head"; check "a dirty worktree: says uncommitted" says x 'uncommitted'
git -C "$w" checkout -q -- .gitignore
out=$("$HERDR/remove-task.sh" --id sq-e --delete-branch --squashed-head "$head" 2>&1); check "once the options are right: retired" removed sq-e
check "once the options are right: the branch is deleted" bash -c "! git -C '$T/repo' rev-parse -q --verify refs/heads/feat/sq-e"

echo "== forced"
new left-d; echo "abc123 resolve-left-d-postgres-1 (Up 2 minutes)" >"$T/state/containers"; echo resolve-left-d >"$T/state/compose-projects"; rm -f "$T/state/docker.log"
out=$("$HERDR/remove-task.sh" --id left-d --force-leftovers 2>&1); rc=$?
check "forced: rc 0" test $rc -eq 0; check "forced: the compose project is stopped" grep -q 'compose -p resolve-left-d' "$T/state/docker.log"

echo "== docker cannot answer"
new left-e; : >"$T/state/containers"; rm -f "$T/state/compose-projects"
out=$(FAKE_DOCKER_FAIL=1 "$HERDR/remove-task.sh" --id left-e 2>&1); rc=$?
check "docker ps failing: refused" test $rc -ne 0; check "docker ps failing: says so" says x 'could not list the containers'; check "docker ps failing: nothing removed" test -d "$T/root/worktrees/left-e"
out=$(FAKE_DOCKER_FAIL=1 "$HERDR/remove-task.sh" --id left-e --force-leftovers 2>&1); check "docker ps failing: --force-leftovers goes on" test $? -eq 0
finish
