# Independent review · {{TASK_TITLE}} · round {{ROUND}}

The implementer answered the previous round. The rules, the checks and the report format are those of your first brief
(`{{FIRST_BRIEF}}`); read it again if you need them. Do not rely on what you concluded before: verify again.

## What changed

- Task: {{TASK_ID}} ({{PLAN_REF}}). The implementer's brief: `{{IMPL_BRIEF}}`. The delivery, updated by the
  implementer: `{{DELIVERY}}`.
- Reviewed commit now: `{{SHA}}`; in the previous round it was `{{OLD_SHA}}`. {{HISTORY_NOTE}}
- Your worktree `{{WORKTREE}}` is now on the local branch `{{BRANCH}}`, which points exactly at `{{SHA}}`. Check
  `pwd -P`, `git rev-parse HEAD` and `git status --short` first; if they do not match, stop and say so.
- The coordinator's decisions on the previous findings: {{FIXES}}

## What you check

1. **Previous findings:** each one, resolved or not, with evidence (a test, a command or the code), and whether the
   decision in the file above was followed.
2. **Regressions:** in everything the new commits touch, at the tip. Verify this round's fixes and what they can affect; do not redo the whole first review. Check that every commit passes on its own only when the brief says «fusión con rebase».
3. **Tests:** every new or changed test would fail without its change (prove it by reverting the key line locally and
   restoring it).

Commands to run in your worktree:

```sh
{{COMMANDS}}
```

The machine (12 cores) is shared by several projects and their agents; without limits the load reaches 30:

- Run every heavy test through the machine-wide lock, `scripts/herdr/heavy.sh`: any Playwright run (mutations
  included), Vitest in a browser and `./mvnw -B verify`. From `frontend/`, for example:
  `../scripts/herdr/heavy.sh npx playwright test e2e/<feature>.spec.ts --workers=2`.
- Run Vitest with `npm test -- --maxWorkers=2` and Playwright always with `--workers=2`.
- Never run the whole Playwright suite locally: CI runs it on the pull request before the merge. Run the specs the
  change can affect (the feature's, those of the shared components it touches, those it changes) and list them in
  the report.
- If a test times out or fails only under load, rerun it alone before drawing conclusions, and say so in the report.
{{EXTRA_POINTS}}

## Delivery

Write `{{REVIEW_FILE}}` in the same format as the previous report (verdict, acceptance table, findings by severity
with file, line, failing scenario and suggested fix, doubts, commands and results, effort level), covering this round.
**When every finding is low** (or you have none), also write `{{FIXES_PROPOSAL}}` exactly as your first brief
describes (one numbered decision per finding, in Spanish, in the format of the coordinator's `fixes-N.md`).
Do not edit tracked files (restore anything you reverted and leave `git status --short` empty), no commits, no push, no
branch switches, never run `/effort` with a level.

Write `REVISIÓN {{LANE}}: <verdict>` as the **last line of the report file** too (the coordinator's monitor reads it from
there), then end your turn with that same single line and the path of the report. For the effort level, copy
`effort.level` from your task's `task.json`: you cannot see your session header, so do not guess it.
