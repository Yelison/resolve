#!/usr/bin/env bash
# Builds tasks/<id>/brief.md from a brief the coordinator wrote (without the common part) and the shared footer
# (scripts/herdr/brief-footer.md): the footer and the brief get the task's worktree, commits, ports, lane and
# delivery path filled in, and the script fails if any __MARKER__ is left. See docs/development/herdr.md.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
# shellcheck source=common.sh
. "$SCRIPT_DIR/common.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/herdr/fill-brief.sh ID LANE STAGED_BRIEF

  ID             Task created by scripts/herdr/new-task.sh
  LANE           Lane letter or name the delivery ends with (ENTREGA <LANE>: LISTA)
  STAGED_BRIEF   The brief without the common footer, with __MARKER__ placeholders

Markers: __WT__ (worktree), __BASE__ and __BASEFULL__ (base commit, 7 and 40 characters), __SL__ (slot),
__VITE__, __PW__, __API__, __PG__ and __KC__ (the slot's ports), __LANE__ and __LANE_NAME__, __DELIVERY__.
Writes $HERDR_TASKS_ROOT/tasks/ID/brief.md.
USAGE
}

case ${1:-} in -h | --help) usage; exit 0 ;; esac
[ $# -eq 3 ] || { usage >&2; die "expected 3 arguments: ID LANE STAGED_BRIEF"; }
ID=$1 LANE=$2 SRC=$3
need jq
[[ $LANE =~ ^[A-Za-z0-9._-]+$ ]] || die "invalid lane '$LANE'"
[ -f "$SRC" ] || die "staged brief not found: $SRC"
[ -f "$SCRIPT_DIR/brief-footer.md" ] || die "missing $SCRIPT_DIR/brief-footer.md"
load_task "$ID"
OUT="$(task_dir "$ID")/brief.md"
[ "$(cd "$(dirname "$SRC")" && pwd -P)/$(basename "$SRC")" != "$OUT" ] || die "the staged brief must not be $OUT itself"

SLOT=$TASK_SLOT
joined=$(mktemp) filled=$(mktemp)
trap 'rm -f "${joined:?}" "${filled:?}"' EXIT
cat "$SRC" "$SCRIPT_DIR/brief-footer.md" >"$joined"
render_template "$joined" '__' '__' \
  "WT=$TASK_WORKTREE" "BASEFULL=$TASK_BASE_SHA" "BASE=${TASK_BASE_SHA:0:7}" "SL=$SLOT" \
  "VITE=$((5180 + SLOT))" "PW=$((4180 + SLOT))" "API=$((8080 + SLOT))" "PG=$((5440 + SLOT))" "KC=$((8180 + SLOT))" \
  "LANE=$LANE" "LANE_NAME=$LANE" "DELIVERY=$(task_dir "$ID")/delivery.md" >"$filled"
grep -Fq 'Sin push ni PR' "$filled" || die "the filled brief lacks the 'Sin push ni PR' rule"
grep -Fq "ENTREGA $LANE: LISTA" "$filled" || die "the filled brief lacks 'ENTREGA $LANE: LISTA'"
cp "$filled" "$OUT"
log "brief ok: $OUT"
