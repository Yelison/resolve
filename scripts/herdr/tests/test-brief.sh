#!/usr/bin/env bash
# fill-brief.sh and the delivery template.
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
mk_env; SA=$(pick_slot) || exit 2
"$HERDR/new-task.sh" --id demo-one --branch feat/demo-one --slot "$SA" --effort medium --effort-reason r >/dev/null 2>&1
printf '# Tarea C · demo & "test" #1/2\nWT=__WT__ BASE=__BASE__ FULL=__BASEFULL__ SL=__SL__ %s\nVITE=__VITE__ PW=__PW__ API=__API__ PG=__PG__ KC=__KC__ __LANE_NAME__ → __DELIVERY__\n' '' >"$T/staged.md"
out=$("$HERDR/fill-brief.sh" demo-one C "$T/staged.md" 2>&1); rc=$?
B=$T/root/tasks/demo-one/brief.md
check "fill-brief: rc 0" test $rc -eq 0
check "fill-brief: slot ports" grep -q "VITE=$((5180 + SA)) PW=$((4180 + SA)) API=$((8080 + SA)) PG=$((5440 + SA)) KC=$((8180 + SA))" "$B"
check "fill-brief: footer present" grep -q 'Sin push ni PR' "$B"
check "fill-brief: delivery path" grep -q "→ $T/root/tasks/demo-one/delivery.md" "$B"
check "fill-brief: footer matches the repo copy" grep -qF 'ENTREGA C: LISTA' "$B"
printf '# x\n__NOPE__ and __LANE_NAME__\n' >"$T/bad.md"; cp "$B" "$T/before.md"
out=$("$HERDR/fill-brief.sh" demo-one C "$T/bad.md" 2>&1); rc=$?
check "fill-brief: unfilled marker fails" test $rc -ne 0
check "fill-brief: names the marker" says x '__NOPE__'
check "fill-brief: the brief is untouched" cmp -s "$B" "$T/before.md"
out=$("$HERDR/fill-brief.sh" demo-one C "$B" 2>&1); check "fill-brief: refuses its own output as source" test $? -ne 0
# render_template keeps & / # and backslashes in values
printf 'a __X__ b __Y__\n' >"$T/t.md"
rendered=$( . "$HERDR/common.sh"; render_template "$T/t.md" __ __ 'X=/a&b#c/&' 'Y=\1 & x' )
check "render_template: & / # and backslash survive" test "$rendered" = 'a /a&b#c/& b \1 & x'
# delivery template: fixed sections, in order, and the closing line
mapfile -t heads < <(grep '^## ' "$HERDR/delivery.template.md")
want=('## Resumen' '## Commits' '## Pruebas con cifras base y final' '## Los tests nuevos fallan sin su cambio' '## Autocomprobación' '## Desviaciones y decisiones' '## Limitaciones' '## Esfuerzo usado' '## `git status --short`')
check "delivery template: sections and order" test "${heads[*]}" = "${want[*]}"
check "delivery template: closing line" grep -qx 'ENTREGA {carril}: LISTA' "$HERDR/delivery.template.md"
finish
