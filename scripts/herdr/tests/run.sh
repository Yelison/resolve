#!/usr/bin/env bash
# Runs every scenario file of scripts/herdr/tests in disposable environments (fake herdr, gh, docker and npm; a local
# bare remote; a HERDR_TASKS_ROOT of its own) and exits non-zero if any check fails. It never talks to GitHub, a real
# Herdr or Docker, and never touches ~/resolver-herdr. Usage: scripts/herdr/tests/run.sh [test-name...]
# HERDR_TEST_KEEP=1 keeps the temporary directory; HERDR_SCRIPTS_SRC=DIR runs the tests against a modified copy of
# scripts/herdr (to prove a test fails without its fix).
set -uo pipefail
DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
for tool in jq git ss python3; do command -v "$tool" >/dev/null 2>&1 || { echo "error: '$tool' is required" >&2; exit 2; }; done
TEST_TMP=$(mktemp -d); export TEST_TMP
trap '[ "${HERDR_TEST_KEEP:-0}" = 1 ] && echo "kept: $TEST_TMP" || rm -rf "${TEST_TMP:?}"' EXIT
names=("$@"); [ ${#names[@]} -gt 0 ] || names=(brief review ship remove load)
failed=0
for n in "${names[@]}"; do
  echo "##### test-$n"
  bash "$DIR/test-$n.sh" || failed=$((failed + 1))
done
[ "$failed" -eq 0 ] && echo "ALL TESTS PASSED" || echo "$failed test file(s) with failures"
[ "$failed" -eq 0 ]
