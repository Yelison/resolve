#!/usr/bin/env bash
# heavy.sh: one machine-wide lock for heavy test batteries, low priority, exit status passed through.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
H="$SCRIPTS_SRC/heavy.sh"
export HERDR_HEAVY_LOCK="$TEST_TMP/heavy.lock"
log="$TEST_TMP/heavy.log"
: >"$log"
"$H" bash -c "echo start-a >>'$log'; sleep 1; echo end-a >>'$log'" &
a=$!
sleep 0.2
out=$("$H" bash -c "echo start-b >>'$log'" 2>&1)
wait "$a"
check "the second command waits for the first" test "$(tr '\n' ' ' <"$log")" = "start-a end-a start-b "
check "the waiting command says who holds the lock" says x 'waiting for the machine-wide lock'
out=$("$H" bash -c 'exit 3' 2>&1); rc=$?
check "the exit status is passed through" test "$rc" -eq 3
out=$("$H" sh -c 'cut -d" " -f19 /proc/self/stat' 2>&1)
check "it runs at nice 10" test "$out" = 10
out=$(HERDR_HEAVY_NICE=x "$H" true 2>&1); rc=$?
check "a non-numeric nice level is refused" test "$rc" -eq 2
out=$("$H" 2>&1); rc=$?
check "no command: usage and status 2" test "$rc" -eq 2
finish
