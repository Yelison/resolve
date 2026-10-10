#!/usr/bin/env bash
# Runs a heavy test command (Playwright, vitest in a browser, ./mvnw verify) at low priority, so the machine stays
# responsive. Since 2026-10-10 (owner decision) batteries of different agents and projects run at the same time:
# there is no lock by default. The machine-wide lock (one battery at a time) comes back for everybody while the
# switch file exists (`touch ~/.herdr-heavy-serial`; remove it to turn the lock off again), or for one command with
# HERDR_HEAVY_SERIAL=1. HERDR_HEAVY_SERIAL_FILE overrides the switch file's path.
# Usage, from any directory:
#   scripts/herdr/heavy.sh npx playwright test e2e/reports.spec.ts --workers=2
# HERDR_HEAVY_LOCK (default /tmp/herdr-heavy.lock) is the lock file used with HERDR_HEAVY_SERIAL=1.
# HERDR_HEAVY_NICE (default 10) is the nice level. The command's exit status is returned unchanged.
set -euo pipefail

[ $# -gt 0 ] || { echo "usage: $(basename "$0") COMMAND [ARG...]" >&2; exit 2; }
SWITCH=${HERDR_HEAVY_SERIAL_FILE:-$HOME/.herdr-heavy-serial}
SERIAL=${HERDR_HEAVY_SERIAL:-0}
[ -e "$SWITCH" ] && SERIAL=1
[ "$SERIAL" != 1 ] || command -v flock >/dev/null 2>&1 || { echo "error: 'flock' is required (util-linux)" >&2; exit 2; }

LOCK=${HERDR_HEAVY_LOCK:-/tmp/herdr-heavy.lock}
NICE=${HERDR_HEAVY_NICE:-10}
case $NICE in '' | *[!0-9]*) echo "error: HERDR_HEAVY_NICE must be a whole number: $NICE" >&2; exit 2 ;; esac

if [ "$SERIAL" != 1 ]; then
  exec nice -n "$NICE" "$@"
fi

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
