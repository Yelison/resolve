#!/usr/bin/env bash
# The load limit of new-task.sh, start-agent.sh and set-effort.sh.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
mk_env; SA=$(pick_slot) || exit 2; SB=$(pick_slot "$SA") || exit 2
args=(--effort medium --effort-reason r)
out=$(HERDR_MAX_LOAD=0 "$HERDR/new-task.sh" --id load-a --branch feat/load-a --slot "$SA" "${args[@]}" 2>&1); rc=$?
check "new-task at limit 0: refused" test $rc -ne 0; check "new-task: says the load and the limit" says x 'load average'
check "new-task: nothing created" bash -c "! test -e '$T/root/worktrees/load-a' && ! test -e '$T/root/tasks/load-a' && ! git -C '$T/repo' show-ref --verify -q refs/heads/feat/load-a"
out=$(HERDR_MAX_LOAD=0 "$HERDR/new-task.sh" --id load-a --branch feat/load-a --slot "$SA" "${args[@]}" --ignore-load 2>&1); check "new-task --ignore-load: created" test $? -eq 0
out=$(HERDR_MAX_LOAD=abc "$HERDR/new-task.sh" --id load-d --branch feat/load-d --slot "$SB" 2>&1); check "non-numeric limit: refused" says x 'must be a number'
out=$(HERDR_MAX_LOAD=0 "$HERDR/start-agent.sh" --id load-a --name la 2>&1); check "start-agent: refused" test $? -ne 0; check "start-agent: no agent started" test ! -e "$T/state/agents/la"
out=$(HERDR_MAX_LOAD=0 "$HERDR/start-agent.sh" --id load-a --name la --ignore-load 2>&1); check "start-agent --ignore-load: started" test -e "$T/state/agents/la"
out=$(HERDR_MAX_LOAD=0 "$HERDR/set-effort.sh" --id load-a --level high --reason test --restart 2>&1); check "set-effort --restart: refused" test $? -ne 0; check "set-effort --restart: the agent keeps running" test -e "$T/state/agents/la"
echo "== the message names the limit that applies (B3)"
cores=$(nproc --all); load=$(cut -d' ' -f1 /proc/loadavg)
out=$(HERDR_MAX_LOAD=0.01 "$HERDR/new-task.sh" --id load-m --branch feat/load-m --slot "$SB" 2>&1); check "explicit limit: named HERDR_MAX_LOAD" says x '(HERDR_MAX_LOAD)'
unset HERDR_MAX_LOAD
out=$(OMP_NUM_THREADS=1 "$HERDR/new-task.sh" --id load-o --branch feat/load-o --slot "$SB" 2>&1)
if awk -v l="$load" -v m="$(awk -v c="$cores" 'BEGIN{print 1.5*c}')" 'BEGIN{exit !(l>m)}'; then
  check "default limit uses all cores, not OMP_NUM_THREADS" says x "default 1.5 x $cores cores"
else
  check "default limit with OMP_NUM_THREADS=1: not refused below 1.5 x all cores" test -e "$T/root/tasks/load-o/task.json"
fi
finish
