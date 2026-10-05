#!/usr/bin/env bash
# Shared by the scenario files of scripts/herdr/tests: a disposable environment (a git repository with a local bare
# remote, a HERDR_TASKS_ROOT of its own, and fake herdr/gh/docker/npm first in PATH) and a tiny assertion kit.
# Nothing here touches GitHub, a real Herdr, Docker or ~/resolver-herdr. Do not run it with sudo or as a library
# of anything else.
set -uo pipefail
TESTS_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# HERDR_SCRIPTS_SRC lets a mutation run use a modified copy of scripts/herdr instead of the real one.
SCRIPTS_SRC=${HERDR_SCRIPTS_SRC:-$(cd "$TESTS_DIR/.." && pwd -P)}
PASS=0 FAILED=0

if [ -z "${TEST_TMP:-}" ]; then
  TEST_TMP=$(mktemp -d)
  export TEST_TMP
  trap '[ "${HERDR_TEST_KEEP:-0}" = 1 ] || rm -rf "${TEST_TMP:?}"' EXIT
fi

ok() { printf 'ok   %s\n' "$1"; PASS=$((PASS + 1)); }
bad() { printf 'FAIL %s\n' "$1"; FAILED=$((FAILED + 1)); }
check() { local name=$1; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }
# says NAME TEXT: succeeds when the variable $out contains TEXT.
says() { grep -Fq -- "$2" <<<"$out"; }
finish() { printf 'passed=%s failed=%s\n' "$PASS" "$FAILED"; [ "$FAILED" -eq 0 ]; }

# Ports of a slot that something already listens on belong to other agents on this machine: pick slots that are free.
pick_slot() {
  local s p busy
  for s in 1 2 3 4 5 6 7 8 9; do
    case " $* " in *" $s "*) continue ;; esac
    busy=0
    for p in $((5180 + s)) $((4180 + s)) $((8080 + s)) $((5440 + s)) $((8180 + s)); do
      ss -ltnH | awk -v p="$p" '$4 ~ ("[:.]" p "$") { f = 1 } END { exit !f }' && busy=1
    done
    [ "$busy" = 0 ] && { echo "$s"; return; }
  done
  echo "no free slot" >&2; return 1
}

# mk_env: sets T (the environment), W0 (the main checkout) and the variables the scripts read; scripts/herdr is copied
# in and committed, so the main checkout is clean like the real one.
mk_env() {
  T=$(mktemp -d "$TEST_TMP/env.XXXXXX")
  git init -q --bare -b main "$T/remote.git"
  git init -q -b main "$T/repo"
  (
    cd "$T/repo" || exit 1
    git config user.name Tester; git config user.email tester@example.com
    printf '.env.*\nCLAUDE.md\n' >.gitignore
    mkdir -p frontend scripts; echo '{}' >frontend/package.json; echo 'services: {}' >docker-compose.yml
    cp -r "$SCRIPTS_SRC" scripts/herdr
    rm -rf scripts/herdr/tests
    git add -A; git commit -qm "chore: base"
    git remote add origin "$T/remote.git"; git push -q -u origin main
  ) || return 1
  mkdir -p "$T/root" "$T/state"
  export PATH="$TESTS_DIR/bin:$PATH"
  export HERDR_ENV=1 HERDR_TASKS_ROOT="$T/root" FAKE_STATE="$T/state" FAKE_REMOTE="$T/remote.git"
  export HERDR_HEADER_ATTEMPTS=1 HERDR_MAX_LOAD=1000 HERDR_POLL_SECONDS=0 HERDR_SHIP_TIMEOUT_SECONDS=5
  export HERDR="$T/repo/scripts/herdr"
  unset HERDR_PR_ASSIGNEE FAKE_DOCKER_FAIL
  case $HERDR_TASKS_ROOT in "$TEST_TMP"/*) ;; *) echo "refusing: HERDR_TASKS_ROOT is outside the test directory" >&2; exit 2 ;; esac
  for tool in gh herdr docker npm; do
    [ "$(command -v "$tool")" = "$TESTS_DIR/bin/$tool" ] || { echo "refusing: $tool is not the fake" >&2; exit 2; }
  done
  W0=$T/repo
}

# mk_impl SLOT [commands]: task impl-a with one commit, a brief (filled like the real ones), a delivery and a body file.
mk_impl() {
  local slot=$1 cmds=${2:-'bash -n scripts/herdr/*.sh'}
  W=$T/root/worktrees/impl-a
  "$HERDR/new-task.sh" --id impl-a --branch feat/impl-a --slot "$slot" --effort medium --effort-reason r >/dev/null 2>"$T/err" \
    || { echo "mk_impl: new-task.sh failed: $(cat "$T/err")" >&2; exit 2; }
  printf '# Tarea C · Demo\n\n- Id: `impl-a` · plan §3\n\n## Comandos\n\n```sh\n%s\n```\n' "$cmds" >"$T/staged.md"
  "$HERDR/fill-brief.sh" impl-a C "$T/staged.md" >/dev/null 2>&1 || return 1
  echo delivered >"$T/root/tasks/impl-a/delivery.md"
  git -C "$W" commit -q --allow-empty -m "feat: one"
  echo body >"$T/body.md"
  mkdir -p "$T/state/gh"; rm -f "$T/state/gh/calls.log"
}
