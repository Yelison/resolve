# Working on several tasks in parallel with Herdr

[Herdr](https://herdr.dev) is a terminal workspace manager that recognises coding agents running in its panes. This
document describes how Resolve uses it to run **one coordinator session and up to a few implementation agents at the
same time**, each agent in its own Git worktree, on its own branch, with its own ports and database. It also records
what happens when the client disconnects, the server stops or the machine reboots.

Nothing here is required to build or run Resolve: it only matters when more than one checkout is active on the same
machine.

## Topology

| Role | Git | Herdr |
| --- | --- | --- |
| Coordinator | The main checkout (`main`); it reviews, integrates and never implements tasks itself | The session you start Claude Code from |
| Task A, B, … | A linked worktree on its own branch, created from a known commit | One workspace per task whose root pane opens the worktree; Claude Code runs there as a named agent |
| Servers and tests | — | Extra panes in the task workspace, only when needed |

Rules that keep the checkouts independent:

- Every worktree lives **outside** the repository, under `~/resolver-herdr/worktrees/` by default.
- Each task gets a **port slot** (see below), so two tasks can run Vite, Spring Boot, Playwright and PostgreSQL at
  the same time without stepping on each other. Backend tests use Testcontainers, which picks a free port by itself.
- One owner per shared file. `docs/api/openapi.yaml`, `frontend/src/api/schema.ts`, Flyway migrations,
  `frontend/src/app/router.tsx`, `frontend/src/styles/tokens.css`, `frontend/src/components/ui/index.ts`,
  `package.json` / `package-lock.json`, `pom.xml`, `docker-compose.yml` and `.github/workflows/ci.yml` are
  reserved: a task that needs to change one of them says so before doing it, and only one task touches it at a time.
- Nothing is merged locally into `main`. Every branch reaches `main` through a pull request with the four required
  checks green, as for any other change.

## Prerequisites

- Herdr 0.8 or later with the Claude Code integration installed (`herdr integration status` shows `claude: current`).
  The integration lets Herdr classify the agent state and resume Claude Code sessions after a server restart.
- `jq`, `git`, `ss` (iproute2) and Docker for the scripts and the backend tests.
- Run the scripts **from a Herdr pane** (they check `HERDR_ENV=1`), normally the coordinator's.

## Layout on disk

```
~/resolver-herdr/                 # HERDR_TASKS_ROOT; nothing in here is versioned
  worktrees/<task-id>/            # the Git worktree of each task
  tasks/<task-id>/task.json       # branch, base commit, Herdr ids, slot, ports, agent name
  tasks/<task-id>/*.md            # the brief the agent follows and the files it hands back
  logs/<task-id>/                 # command output a task wants to keep
```

The worktree also receives a `.env.herdr` (ignored through `.env.*`) with the task's ports, and a copy of the local,
git-ignored `CLAUDE.md` when the main checkout has one. `scripts/herdr/env.herdr.example` shows the file.

## Port slots

Slot `n` (1–9) uses:

| Variable | Port | Used by |
| --- | --- | --- |
| `DEV_SERVER_PORT` | 5180 + n | `vite` (`frontend/vite.config.ts` reads it; strict port) |
| `PLAYWRIGHT_PORT` | 4180 + n | the preview server Playwright starts (`frontend/playwright.config.ts`) |
| `SERVER_PORT` | 8080 + n | Spring Boot |
| `POSTGRES_PORT` | 5440 + n | the host port of `docker-compose.yml`, project `COMPOSE_PROJECT_NAME=resolve-<task-id>` |
| `KEYCLOAK_PORT` | 8180 + n | the host port of the `keycloak` service of `docker-compose.yml` (loopback only) |

`API_PROXY_TARGET` points the Vite dev proxy at the task's own backend and `DATABASE_URL` at its own database; `RESOLVE_OIDC_ISSUER` and `RESOLVE_PUBLIC_URL` point an `oidc` backend at the task's own Keycloak and send sign-in and sign-out back to the task's Vite. The
main checkout keeps the defaults (5173, 4173, 8080 and the `POSTGRES_PORT` of its compose project).

**Trying the OIDC login in a slot.** The backend's `oidc` profile sends the browser back to `RESOLVE_PUBLIC_URL` after
signing in and signing out. `.env.herdr` already carries `RESOLVE_PUBLIC_URL` and `RESOLVE_OIDC_ISSUER` for the slot, so
loading it is enough (without it the defaults point at the main checkout's Vite and Keycloak). The Keycloak client
accepts the API ports 8080-8089 and Vite's 5173 and 4173 as login redirect targets, and the Vite (5181-5189) and
preview (4181-4189) ports of the slots, with 5173 and 4173, as return URLs after signing out
(`post.logout.redirect.uris`), so no slot needs anything else.

## Machine load limit

`new-task.sh` and `start-agent.sh` (and so `new-review.sh`) refuse to start while the 1-minute load average
(`/proc/loadavg`) is above `HERDR_MAX_LOAD`, by default `1.5 × nproc` (18 on the 12-core development machine), with a
message that says the load and the limit. The machine is shared by three or four agents; a new session or a new
worktree on a saturated one only makes everybody's tests flaky. Wait for the other agents' runs to finish, or pass
`--ignore-load` once you have decided that this one cannot wait. `HERDR_MAX_LOAD` must be a number (it can be
fractional) and applies to the shell that runs the script. `set-effort.sh --restart` checks the load *before* it
exits the agent, so a refusal leaves the agent running (`--ignore-load` forces the restart); `new-review.sh --round`
only checks it when it has to start a reviewer again.

## Create a task

```sh
scripts/herdr/new-task.sh --id t0-1-tickets-follow-ups --branch fix/tickets-follow-ups --base main \
  --effort medium --effort-reason "Prescribed pattern, three bounded changes, tests defined up front"
```

The script refuses to continue if the branch, the path, the task id or the slot already exist, or if a port of the
slot is already listening. Otherwise it runs `herdr worktree create` (which opens the workspace), checks that the
checkout is on the expected branch and commit, writes `.env.herdr` and `tasks/<id>/task.json`, and prints the record.
Add `--install` to run `npm ci` in `frontend/` right away, `--ignore-load` to start despite the load limit, `--slot N` to pick the slot, `--label` for the workspace
name, `--no-claude-md` to skip copying `CLAUDE.md`. The equivalent manual command is:

```sh
herdr worktree create --cwd ~/resolver --branch <branch> --base main --path ~/resolver-herdr/worktrees/<id> --no-focus
```

Its JSON answer carries the ids to use next: `.result.workspace.workspace_id`, `.result.tab.tab_id` and
`.result.root_pane.pane_id`.

## Write the brief

A new Claude Code session knows nothing about this conversation, so the brief must be complete. Keep it in
`tasks/<id>/brief.md` and cover:

1. Identifier and goal.
2. Branch, absolute worktree path and base commit (the agent checks all three before editing).
3. Files it may change; shared files it must not touch without asking; dependencies on other tasks.
4. Contracts that apply (OpenAPI, data model, permissions, error format…).
5. Acceptance criteria and the exact validation commands.
6. Delivery format: the agent copies `scripts/herdr/delivery.template.md` to the delivery path (the common footer
   cites it): Resumen; Commits; Pruebas con cifras base y final; Los tests nuevos fallan sin su cambio;
   Autocomprobación; Desviaciones y decisiones; Limitaciones; Esfuerzo usado; `git status --short`; and a last line,
   `ENTREGA <lane>: LISTA` or `BLOQUEO <lane>: <reason>`. Fixed titles and order make deliveries comparable and let
   the coordinator check them mechanically. A base commit that predates the template falls back to those same sections
   in the footer's wording.
7. What it must report instead of working around: a reserved file, a failing test on the base commit, a new
   dependency, a permission prompt it cannot answer, an ambiguity.
8. Repository rules it inherits: Conventional Commits in English with the `Co-Authored-By` trailer, every commit
   builds, no push and no pull request unless the brief says so, nothing disabled to turn CI green.

### Fill the common part with `fill-brief.sh`

Write only the task-specific part of the brief (goal, files, contracts, criteria, effort card) in a staging file, using
these markers wherever the task's own values go, and let the script append the common footer
(`scripts/herdr/brief-footer.md`: commits, machine usage, dangerous commands, self-check, delivery, what to report):

```sh
scripts/herdr/fill-brief.sh t0-1-tickets-follow-ups A ~/resolver-herdr/staging/t0-1.md
```

It reads the task's slot, worktree and base commit from `task.json`, writes `tasks/<id>/brief.md` and fails, without
touching an existing brief, if any `__MARKER__` is left or the result lacks the `Sin push ni PR` rule or
`ENTREGA <lane>: LISTA`. Markers: `__WT__` (worktree), `__BASE__` and `__BASEFULL__` (base commit, 7 and 40
characters), `__SL__` (slot), `__VITE__`, `__PW__`, `__API__`, `__PG__`, `__KC__` (the slot's ports), `__LANE__` and
`__LANE_NAME__`, `__DELIVERY__`. The lane is any short name (`A`, `C`…); it ends up in `ENTREGA <lane>: LISTA`. Text
that merely looks like a marker (`__INIT__`) makes the script stop: reword it. Nothing in the script depends on the
owner's home: it uses `HERDR_TASKS_ROOT` like the others, and does not need to run inside a Herdr pane.

## Start the agent

```sh
scripts/herdr/start-agent.sh --id t0-1-tickets-follow-ups --name t01-tickets --brief ~/resolver-herdr/tasks/t0-1-tickets-follow-ups/brief.md
```

It verifies that the pane still exists, that no agent already runs there and that the name is free, then runs
`herdr agent start <name> --kind claude --pane <pane>`. On a checkout Claude Code has never opened, the first thing
it shows is the **folder-trust dialog**; Herdr reports the agent as `blocked`, the script prints the screen and
stops without sending the brief. Read it, answer it yourself (`herdr agent send-keys <name> enter` accepts the
highlighted option) and then send the prompt by hand (rerunning the script would refuse, because the agent is already
live):

```sh
herdr agent prompt t01-tickets "Read $HOME/resolver-herdr/tasks/t0-1-tickets-follow-ups/brief.md in full and follow it."
```

Pass flags to Claude Code after `--` in `herdr agent start` if you need them. Never pass a permission-bypass flag:
the agent should ask, and the coordinator should answer.

## Reasoning effort per task

The coordinator chooses the reasoning effort of each agent **before** it hands the agent a task, and checks that it
was applied. Maximum effort is not a default.

**What Claude Code offers (2.1.289).** Fable 5.1 and Opus 5.5 accept `low`, `medium`, `high`, `xhigh` and `max`; a
level a model does not support falls back to the closest one below. The level comes from, in this order: the
`CLAUDE_CODE_EFFORT_LEVEL` variable, `--effort` at launch, `/effort` in the session, then `modelSettings` and
`effortLevel` in settings files, where a project's `.claude/settings.local.json` outranks `~/.claude/settings.json`.
Settings files accept `low` to `xhigh` (not `max`) and a `maxEffortLevel` cap.

**Mechanism.** One per task: `.claude/settings.local.json` in the task worktree, with a `modelSettings` entry for
`claude-sonnet-5-5`, `claude-opus-5-5` and `claude-fable-5-1` (so the level holds whichever model the session resolves to) carrying
`effortLevel` and `maxEffortLevel`. `new-task.sh --effort <level> [--max-effort <level>] --effort-reason "…"`
writes it, and `scripts/herdr` adds `/.claude/settings.local.json` to the shared `.git/info/exclude` so no
worktree can commit it. It survives Herdr restarts, which the `--effort` flag does not (the automatic resume runs
`claude --resume` without it), and it lets an agent be adjusted later, which the environment variable does not.
**Model and advisor.** The owner decides which model each kind of agent runs; the coordinator applies that decision
and never changes it on its own. Since 2026-10-05 new implementer agents run Sonnet 5.5 with Opus 5.5 as the advisor
(`new-task.sh --model claude-sonnet-5-5 --advisor claude-opus-5-5`), which writes `model` and `advisorModel` to the
same local settings file. Reviewers: see "Advisor per role" below. Full model IDs are
used instead of aliases so a Claude Code update cannot move them. An advisor must rank at or above the main model:
Sonnet cannot advise Opus. `start-agent.sh` records the model from the session header; the advisor shows in
`/advisor`, which must be closed with `esc` (choosing a row saves it to the owner's settings).

**Never send `/effort <level>` to an agent.** In an interactive session it saves the level as the owner's default
for that model in `~/.claude/settings.json`, which changes every other session, the coordinator's included.
`/effort status` only reads it.

**Verification.** `start-agent.sh` reads the session header (`Opus 5.5 with medium effort`) and records it in
`task.json` under `effort.verified`; `status.sh` shows `level/max` and a ✓ once verified. If the header disagrees,
the file is not being read: do not hand over the task until it does.

**Initial policy.** Judge each task by the complexity of its decisions, the ambiguity of its requirements, the cost
of a mistake, the fragility of the code it touches, its reach across modules and how hard its result is to check;
not by the number of files or the expected duration.

| Level | Typical task |
| --- | --- |
| `low` | Mechanical changes, copy, simple adjustments following a proven pattern |
| `medium` (starting point) | Usual components, forms, simple endpoints, tests with clear requirements |
| `high` | Cross-module changes, contracts, complex queries, migrations, diagnosing failures |
| `xhigh` (the highest a task file can hold) | Especially hard concurrency, isolation, authorisation or architecture problems with real uncertainty |

A sensitive task does not need the top level when a proven pattern, clear requirements and tests make it checkable.
`max` is left out: settings files cannot hold it, and the documentation warns about diminishing returns.

**Task record.** `task.json` keeps `effort.model`, `level`, `max`, `reason`, `risks`, `escalate_when`, `review`,
`verified`, `history` and, at the end, `outcome`; the brief repeats the same card for the agent.

**Raising it during a task.** Agents do not change their own level; when an escalation condition appears they stop
at a safe point and report `ESCALADO <lane>: <reason>`. Before raising it, check whether what is missing is context,
a blocked tool or an incomplete requirement: more effort does not replace that information. Then, with the agent
idle:

```sh
scripts/herdr/set-effort.sh --id <id> --level high --reason "flaky race test without a clear cause" --restart
```

It refuses while the agent is `working` or `blocked`, rewrites the file, appends to `effort.history`, exits the
agent and resumes the same conversation with `claude --continue`, then verifies the header again.

**Independent review.** A review runs in its own Claude Code session in Herdr, never as a subagent of the
coordinator (subagents inherit the coordinator's effort, model and advisor, and Claude Code has no per-call setting
for them). The coordinator creates a review worktree pinned to the delivered commit, with the level the risk
requires, and the review brief from `scripts/herdr/review-brief.template.md`:

```sh
scripts/herdr/new-review.sh --task <id> [--effort high|medium] [--points points.md] [--name rev-<id>] [--lane X]
```

It does what the coordinator used to do by hand: creates `review-<id>` with `new-task.sh --base <HEAD of the task>
--advisor none --effort <level> --install` (branch `review/<id>-<sha7>`), fills `review-brief.template.md`, appends the
points of `--points` under "Extra points from the coordinator", and starts the reviewer with `start-agent.sh`. The
brief gets, from the implementer's `brief.md`: the title (its first `# ` heading), the plan reference (its `- Id:`
line), the lane (the one in `ENTREGA <lane>: LISTA`, unless `--lane`) and the commands (the first code block under
`## Comandos`, with a first line that spells out the review slot's ports and Compose project, because auto mode may
refuse to read `.env.herdr`); without that block it falls back to `git log`/`git diff --stat` and says so. The
reviewed commit is the task's `HEAD`, its base is the task's `base_sha`, and the report goes to
`tasks/review-<id>/review.md`. The review id must be a valid task id, so the task id has at most 33 characters.
The manual equivalent is `new-task.sh --id review-<id> --branch review/<id>-<sha7> --base <sha> --effort high
--advisor none --effort-reason "…"` followed by `start-agent.sh`.

**Next rounds.** The implementer does not touch the reviewed commit while the review runs; fixes go on new commits in
the task worktree. For the next round run `new-review.sh --task <id> --round N [--points …]` (N ≥ 2). It refuses while
the reviewer is `working` or `blocked`, while the review worktree has changes, or if the task did not move. Then it
moves the review worktree to the task's new `HEAD`: `git merge --ff-only` when the old commit is an ancestor, and,
if the history was rewritten (rebase, amend), a new branch `review/<id>-<sha7>` at the new commit (no `reset --hard`;
the old branch stays until you delete it). It writes `tasks/review-<id>/brief-ronda-N.md` (previous and new commit,
a `git range-diff` hint when rewritten, the coordinator's `fixes-<N-1>.md` if it exists, the commands, the extra
points; the report goes to `review-ronda-N.md`) and sends it to the reviewer with `herdr agent prompt` (a reviewer
that already exited is started again with `--continue`). The review's `task.json` keeps `review.{of,sha,base_sha,
round}`. **Reviews with only low findings.** When every finding is low (or there are none), the reviewer also writes
`tasks/review-<id>/fixes-proposal.md` (`fixes-proposal-ronda-N.md` in later rounds) in the format of the coordinator's
`fixes-N.md`: header, the report and verdict line, one numbered decision per finding (`corregir`, `descartar` or
`aplazar`, with the reason) and the closing paragraph about the new commit and the delivery. The coordinator approves
it, annotates it and copies it to `tasks/<id>/fixes-N.md`. With any medium or high finding the decisions stay with the
coordinator. The templates also carry the machine limits (`--maxWorkers=3`, `--workers=3`, no full Playwright run on
the base).

An implementation done at `medium` may need a `high` review when it touches permissions, data or shared
contracts. Acceptance criteria and tests are the same at every level. Retire the review worktree once the verdict is
final.

**Advisor per role.** Implementers: Sonnet 5.5 with Opus 5.5 as advisor (owner's decision, 2026-10-05). Reviewers:
the owner's default model at `high`, without advisor (`--advisor none`, which sets `CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1`
through the `env` key of the worktree's local settings): the review is already the second opinion, and every advisor
call re-reads the whole conversation at the advisor's rate.

**Follow-up.** Each delivery reports the level used, the result, any rework and the reason for any escalation; the
coordinator copies it to `effort.outcome`. Token or cost figures are not recorded: neither Herdr nor Claude Code
reports them per task.

## Follow progress

```sh
scripts/herdr/status.sh                       # tasks, workspaces, agent states, commits and dirty files
herdr agent list                              # every live agent with its pane and state
herdr agent get t01-tickets                   # one agent
herdr agent read t01-tickets --source recent-unwrapped --lines 120
herdr agent wait t01-tickets --timeout 600000 # returns at the next idle, done or blocked
git -C ~/resolver-herdr/worktrees/t0-1-tickets-follow-ups log --oneline main..HEAD
```

States: `working` means busy; `blocked` means it is waiting for an answer; `idle` and `done` mean it is ready for
input, which says nothing about whether the work is correct; `unknown` means Herdr could not classify the screen.
Always read the diff, the tests and the delivery file before accepting a task.

Claude Code draws on the terminal's alternate screen, so a long answer may not be fully readable with
`agent read`. That is why briefs ask the agent to write its report to `tasks/<id>/` and to end with a one-line
status in the chat.

## Handle a blocked agent

1. `herdr agent read <name> --source visible --lines 40` to see the question or permission prompt.
2. Decide. If it asks for a reserved file, a new dependency or a change of scope, answer in the agent's chat with the
   decision (`herdr agent prompt <name> "..."`); if it is a permission prompt, answer the dialog
   (`herdr agent send-keys <name> enter`, `down`, `esc`…) only after reading what it wants to run.
3. Do not enable bypass modes to avoid prompts, and do not accept prompts you have not read.

If `herdr agent prompt` times out or reports `agent_prompt_stalled`, the text may still have been delivered: read
the agent before sending it again, or the task runs twice.

## Stop, detach and resume

- **Detach the client or close the terminal window** (`prefix+q`): the Herdr server keeps every pane, agent, server
  and test running. `herdr` (or `herdr session attach default`) reconnects.
- **Stop the server** (`herdr server stop`): every process in every pane ends, including the agents. The layout
  (workspaces, tabs, panes, working directories) is saved in `~/.config/herdr/session.json`; the next `herdr`
  recreates it with fresh shells in the same directories. Because the Claude integration reports session ids, Herdr
  resumes each Claude Code pane with `claude --resume <id>` (`[session] resume_agents_on_restore`, on by default);
  servers and tests must be started again by hand.
- **Reboot**: same as stopping the server. Worktrees, branches, commits and the files under `~/resolver-herdr/` are
  on disk and survive; only running processes are lost.
- **Pause an agent**: let it reach `idle`, then leave it. To stop a running turn use
  `herdr agent send-keys <name> esc`; to close it, `/exit` in its pane (`herdr agent prompt <name> /exit`).

## Run servers and tests inside a task

Everything below runs in a pane of the task workspace with the task environment loaded. Claude Code's auto mode may
refuse to read `.env.herdr` because it looks like a credentials file (seen during the first validation); the brief
therefore lists the task's ports explicitly, and an agent can pass them inline (`SERVER_PORT=8081 ./mvnw spring-boot:run`)
instead of sourcing the file:

```sh
set -a; . ./.env.herdr; set +a                                   # at the worktree root

docker compose up -d                                             # PostgreSQL on $POSTGRES_PORT, project $COMPOSE_PROJECT_NAME
cd backend && SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run   # http://localhost:$SERVER_PORT/api
cd frontend && npm ci && npm run dev                             # http://localhost:$DEV_SERVER_PORT, /api → $API_PROXY_TARGET
cd frontend && npm test && npm run lint && npm run typecheck && npm run build
cd frontend && npx playwright test                               # preview on $PLAYWRIGHT_PORT, mock API
cd backend && ./mvnw -B verify                                   # Testcontainers picks its own port
```

From the coordinator, open a pane for a server without stealing focus and watch it:

```sh
split=$(herdr pane split --pane <task-root-pane> --direction down --cwd ~/resolver-herdr/worktrees/<id> --no-focus)
pane=$(jq -r '.result.pane.pane_id' <<<"$split")
herdr pane run "$pane" "set -a; . ./.env.herdr; set +a; docker compose up -d && cd backend && SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run"
herdr pane wait-output "$pane" --match "Started ResolveApiApplication" --timeout 180000
herdr pane read "$pane" --source recent-unwrapped --lines 60
```

Build output (`frontend/dist`, `frontend/coverage`, `frontend/test-results`, `backend/target`) stays inside each
worktree; the Docker volume is `<COMPOSE_PROJECT_NAME>_postgres-data`. Keep an eye on memory: two Maven builds, two
browsers and two databases fit on a 16 GB machine, three usually do not.

## Review and integrate

1. Read the delivery file, then the diff: `git -C <worktree> diff main...HEAD` and `git log --oneline main..HEAD`.
2. Check the acceptance criteria yourself: run the commands of the brief in the worktree, not only trust the report.
3. Push the branch and open the pull request from the coordinator with `ship.sh` (below); never merge locally into
   `main`.
4. When two tasks depend on each other, integrate the first one, then rebase the second on `main` inside its own
   worktree before reviewing it. If an integration branch is ever needed, give it its own worktree too.
5. `ship.sh` also updates the coordinator checkout after the merge and retires the task and its review.

### Ship a task with `ship.sh`

```sh
scripts/herdr/ship.sh --task <id> --title "feat(scope): summary" --body ~/resolver-herdr/tasks/<id>/pr-body.md [--no-cleanup]
```

In order, stopping at the first problem and saying what it did and did not do:

1. The task worktree and the main checkout are clean, the main checkout is on `main`, and the branch **contains
   `origin/main`** (after `git fetch origin main`); otherwise it stops before pushing and tells you to rebase.
2. **Push.** A new branch is pushed with `-u`; a branch already on origin at the same commit is left alone; a
   fast-forward is a normal push. If the remote tip diverged because the branch was rebased (the rebase is the
   authorisation: you ran `ship.sh` on a rebased branch), it pushes with
   `--force-with-lease=refs/heads/<branch>:<remote sha>`, so the push fails if the remote moved after it was read. It
   never pushes without a lease, and it stops instead of forcing when the remote tip is a commit this repository has
   never seen (someone else's work), is ahead of the local branch, or shares no history with it.
3. **Pull request.** Opens one against `main` (assigned to `HERDR_PR_ASSIGNEE` when it is set; there is no default
   owner) or reuses the open one for the branch, whose title and description it leaves alone.
4. **Smoke.** Polls `gh pr checks --json` until the check named exactly `Full-stack smoke` passes. If it fails, is
   cancelled or skipped, it prints the checks and stops **without scheduling the merge**; if it never shows up it gives
   up after `HERDR_SHIP_TIMEOUT_SECONDS` (default 1800). `HERDR_POLL_SECONDS` (default 20) sets the interval.
5. `gh pr merge --auto --rebase`, then waits for the merge (it stops if the PR is closed or another check fails), runs
   `git fetch origin main && git merge --ff-only origin/main` in the main checkout and prints `merged <sha>`.
6. Unless `--no-cleanup`: sends `/exit` to the agents of the task and of `review-<id>` and runs
   `remove-task.sh --id <id> --volumes` for each (the review first). It never passes `--force-leftovers`: if
   `remove-task.sh` finds processes or containers it stops there, after the merge, and tells you the command to rerun.
   The branches are kept (a rebase merge leaves `git branch -d` unable to see them as merged).

## Retire a worktree

```sh
scripts/herdr/remove-task.sh --id t0-1-tickets-follow-ups            # keeps the branch
scripts/herdr/remove-task.sh --id t0-1-tickets-follow-ups --delete-branch --volumes
scripts/herdr/remove-task.sh --id t0-1-tickets-follow-ups --force-leftovers   # only after reading what it listed
```

Before anything else the script lists **leftovers**: processes listening on the slot's five ports (PID, command
line and working directory; a listener whose PID `ss` cannot show, such as `docker-proxy`, is listed as such, never
taken for a free port) and containers, in any state, of the task's Compose project. If there are any it stops and
removes nothing, and never kills a process itself: stop them yourself, or rerun with `--force-leftovers` to retire the
task anyway (the processes stay; only the Compose project is stopped, as below). Then it stops the task's Compose
project, runs `herdr worktree remove` (which also closes the workspace) and marks the task as removed. It refuses while the checkout has uncommitted changes or a live agent, warns about
commits that are not pushed, and only deletes the branch when `git branch -d` agrees that it is merged. Logs stay in
`logs/<id>/`.

## Recover after a failure

| Situation | What to do |
| --- | --- |
| The agent exited or crashed | `scripts/herdr/start-agent.sh --id <id> --name <name> --continue` starts it again in the same pane and resumes its last conversation; drop `--continue` for a fresh one. The worktree keeps every file and commit, and the effort file keeps the level. |
| The Herdr server restarted | Workspaces come back from `session.json`; Claude Code panes are resumed automatically. Check with `scripts/herdr/status.sh`; if a pane id changed, update `tasks/<id>/task.json`. |
| The workspace was closed but the worktree exists | `herdr worktree open --cwd ~/resolver --path ~/resolver-herdr/worktrees/<id> --no-focus`, then put the new ids in `task.json`. |
| `task.json` is missing | Recreate it from `git worktree list`, `herdr worktree list` and `.env.herdr`; the scripts only need those fields. |
| A prompt timed out | Read the agent (`herdr agent read`) before deciding whether to resend. |
| Ports are busy | `ss -ltnp` shows the owner; pick another slot rather than killing processes you do not own. `remove-task.sh` lists the same owners for the slot it retires. |

## Where a feature registers itself

Parallel tasks should not edit the same shared files, so each feature declares its own pieces in its own folder:

- **Routes.** `frontend/src/features/<feature>/routes.tsx` exports a `FeatureRoutes` function that returns the section's
  `element` or its `children`. Add one line to the `featureRoutes` registry in `frontend/src/app/router.tsx`, keyed by the
  entry's `to` in `navigation.ts`; a section with no entry shows the pending page. `lazyRoute` arrives as a parameter,
  so the feature never imports from the router at runtime. Route tests for the feature go in
  `features/<feature>/routes.test.tsx`; `router.test.tsx` keeps only the cross-cutting cases.
  A **new navigation section** is the exception: it also adds its entry to `frontend/src/app/navigation.ts` and to the
  `cubre todas las secciones de personal` list in `router.test.tsx`. Building a pending section (today, Configuración)
  only registers it in `featureRoutes` and removes it from `pendingRoutes` in `router.tsx`; the pending-section tests
  pick it up through `hasFeatureRoutes`.
- **Responsive sweep widths.** `frontend/e2e/routes/<feature>.ts` exports the `SweepRoute[]` that `responsive.spec.ts`
  measures (with an optional `ready` to wait for data), and `e2e/routes/index.ts` gathers it. The widths and themes stay in
  the spec.
- **E2E mocks.** `frontend/e2e/mocks/<feature>.ts` exports its demo data and a `<feature>Mock()` factory returning a
  `handle` function; `e2e/fixtures.ts` lists the factory in `mockApi`. Keep state inside the factory, never at module
  level, so tests do not leak into each other.

## Notes and decisions

- The scripts never write permission rules. If you want a task's agent to run Docker Compose without asking, add
  `Bash(docker compose -p resolve-<id> *)` to that worktree's `.claude/settings.local.json` yourself; it only matches
  commands with `-p` right after `compose` (not `docker compose -f x.yml -p …`), and `permissions.allow` lists merge
  with the global ones.
- `CLAUDE.md`, `tools/` and `design/` are git-ignored on purpose; `new-task.sh` copies only `CLAUDE.md`, because the
  design rules in it apply to every task. Nothing else local (secrets, exports, editor settings) is copied.
- `.env.herdr` holds ports only, never secrets. It keeps the `.env.*` name so the existing `.gitignore` rule covers it;
  the price is the auto-mode refusal mentioned above, which is why briefs repeat the ports.
- Claude Code keeps its memory per directory, so an agent in a worktree does not see what was learnt in the main
  checkout: that is one more reason for complete briefs.
- The scripts are plain Bash on purpose. Herdr already provides workspaces, agents, prompts, waits and reads; the
  scripts only add the checks around them (existing branch or path, free slot, dirty checkout, live agent).
