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
2. **Regressions:** in everything the new commits touch, and that every commit still passes on its own.
3. **Tests:** every new or changed test would fail without its change (prove it by reverting the key line locally and
   restoring it).

Commands to run in your worktree:

```sh
{{COMMANDS}}
```

The machine (12 cores) is shared by three or four agents; without limits the load reaches 30:

- Run Vitest with `npm test -- --maxWorkers=3` and Playwright always with `--workers=3`.
- Do not run the whole Playwright suite on the base commit (`main` is green in CI); run the specs of the feature while
  you iterate and the whole suite once, at the reviewed commit, only if the change reaches shared UI.
- If a test times out or fails only under load, rerun it alone before drawing conclusions, and say so in the report.
{{EXTRA_POINTS}}

## Delivery

Write `{{REVIEW_FILE}}` in the same format as the previous report (verdict, acceptance table, findings by severity
with file, line, failing scenario and suggested fix, doubts, commands and results, effort level), covering this round.
**When every finding is low** (or you have none), also write `{{FIXES_PROPOSAL}}` exactly as your first brief
describes (one numbered decision per finding, in Spanish, in the format of the coordinator's `fixes-N.md`).
Do not edit tracked files (restore anything you reverted and leave `git status --short` empty), no commits, no push, no
branch switches, never run `/effort` with a level.

End your turn with a single line: `REVISIÓN {{LANE}}: <verdict>` and the path of the report.
