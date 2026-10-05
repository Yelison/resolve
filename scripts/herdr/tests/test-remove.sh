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
