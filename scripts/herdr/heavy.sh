#!/usr/bin/env bash
# Runs a heavy test command (Playwright, vitest in a browser, ./mvnw verify) behind one machine-wide lock, at low
# priority, so that only one such battery runs at a time across every agent and every project on this machine.
# Others wait their turn instead of competing for the CPU. Usage, from any directory:
#   scripts/herdr/heavy.sh npx playwright test e2e/reports.spec.ts --workers=2
# HERDR_HEAVY_LOCK (default /tmp/herdr-heavy.lock) is the lock file: every project must use the same one.
# HERDR_HEAVY_NICE (default 10) is the nice level. The command's exit status is returned unchanged.
set -euo pipefail

[ $# -gt 0 ] || { echo "usage: $(basename "$0") COMMAND [ARG...]" >&2; exit 2; }
command -v flock >/dev/null 2>&1 || { echo "error: 'flock' is required (util-linux)" >&2; exit 2; }

LOCK=${HERDR_HEAVY_LOCK:-/tmp/herdr-heavy.lock}
NICE=${HERDR_HEAVY_NICE:-10}
case $NICE in '' | *[!0-9]*) echo "error: HERDR_HEAVY_NICE must be a whole number: $NICE" >&2; exit 2 ;; esac

exec 9>>"$LOCK"
if ! flock -n 9; then
  holder=$(cat "$LOCK.holder" 2>/dev/null || true)
  echo "heavy: waiting for the machine-wide lock${holder:+ (held by: $holder)}…" >&2
  flock 9
fi
printf '%s · pid %s · %s · %s\n' "$(date -u +%FT%TZ)" "$$" "$PWD" "$*" >"$LOCK.holder"
# The lock stays held while the command runs: fd 9 is inherited, so a command that forks keeps it until it exits.
status=0
nice -n "$NICE" "$@" || status=$?
: >"$LOCK.holder"
exit "$status"
