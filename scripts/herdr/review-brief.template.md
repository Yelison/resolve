# Independent review · {{TASK_TITLE}}

You are an independent reviewer for Resolve. **You do not implement or fix anything**: you read, run checks and write
verified findings.

## What you review

- Task: {{TASK_ID}} ({{PLAN_REF}}). The implementer's brief, with goal, allowed and reserved files and acceptance
  criteria: `{{IMPL_BRIEF}}`. Read all of it.
- The implementer's delivery: `{{DELIVERY}}`.
- Reviewed commit: `{{SHA}}` on top of `{{BASE_SHA}}` (range `{{BASE_SHA}}..{{SHA}}`).
- Your worktree: `{{WORKTREE}}` on the local branch `{{BRANCH}}`, which points exactly at `{{SHA}}`. Check
  `pwd -P`, `git rev-parse HEAD` and `git status --short` first; if they do not match, stop and say so.
- The implementer works in another worktree: do not touch it or read uncommitted files there.

## What you check

1. **Requirements:** each acceptance criterion, one by one, with evidence (a test, a command or the code).
2. **Behaviour:** the change does what it claims at the edges, not only on the happy path; look for regressions.
3. **Scope:** only allowed files change; no reserved file, new dependency, disabled or weakened test.
4. **Tests:** new tests would fail without the change (prove it by reverting the key line locally and restoring it)
   and do not restate the implementation.
5. **Commits:** Conventional Commits in English with the `Co-Authored-By` trailer. The task is squash-merged by default, so the tip has to pass everything; only when the brief says «fusión con rebase» does every commit have to pass on its own
   (check out each one in your worktree and return to `{{SHA}}` at the end).
6. **Quality:** readability and the repository's conventions (Spanish UI copy with accents, tokens, accessibility).

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

Write `{{REVIEW_FILE}}` with: the verdict (`APROBADO`, `APROBADO CON CAMBIOS MENORES` or `CAMBIOS NECESARIOS`); a
table of acceptance criteria (criterion, met yes/no, evidence); findings by severity (high, medium, low), each with
file and line, the concrete failing scenario and a suggested fix, verified findings only, doubts in their own
section; the commands you ran and their results; the effort level of your session and whether you missed more.

Rules: do not edit tracked files (restore anything you reverted and leave `git status --short` empty), no commits, no
push, no branch switches, never run `/effort` with a level. If a command needs a busy port or a permission you should
not grant, note it and go on.

**When every finding is low** (or you have none), also write `{{FIXES_PROPOSAL}}`, in the format the coordinator
uses for its own `fixes-N.md`, so that the coordinator only has to approve it or annotate it: one numbered decision per
finding, using the id of your report, with what you propose to do and why in one or two sentences; a decision may be
`corregir`, `descartar` (with the reason) or `aplazar` (with where it is tracked). Write it in Spanish:

```md
# Correcciones tras la revisión · <tarea> · ronda <N>

Revisión: `{{REVIEW_FILE}}`. Veredicto: <veredicto>. Decisión propuesta:

1. **B1 · corregir.** <qué cambia, dónde y con qué prueba>.
2. **B2 · descartar.** <por qué no hace falta>.

Un commit nuevo encima de `{{SHA}}`, trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Añade «Ronda <N>» al final de `delivery.md` y termina con `ENTREGA {{LANE}}: LISTA` o `BLOQUEO {{LANE}}: …`.
```

If any finding is medium or high, do not write it: those decisions are the coordinator's.

Write `REVISIÓN {{LANE}}: <verdict>` as the **last line of the report file** too (the coordinator's monitor reads it from
there), then end your turn with that same single line and the path of the report. For the effort level, copy
`effort.level` from your task's `task.json`: you cannot see your session header, so do not guess it.
