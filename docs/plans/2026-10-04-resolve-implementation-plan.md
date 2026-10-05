# Resolve · Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** take Resolve from "Tickets works end to end" to a complete support platform (Overview, Tickets, Customers, Team, Reports, Knowledge base, Settings) with a real backend, organization isolation, server-side permissions, real authentication and an operable deployment, while keeping portfolio-grade quality.

**Architecture:** contract first (`docs/api/openapi.yaml`), validated by the backend tests and the source of the frontend types. Spring Boot backend organized by feature (`tickets`, `customers`, `memberships`, `organizations`, `knowledge`, `reports`; `common` only for infrastructure). React frontend with one `feature` per area, TanStack Query with one key factory per feature, and the shared Forma UI components in `src/components/ui`. Every phase ends with a runnable application and a verifiable result.

**Tech stack (installed versions, verified on 2026-10-04):** React 19.3 · TypeScript 6.0.3 · Vite 8.3.2 · React Router 7.18.4 · TanStack Query 5.104.1 · openapi-typescript 7.13 + openapi-fetch 0.17 · Vitest 5.0.3 + Testing Library 16 + jsdom 29.1 · Playwright 1.63 · oxlint 1.86 · Prettier 3.9 · Node 22.13 (CI: `.nvmrc` = 22) · Java 25 (Temurin 25.0.3) · Spring Boot 4.1.1 (Spring Security 7.1, Hibernate 7, Jackson 3 `tools.jackson`) · Flyway (starter) · Bean Validation · Testcontainers (PostgreSQL 17) · json-schema-validator 3.0.8 · Maven 3.10 (wrapper).

**Spec:** the brief "Resolve: plan de implementación completo" (2026-10-04), summarized in [Appendix A](#appendix-a--the-brief-summarized); the design rules in `CLAUDE.md` (local) and in the Figma frame "01 · Responsive y guía para Claude"; the API decisions in [`docs/api/README.md`](../api/README.md).

**Design source:** the Figma MCP is rate-limited, so the plan uses the complete local export produced by the in-house plugin (`design/figma/`, gitignored): the 55 frames of the page "Resolve · Producto completo" as JSON and PNG, plus variables and components. Every text, column and card quoted here comes from that export; no design detail is invented. Only Tickets and the menu have mobile frames; the other mobile and tablet views follow the rules in `CLAUDE.md` and are recorded under "Design decisions" in the README.

**Reading convention:** behaviour that exists on `main` today is marked **[existing]**; everything else is a **[proposed]** change. Where a table mixes both, a "Where" or "Status" column says which.

---

## Global constraints

Every task inherits these without repeating them.

- **Fixed stack.** No UI framework and no package called `forma-ui`; Forma UI lives in `frontend/src/components/ui`. New dependencies only with a written justification in the task.
- **Versions.** Major upgrades (react-router 8 #6, TypeScript 7 #5, jsdom 30 #4) are reviewed in their own PRs, never mixed with product work. `@types/node` follows Node 22. Official npm registry (`frontend/.npmrc`); the lockfile keeps its registry, integrities and line endings.
- **Contract.** `docs/api/openapi.yaml` changes **before** the code. Every object has `additionalProperties: false`. `camelCase` fields, ISO 8601 timestamps in UTC, lowercase `snake_case` enumerations. Errors are Problem Details (`application/problem+json`) with `errors: [{ field, message }]` for validation. Status codes: 400, 401, 403, 404, 409 (new in this plan), 412, 428.
- **Pagination.** `page` starts at 0 in the API (the UI shows 1-based pages and converts in `toApiPage`), `size` defaults to 20 and is capped at 100, `sort` is `field,direction` from a whitelist with a stable tie-breaker on `id`/`number`.
- **Isolation.** The organization always comes from `CurrentMember`; no endpoint accepts an `organizationId`. Foreign and missing ids answer the same way (404 on routes, a 400 field error on references). Composite foreign keys `(organization_id, id)` on every new child table.
- **Permissions.** URL-level authorization in `SecurityConfiguration` (before anything is read) and, when it depends on data, in the service. Roles `admin`, `agent`, `customer`. Customers stay read-only across the whole API until decided otherwise (D-12).
- **Concurrency.** Every `PATCH` of a shared resource (ticket, customer, article, organization) requires a strong `If-Match` and returns an `ETag`. State transitions are `POST /resource/{id}/action`. Error order: 401, 403, 404, 428, 400, 412.
- **Database.** Flyway (`db/migration`, versions `V3`, `V4`…), `ddl-auto=validate`, demo data only in `db/demo` (`V1003+`, `dev` profile). No `max(number) + 1`. `timestamptz` everywhere; "today" is computed in the organization's time zone.
- **UI.** Spanish copy with full orthography; breakpoints `min-width: 768px` and `min-width: 1200px` (and `max-width: 767.98px`); semantic tokens from `tokens.css` (no loose colors); touch targets ≥ 44 px below 768 px; `prefers-reduced-motion`; loading, empty, no-results, error-with-retry and no-permission states in every view; no demo actions presented as finished.
- **Quality.** Coverage thresholds 80/75/75/80 (statements/branches/functions/lines) are already configured; rules and tests are never disabled to turn CI green.
- **Git.** Branch `feat/<area>-<topic>` → PR to `main` with `gh pr create --assignee Yelison` → the 4 required checks green → rebase merge. Conventional Commits in English with the `Co-Authored-By` trailer; every commit builds on its own. Before each PR: lint, format, typecheck, tests, build, `api:types` without diff, a diff review and the affected documentation.
- **Secrets and data.** Nothing real in code, fixtures or docs: `*.example` emails, fictional names, credentials only through environment variables.

## Review focus

Behaviours the brief implies, that no current test covers, and that are most likely to fail under real use. Each one has its test pinned to the task shown.

1. **Two simultaneous creations in the same organization** must get distinct, consecutive numbers, never a `23505` or a gap (`UPDATE … RETURNING` locks the row, but there is no multi-threaded test). → T1.2.
2. **Removing or demoting the last administrator** must be rejected with 409 and leave the membership untouched; otherwise the organization has nobody left who can administer it. → T3.2.
3. **Hostile Markdown in articles** (`<script>`, `javascript:` links, `<img onerror>`) must render as text or be dropped: no raw HTML ever reaches the DOM. → T5.3.
4. **Day boundaries in the organization's time zone** (a ticket created at 23:30 in `America/Mexico_City` counts on that day, also on daylight-saving transitions). → T4.1.
5. **A session that expires in the middle of a mutation** (401 on `PATCH` or `POST`) must keep the draft, warn, and offer to sign in again without losing what was typed. → T8.3.

---

## 1. Diagnosis of the current state

Checked on `main` at `b00e737` (2026-10-04) by running the suites: 180 unit tests (41 files), 73 e2e tests, 58 backend integration tests; the 4 CI checks green on PR #8.

### 1.1 Implemented and verified [existing]

| Area              | What exists                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens and themes | `tokens.css` generated from the Figma variables (light/dark), light/dark/system theme applied by an inline script before first paint, `color-scheme`                                                                                                                                                                                                                                                                                | `src/styles/tokens.css`, `app/theme/*` and its test                                                                                                                                     |
| Forma UI          | 32 components with CSS Modules and tests: Alert, Attachment, Avatar, Badge, Breadcrumb, Button/IconButton, Checkbox, Combobox, Editor (Markdown), EmptyState, Field, FilterChip, Icon (23 icons), Input, Menu, Message, Metric, Modal (`<dialog>`), NavItem, Pagination, Radio, SearchField, Select, Sidebar, Skeleton, Switch, Tabs, Textarea, TicketRow/TicketTable (container queries), Timeline, Toast, Tooltip, Topbar, Upload | `src/components/ui/*`, `/catalogo`                                                                                                                                                      |
| Shell             | Drawer < 768, icon sidebar 768–1199, 240 px collapsible sidebar ≥ 1200 with a persisted preference; topbar; breadcrumbs from `handle.crumb`; focus moves to the content after navigation; `Ctrl/⌘ K`; skip link; navigation by role                                                                                                                                                                                                 | `app/layout/AppShell.tsx`, `e2e/shell.spec.ts`                                                                                                                                          |
| Contract          | OpenAPI 3.1 with 11 operations, strict schemas, `Problem`, `Activity` as a union; generated types checked in CI; every backend response validated in tests                                                                                                                                                                                                                                                                          | `docs/api/openapi.yaml`, `support/OpenApiContract.java`, `frontend` job                                                                                                                 |
| Backend           | Packages `common/{error,persistence,security,web,time}`, `organizations`, `memberships`, `customers`, `tickets`; URL-level security; `DemoPrincipalResolver` only in `dev`/`test`; default profile → 401 (tested); Flyway `V1`, `V2`; demo `V1000–V1002`; Problem Details; `fail-on-unknown-properties`                                                                                                                             | `backend/src/main`, 58 Testcontainers tests                                                                                                                                             |
| Tickets API       | Inbox (views, filters, `q`, `sort`, pagination), organization-wide metrics, creation with a locked per-organization counter, detail with `ETag`, merge-patch with `If-Match` (412/428, no-op keeps the version), public and internal messages, activity in the same transaction                                                                                                                                                     | `tickets/*`, `TicketCreationApiTest`, `TicketUpdateApiTest`, `TicketMessagesApiTest`, `TicketAccessApiTest`, `TicketActivityRollbackTest`, `TicketMetricsApiTest`, `TicketInboxApiTest` |
| Tickets UI        | `/tickets` (state in the URL, debounce, accessible result count), `/tickets/:number` (editable fields, 412 conflict, conversation, notes, history, persisted draft), `/tickets/nuevo` (customer Combobox, validation focusing the first error, server field errors); read-only customer view                                                                                                                                        | `features/tickets/*`, `e2e/tickets.spec.ts`                                                                                                                                             |
| Quality           | CI with 4 jobs; Dependabot (npm grouped minor/patch, Maven, Actions); "Protect main" ruleset; README with design decisions and an honest roadmap; MIT LICENSE                                                                                                                                                                                                                                                                       | `.github/*`, `README.md`                                                                                                                                                                |

### 1.2 Partially implemented

| What                         | Real state                                                                                                                                                                                                                            | Closed in      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Inbox sorting                | The API accepts `sort` (`updatedAt`, `createdAt`, `number`, `priority`, `status`); the UI always sends `updatedAt,desc` (`TicketsPage.tsx:97`) with no control and no URL parameter                                                   | T1.1           |
| Selection and bulk actions   | `TicketTable` supports optional selection; there is no bulk API, so the inbox does not enable it                                                                                                                                      | Deferred (§10) |
| Ticket ↔ message concurrency | Correct by design (§3.5), but there is no real-thread test of two simultaneous `PATCH`es or two simultaneous creations; the `PATCH` writes `updated_at = now` unconditionally, leaving a window where `updated_at` can move backwards | T1.2           |
| TanStack Query keys          | `ticketKeys` is a factory; `['assignees']` and `['customers', q]` are loose; an internal note invalidates the detail, lists and metrics although none of them change                                                                  | T0.2           |
| Dates                        | Metrics use the organization's time zone and `/me` already exposes it (`organization.timeZone`), but the UI ignores it and formats in the browser's zone (`formatDateTime`), so "Hoy" may not match                                   | T1.5           |
| "No permission" state        | The `EmptyState` exists and `/tickets/nuevo` uses it for customers; there is no reusable route guard and `/` does not redirect customers                                                                                              | T0.2           |
| e2e                          | 73 tests against a contract-typed mocked API; none against the real backend                                                                                                                                                           | T1.4           |
| Catalog                      | Lacks `Combobox` and `SearchField`; the states section covers empty/no results/error/no access but not "saving"                                                                                                                       | T7.1           |
| Authentication               | Demo only (`X-Demo-User`) in `dev`/`test`; the frontend middleware is disabled in production builds (`import.meta.env.DEV`)                                                                                                           | T8.*           |
| Notifications                | The topbar button shows a "not available" toast (honest)                                                                                                                                                                              | Deferred       |
| Tablet range                 | The shell and Tickets are verified at 320–1440; the other views do not exist yet and Figma has no mobile/tablet frames for them                                                                                                       | Each phase     |

### 1.3 Documented but pending

- Sections Overview, Customers, Team, Reports, Knowledge base and Settings: `PendingPage` ("Vista en construcción") today.
- README roadmap: full-stack smoke in CI, authentication provider, remaining views, tags/attachments/SLA.
- `docs/api/README.md`, "Out of scope" table: tags, attachments, SLA, email notifications, deleting and bulk actions, authentication provider.
- Issue #9: late detail refetch, no hint when `/me` fails, `aria-controls` on the closed Combobox.
- Open Dependabot PRs: #4 jsdom 30 (needs Node ≥ 22.22.2), #5 TypeScript 7, #6 react-router 8.
- Deployment: no Dockerfile, no per-environment configuration beyond `DATABASE_*`, no structured logs, no runbooks.

### 1.4 Contradictions and mismatches found

| Between                                                                     | Mismatch                                                                                                                                        | Proposed resolution                                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Figma Overview/Customers/Reports and the data                               | Cards "Satisfacción 96 %", "Cumplimiento SLA", "Plan Pro", "Disponibilidad" have no data and no definition in the model                         | Replace them with defined metrics (§3.6) and record it under "Design decisions" (D-02, **confirmed by the owner**)                  |
| Figma "Datos de ejemplo" (7-day chart)                                      | The design labels it as sample data; the product must show real data                                                                            | Reports-by-day endpoint (T4.1); the label disappears                                                                                |
| Figma Team "Invitar agente" and authentication                              | There is no identity provider and no outgoing email; an email invitation cannot be "sent"                                                       | Invitation = `invited` membership bound to the email, activated on first access (T3.2); email arrives with real authentication (F8) |
| Figma Settings "Notificaciones"                                             | Nothing consumes them                                                                                                                           | Out of v1; the tab is not shown (D-07)                                                                                              |
| Figma "Roles y permisos" with "Guardar permisos"                            | Roles are fixed and the server decides permissions; there is nothing to save                                                                    | Read-only matrix generated from a table shared with the contract (T6.3)                                                             |
| `docs/api/README.md` "Metrics" and the UI                                   | Metrics are computed in the organization's zone; `/me` exposes it in `organization.timeZone`, but `lib/format.ts` formats in the browser's zone | Format in the organization's zone (T1.5)                                                                                            |
| `useAddMessage` and the decision "an internal note changes nothing visible" | The UI invalidates the detail, lists and metrics after an internal note (no visible effect, but inconsistent)                                   | Invalidate only `messages(n)` for `internal` (T0.2)                                                                                 |
| README "About 180 unit… about 70 Playwright"                                | Real: 180 and 73; correct, but it stops being correct with each phase                                                                           | Each phase updates those figures (DoD)                                                                                              |
| `CLAUDE.md` (64 px mobile header in Figma) and the shell (56 px)            | Already recorded as a decision                                                                                                                  | None                                                                                                                                |

### 1.5 Decisions that still need a definition

Summarized in §4.3 with a default per question. None blocks phases 0 and 1.

---

## 2. Scope of the first version per area

"v1" is what phases 0–7 deliver; "Later" is recorded in §10.

| Area               | v1 (with real data)                                                                                                                                                                                                                                                                                                         | Later                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Tickets**        | What exists + inbox sorting, `customerId` filter, dates in the organization's zone, concurrency tests, full-stack smoke in CI, closing issue #9                                                                                                                                                                             | Tags, attachments, SLA, deletion, bulk actions, customers who write                  |
| **Overview**       | Cards: open tickets (+ new today), resolved today (vs. yesterday), first response (median + target), unassigned; chart of tickets created per day (7 days) with an accessible table; recent organization activity; "Need attention" table (open/in progress by priority); "Ver reportes". Customers: redirect to `/tickets` | Satisfaction, SLA, notifications                                                     |
| **Customers**      | Cards: customers, companies, with open tickets, new this month; search, company filter, sort, pagination; create and edit (name, email, company, notes) with `If-Match`; archive/restore (admin); detail with context (totals, open, resolved), notes, the customer's tickets, portal access                                | "Activity" tab, plan, import, duplicate merge                                        |
| **Team**           | Cards: agents, open assigned, unassigned, average load, first response; members table (role, status, load); invite (admin), change role (admin, last-admin guard), remove (admin, unassigns open tickets with activity); grant portal access to a customer (admin)                                                          | Availability (present/away), email invitations, agent profiles                       |
| **Reports**        | Period 7/30/90 days in the organization's zone; cards: tickets created (vs. previous period), resolved, first response, resolution (median hours); created/resolved per day; by channel; per-agent table (resolved, first response, open assigned); CSV export of the table (client side)                                   | SLA, satisfaction, custom periods, server-side export                                |
| **Knowledge base** | Categories; Markdown articles with draft/published and team/customers visibility; search by title, body and category; list with status and date; reading view with outline, reading time and "Crear un ticket"; editor with local draft, save, publish/unpublish, `If-Match`; customers only see published public articles  | Full-text search, "¿Te resultó útil?" ratings (optional T5.7), versions, attachments |
| **Settings**       | Company (admin): name, support email, time zone, first-response target; Profile: name; Appearance: light/dark/system (local preference, stated explicitly); Permissions: read-only matrix. Customers: Profile and Appearance                                                                                                | Notifications, email change, account deletion                                        |
| **UI catalog**     | Parity with the real components (Combobox, SearchField, the shared table parts extracted in F3, BarChart, ProgressBar, "saving" states), JSDoc on props, Forma UI extraction criteria                                                                                                                                       | Separate `forma-ui` package                                                          |

### 2.1 Mandatory states per screen

Every new view implements this matrix and covers it with one unit test per row and, at least, loading + data in e2e.

| State                     | Shared implementation                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                   | `Skeleton` with a descriptive `label`; no layout jumps (minimum heights on cards and tables)                                                                           |
| Empty                     | `EmptyState kind="empty"` with the primary action ("Crear …")                                                                                                          |
| No results                | `EmptyState kind="noResults"` with "Limpiar filtros"                                                                                                                   |
| Error                     | `EmptyState kind="error"` with "Reintentar" (`query.refetch()`); mutation errors go to a `Toast` with tone `error`                                                     |
| No permission             | `RequireRole` (T0.2) → `EmptyState kind="noAccess"`; the menu also hides the section                                                                                   |
| Form                      | `Field` with an associated error (`aria-describedby`, `aria-invalid`), focus on the first error through `flushSync`, server field errors through `ApiError.fieldError` |
| In progress               | `Button loading` + `disabled` while `mutation.isPending`; `aria-busy` on the form; a submit is ignored while one is pending                                            |
| Destructive               | Confirmation `Modal` naming the resource, with a `variant="danger"` action (archive customer, remove member, unpublish article)                                        |
| Mobile / tablet / desktop | Tables as cards < 768, priority columns 768–1199, full table ≥ 1200 (TicketTable pattern); metric cards in 1–2 / 2 / 4 columns; side-by-side panels only ≥ 1200        |

---

## 3. Proposed architecture

### 3.1 Backend

```
com.resolve.api
  common/        error (Problem, exceptions), persistence, security (CurrentMember, resolvers),
                 web (PageQuery, PageResponse, SortSpec, Preconditions ← new: If-Match/ETag), time
  organizations/ Organization, OrganizationSettingsService, OrganizationController (T6)
  memberships/   Membership(+status), MemberService, MembersController, DemoPrincipalResolver,
                 OidcPrincipalResolver (T8, proposal), MeController, AssigneesController
  customers/     Customer(+notes, archived_at, version), CustomerService, CustomersController
  tickets/       (structure unchanged) + ActivityFeed (T4)
  knowledge/     Category, Article, ArticleService, KnowledgeController, Slugs
  reports/       ReportSummaryQuery (native SQL), ReportsController
```

Rules kept **[existing]**: controllers without logic (parse and delegate), `@Transactional` services with the rules, repositories extending `Repository` that only expose organization-scoped methods, `record` DTOs in `*Dtos.java`, entities never serialized. `common` only receives what two or more modules use (for example `Preconditions` for `If-Match`, which today lives in `TicketRequestParser.expectedVersion`).

### 3.2 Frontend

```
src/
  api/        schema.ts (generated), client.ts
  app/        router.tsx, layout/, pages/ (PageHeader, PendingPage, RequireRole ← new), theme/, catalog/
  features/
    session/   queries.ts (useMe, useSessionActions ← T8), SessionGate (T8)
    tickets/   (existing)
    customers/ CustomersPage, CustomerDetailPage, CustomerFormDialog, CustomersTable, queries.ts, listParams.ts
    team/      TeamPage, TeamTable, InviteMemberDialog, queries.ts
    overview/  OverviewPage, queries.ts (reuses tickets and reports)
    reports/   ReportsPage, queries.ts, csv.ts
    knowledge/ KnowledgePage, ArticlePage, ArticleEditorPage, markdown/ (render + tests), queries.ts
    settings/  SettingsPage, OrganizationForm, ProfileForm, AppearanceForm, PermissionsMatrix
  components/ui/ (+ BarChart, ProgressBar, and the table parts extracted in F3 if they prove shared)
  domain/     ticket.ts, customer.ts, member.ts, article.ts (re-export generated types)
  lib/        format.ts (+ time zone), useDebouncedValue, csv helpers
```

Every `feature` has a `queries.ts` with its key factory (`customerKeys`, `memberKeys`, `reportKeys`, `articleKeys`, `organizationKeys`), read hooks with `signal`, and mutation hooks with the invalidation in §3.4.

### 3.3 Contract and generation

1. Change `docs/api/openapi.yaml` (path, schema with `examples` for every new field, response codes, and one request body example per new operation).
2. `cd frontend && npm run api:types` and commit `src/api/schema.ts` (CI fails if it is stale).
3. Backend: implement and add `matchesContract("<operationId>")` to each test of the operation. `OpenApiContract.operationIds()` makes it possible to fail when a contract operation has no test validating it (added in T0.3).
4. Update `docs/api/README.md` (endpoint tables, roles and definitions).

There is no second contract: `domain/*.ts` only re-exports generated types.

### 3.4 Frontend state and cache

| Mutation                                      | Invalidates                                                                                                                            | Writes directly            | Status              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------------------- |
| Create ticket                                 | `ticketKeys.lists()`, `ticketKeys.metrics()`, `customerKeys.lists()` (counts), `reportKeys.all`, `ticketKeys.feed()`                   | `ticketKeys.detail(n)`     | existing + new keys |
| Change status / priority / assignee           | `lists()`, `metrics()`, `activity(n)`, `feed()`, `memberKeys.all` (load), `reportKeys.all`                                             | `detail(n)`                | existing + new keys |
| Public reply                                  | `detail(n)` (updatedAt, first response), `messages(n)`, `lists()`, `metrics()`, `reportKeys.all`                                       | —                          | existing + new keys |
| Internal note                                 | only `messages(n)`                                                                                                                     | —                          | proposed (T0.2)     |
| Create / edit customer                        | `customerKeys.lists()`, `customerKeys.metrics()`, `customerKeys.companies()`, `ticketKeys.lists()` (name in the inbox)                 | `customerKeys.detail(id)`  | proposed            |
| Archive / restore customer                    | `customerKeys.all`                                                                                                                     | `customerKeys.detail(id)`  | proposed            |
| Invite / role / remove member / portal access | `memberKeys.all` (includes `memberKeys.assignees()`), `ticketKeys.lists()`, `ticketKeys.metrics()`, `customerKeys.detail(id)` (access) | —                          | proposed            |
| Create / edit / publish article               | `articleKeys.lists()`, `articleKeys.categories()`                                                                                      | `articleKeys.detail(slug)` | proposed            |
| Organization                                  | `sessionKeys.me`, `organizationKeys.settings()`                                                                                        | —                          | proposed            |
| Profile                                       | `sessionKeys.me`                                                                                                                       | —                          | proposed            |
| User or organization switch, sign out         | `queryClient.clear()` and reload `/me`                                                                                                 | —                          | proposed            |

Rules: reads pass `signal` **[existing]** (when the key changes, the previous request is cancelled if nobody observes it; a late response never overwrites another key). Optimistic updates only for status changes from the inbox (`useQuickTicketUpdate`, **[existing]**, already recovering from 412); everything else waits for the response. Any change of view, filter, search or sort resets `page` to 1 (rule verified in T1.1). A global `ApiError` 401 (T8.3) shows "Tu sesión caducó" without clearing forms.

### 3.5 Concurrency: how "a message does not change the version" holds

Existing implementation, verified in code **[existing]**:

1. `Ticket` carries `@Version long version` and `@DynamicUpdate`: any change through the entity produces `UPDATE tickets SET <changed columns only>, version = v + 1 WHERE id = ? AND version = v`.
2. `TicketService.update` compares `If-Match` with `ticket.getVersion()` inside the transaction before mutating (412 with a clear message); `flush()` at the end makes the new version visible in the response.
3. If another transaction commits between the check and the `flush`, Hibernate's `WHERE version = v` affects no rows → `ObjectOptimisticLockingFailureException` → `ApiExceptionHandler.handleOptimisticLock` → 412. The real-thread test is missing (T1.2).
4. Messages: `TicketRepository.touchPublicActivity` is a JPQL bulk `UPDATE` (`@Modifying`), which by definition bypasses entity versioning: it neither increments `version` nor adds `WHERE version`. It uses `greatest(updated_at, :at)` so the date never moves backwards and sets `first_response_at` only when it was null. Internal notes do not touch the `tickets` row at all: not `updated_at`, not `version`, not `first_response_at`; a customer cannot infer them from any field.
5. `clearAutomatically = true` detaches the entity after the `UPDATE`; `addMessage` does not reuse it afterwards, so there is no stale read.

Residual gap and its closure **[proposed]**: the `PATCH` writes `updated_at = :now` unconditionally. If a public reply stamped `t2` commits between the `PATCH` reading the ticket (whose clock gave `t1 < t2`) and its write, `updated_at` goes back to `t1`. No change is lost, but the inbox sorts that ticket wrongly. Closure in T1.2, chosen in §4.5-1: the `PATCH` loads the ticket with a row lock (`SELECT … FOR UPDATE`) and the entity mutators assign `updatedAt = max(updatedAt, now)`. With the row locked nothing can change `updated_at` between the read and the write, so the in-memory maximum is exact, the response body and `ETag` are accurate, versioning is untouched and internal notes keep writing nothing to the row.

Tests that must exist when T1.2 ends (existing ones are kept; missing ones are added with these names):

- `aStaleVersionIsRejectedWithoutLosingTheOtherChange` (exists).
- `aMissingIfMatchIsRejectedWith428` and `aWeakOrListIfMatchIsRejectedWith400` (exist in `TicketUpdateApiTest`).
- `aPatchThatChangesNothingKeepsTheVersionAndHistory` (exists).
- `aPublicReplyMovesUpdatedAtWithoutBumpingTheVersion` and `anInternalNoteLeavesTheTicketRowUntouched` (in `TicketMessagesApiTest`; add if missing).
- `twoConcurrentPatchesWithTheSameVersionYieldOne200AndOne412` (new, real threads).
- `aPatchCommittedAfterALaterReplyKeepsTheLaterUpdatedAt` (new, deterministic with `MutableClock`).
- `aReplyThatArrivesWhileAPatchHoldsTheRowWaitsAndKeepsTheLatestUpdatedAt` (new, real threads with a barrier).
- `concurrentCreationsGetDistinctConsecutiveNumbers` (new, real threads).

### 3.6 Metrics and reports: definitions

All are computed on the server, per organization, in the organization's time zone (`organizations.time_zone`), independent of inbox filters. Without data → `0` or `null` as stated, never an invented value. Reopenings count as detailed.

| Metric                                                                                    | Definition                                                                                                                                                                                        | Roles | Where    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| `open`, `openedToday`                                                                     | Tickets with `status = open`; of those, `created_at` on today's date                                                                                                                              | staff | existing |
| `inProgress`, `inProgressAssignedToMe`                                                    | `status = in_progress`; of those, assigned to the caller                                                                                                                                          | staff | existing |
| `resolvedToday`, `resolvedYesterday`                                                      | **Distinct** tickets with a `status_changed → resolved` activity today / yesterday (a ticket reopened and resolved again on the same day counts once)                                             | staff | existing |
| `firstResponseMinutes`                                                                    | Median (rounded) minutes between `created_at` and `first_response_at` over tickets created in the last 168 h that have a response; `null` without data                                            | staff | existing |
| `views`                                                                                   | Counts for `all`, `mine`, `unassigned`, `resolved`                                                                                                                                                | staff | existing |
| **Customers** `total`, `companies`, `withOpenTickets`, `newThisMonth`                     | Non-archived customers; distinct non-null companies (case-insensitive); customers with ≥ 1 unresolved ticket; `created_at` in the current month                                                   | staff | T2.2     |
| **Team** `staff`, `assignedOpen`, `unassignedOpen`, `averageLoad`, `firstResponseMinutes` | `active` members with role admin/agent; unresolved tickets with/without an assignee; `assignedOpen / staff` with one decimal (`0` without staff); same as the tickets metric                      | staff | T3.2     |
| **Report** `created`                                                                      | Tickets with `created_at` in the period (`[start of the day N−1 days ago, now]`), plus the equivalent previous period                                                                             | staff | T4.1     |
| `resolved`                                                                                | Distinct tickets with a `→ resolved` activity in the period                                                                                                                                       | staff | T4.1     |
| `firstResponseMinutes`                                                                    | Median over tickets created in the period that have a response; `null` without data                                                                                                               | staff | T4.1     |
| `resolutionHours`                                                                         | Median (one decimal) hours between `created_at` and the **first** `→ resolved` activity, over tickets created in the period; `null` without data                                                  | staff | T4.1     |
| `byDay[]`                                                                                 | For each day of the period: created and resolved (days without data → 0)                                                                                                                          | staff | T4.1     |
| `byChannel[]`                                                                             | Tickets created in the period per channel and their share (sums to 100 ± rounding; empty without data)                                                                                            | staff | T4.1     |
| `byAgent[]`                                                                               | Per active staff member: distinct tickets they resolved (actor of the activity) in the period, median first response of the tickets whose first public message is theirs, currently open assigned | staff | T4.1     |
| Recent activity                                                                           | Last N ticket activities of the organization with number and subject                                                                                                                              | staff | T4.1     |

Out until a definition and data exist: satisfaction, SLA (targets per priority, pauses, business hours), agent availability.

### 3.7 Security and permissions per endpoint (end state of v1)

| Endpoint                                                                                           | admin | agent | customer                  | Status   |
| -------------------------------------------------------------------------------------------------- | ----- | ----- | ------------------------- | -------- |
| `GET /me`                                                                                          | ✓     | ✓     | ✓                         | existing |
| `PATCH /me`                                                                                        | ✓     | ✓     | ✓                         | T6       |
| `GET /tickets`, `GET /tickets/{n}`, `GET /tickets/{n}/messages`                                    | ✓     | ✓     | own / public only         | existing |
| `POST /tickets`, `PATCH /tickets/{n}`, `POST …/messages`, `GET …/activity`, `GET /tickets/metrics` | ✓     | ✓     | 403                       | existing |
| `GET /tickets/activity`                                                                            | ✓     | ✓     | 403                       | T4       |
| `GET /customers`, `GET /assignees`                                                                 | ✓     | ✓     | 403                       | existing |
| `GET /customers/*`, `POST /customers`, `PATCH /customers/{id}`                                     | ✓     | ✓     | 403                       | T2       |
| `POST /customers/{id}/archive`, `/restore`, `/invite`                                              | ✓     | 403   | 403                       | T2, T3   |
| `GET /members`, `GET /members/metrics`                                                             | ✓     | ✓     | 403                       | T3       |
| `POST /members`, `POST /members/{id}/role`, `POST /members/{id}/remove`                            | ✓     | 403   | 403                       | T3       |
| `GET /reports/summary`                                                                             | ✓     | ✓     | 403                       | T4       |
| `GET /knowledge/categories`, `GET /knowledge/articles`, `GET /knowledge/articles/{slug}`           | ✓     | ✓     | published and public only | T5       |
| `POST /knowledge/categories`                                                                       | ✓     | 403   | 403                       | T5       |
| `POST /knowledge/articles`, `PATCH …/{slug}`, `POST …/publish`, `/unpublish`                       | ✓     | ✓     | 403                       | T5       |
| `POST /knowledge/articles/{slug}/feedback` (optional)                                              | ✓     | ✓     | ✓                         | T5.7     |
| `GET /organization`                                                                                | ✓     | ✓     | 403                       | T6       |
| `PATCH /organization`                                                                              | ✓     | 403   | 403                       | T6       |

`removed` memberships and memberships of archived customers do not resolve a principal → 401. The "Roles y permisos" matrix in the UI is generated from `frontend/src/features/settings/permissions.ts`, which a test checks against this table (T6.3).

### 3.8 Authentication proposal (status: proposal, to be reviewed before F8)

**Recommendation: a BFF pattern with OpenID Connect in the backend** (`spring-boot-starter-oauth2-client`, `oauth2Login`), an HTTP session with an `HttpOnly; Secure; SameSite=Lax` cookie and CSRF protection by cookie/header. The frontend manages no tokens and needs no library: to sign in it redirects to `/api/oauth2/authorization/resolve`, to sign out it posts `POST /api/logout`, and a 401 means "sign in again". The verified identity (the IdP's email) is matched against `memberships`; a user with several organizations picks one with `POST /api/session/organization`, validated against their memberships and stored in the server session. The organization never arrives from the client as free text.

Provider: **Keycloak** in `docker-compose` with a realm exported to the repository (reproducible for anyone who clones), and the same Keycloak as a container in the demo deployment. Alternative without operating anything: Auth0/Entra ID free tiers with the same OIDC configuration (only `issuer-uri`, `client-id` and `client-secret` change).

Why not the others: an in-house password system is excluded by the brief; JWT in the browser (PKCE) forces storing tokens in JS and one more library; the server session already exists in Spring and allows revocation and expiry without touching the frontend.

Impact: `SecurityConfiguration` moves from `STATELESS` to `IF_REQUIRED`; CSRF enabled for cookies (tests use `.with(csrf())`); `PrincipalResolver` gains `OidcPrincipalResolver`; `DemoPrincipalResolver` stays in `dev`/`test` and a test boots the `prod` profile to prove `X-Demo-User` does nothing. The application remains "not production-ready" until phase 8; the README says so. See §4.5-4 for what each piece contributes and costs.

### 3.9 Data: deletion, deactivation and renames [proposed]

| Entity       | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | History                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Customers    | Never deleted. `archived_at` hides them from lists, search, metrics and the new-ticket Combobox (an `archived=true` filter lists them). Their tickets stay visible and editable; the ticket detail and inbox show the customer with an "Archivado" badge. Editing an archived customer is a 409 (restore first). Their `customer` membership stops resolving a principal (401 "Tu acceso fue desactivado"). Archiving and restoring are admin-only (**confirmed, Q-02**); restoring brings them back to every list and resumes portal access | Tickets reference the customer by FK and always show the current name; `activities.actor_name` already stores the name at the time |
| Members      | Never deleted. `status = removed` + `removed_at`; their unresolved tickets are unassigned with an `assignee_changed` activity (actor: the admin); resolved tickets keep the assignee; they disappear from `/assignees` and from metrics; they can be invited again (same row)                                                                                                                                                                                                                                                                | `activities.from/to_assignee_name` stores the name at the time                                                                     |
| Users        | A name change (profile or IdP) is reflected live in `MemberRef` and message authors; history keeps the old name                                                                                                                                                                                                                                                                                                                                                                                                                              | By design                                                                                                                          |
| Organization | Not deletable in v1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                                                  |
| Articles     | Not deletable in v1; `unpublish` hides them from customers; physical deletion is deferred until a trash policy is decided                                                                                                                                                                                                                                                                                                                                                                                                                    | `created_by`/`updated_by` by FK                                                                                                    |
| Tickets      | Not deletable (out of scope)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                                                  |

### 3.10 Responsive and accessibility per screen [proposed]

| Screen                              | < 768                                                                                                                          | 768–1199                                                                | ≥ 1200                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Overview                            | Metrics in 2 columns when they fit (`auto-fit, minmax(150px, 1fr)`), chart at 100 % with thin bars, activity and table stacked | Metrics 2 col., chart and activity stacked, table with priority columns | Metrics 4 col., chart 2/3 + activity 1/3, full table |
| Customers / Team / Knowledge (list) | Metrics 2 col., wrapped filters, table as cards                                                                                | Metrics 2 col., priority columns                                        | Metrics 4 col., full table                           |
| Customer (detail)                   | Profile and context stacked, table as cards                                                                                    | Stacked                                                                 | Profile 1/3 + context 2/3, table below               |
| Reports                             | Metrics 2 col., chart with a collapsible alternative table, channel stacked, table as cards                                    | 2 col.; chart and channel stacked                                       | 4 col.; chart 2/3 + channel 1/3; full table          |
| Article                             | Reading at 100 % (max 720 px), collapsible outline on top (`<details>`)                                                        | Same                                                                    | Reading at 720 px + `position: sticky` side outline  |
| Article editor                      | Toolbar wraps; publication panel below                                                                                         | Same                                                                    | Editor 2/3 + panel 1/3                               |
| Settings                            | Tabs with horizontal scroll (`overflow-x: auto`, no clipping), fields at 100 %                                                 | Form in 1 col.                                                          | Form 2/3 + appearance 1/3                            |

Common checks per phase (`e2e/responsive.spec.ts` extends its route list): no horizontal scroll at 320, 390, 767, 768, 1024, 1199, 1200 and 1440 in both themes; keyboard in tables (focusable row with the primary link), menus and dialogs; accessible names on icon-only controls; contrast of new badges with the existing tokens; `prefers-reduced-motion` in the chart (no bar animation).

---

## 4. Decisions

### 4.1 Already taken (not reopened)

Those in `docs/api/README.md` (organization from the context, roles, UUID + per-organization number, merge-patch with `If-Match`, transactional activity, organization-wide metrics, `page` from 0 and `size` ≤ 100, demo only in dev/test) and the "Design decisions" in the README. Also, from this session: PR per branch with checks, English commits, major dependencies in separate PRs, Forma UI kept internal.

**Confirmed by the owner on 2026-10-04:** Q-01 (replace cards without data by verifiable metrics, documenting the differences from Figma while keeping visual consistency) and Q-02 (archiving customers is admin-only; the behaviour for their tickets, searches, forms and restoration is defined in §3.9 and T2.2).

### 4.2 New recommendations (applied unless objected)

| Id   | Decision                                                                                                                                                                                                                                                                                                                                                                                              | Short rationale                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D-01 | `POST /resource/{id}/action` for transitions (archive, restore, remove, change role, publish, unpublish, invite); `PATCH` + `If-Match` only for editing content                                                                                                                                                                                                                                       | Keeps "every PATCH requires If-Match" without forcing versions on idempotent actions |
| D-02 | Replace cards without data: Overview "Satisfacción" → "Sin responsable"; Customers "Satisfacción" → "Nuevos este mes"; Team "Disponibilidad" → omitted and "Respuesta media" → first response; Reports "Cumplimiento SLA" → "Resolución (mediana)"; Overview table "Objetivo SLA" → "Actualizado" (**confirmed**)                                                                                     | No invented value on connected screens                                               |
| D-03 | Dates and "Hoy/Ayer" in the organization's time zone (`Intl.DateTimeFormat` with `timeZone` from `/me`)                                                                                                                                                                                                                                                                                               | Consistency with the server metrics                                                  |
| D-04 | Status 409 (`Problem`) for state conflicts: last admin, removing oneself, archiving twice, publishing twice, editing an archived customer                                                                                                                                                                                                                                                             | 400 is input validation; 412 is versioning; a code was missing for business rules    |
| D-05 | Feature-local tables first (`CustomersTable` in F2, `TeamTable` in F3), built on the `TicketTable` container-query pattern; the shared parts are extracted into `components/ui` only at the end of F3, once two consumers show real duplication, and only the parts that are duplicated (layout switch, card header, priority columns). No sorting, selection or virtualization framework. See §4.5-2 | Avoids a table framework before it is needed                                         |
| D-06 | Article Markdown rendered with `react-markdown` (10.1.0) to React elements, raw HTML skipped, element whitelist, default URL sanitizer; no `dangerouslySetInnerHTML`, no in-house parser. See §4.5-3                                                                                                                                                                                                  | Library-grade CommonMark with a safe-by-default renderer                             |
| D-07 | Settings without a "Notificaciones" tab until a channel consumes them                                                                                                                                                                                                                                                                                                                                 | No settings without effect                                                           |
| D-08 | Invitations = `invited` membership by email, activated on first access; no outgoing email until F8                                                                                                                                                                                                                                                                                                    | Compatible with OIDC (the IdP verifies the email) and honest today                   |
| D-09 | Charts as in-house SVG (`BarChart`, `ProgressBar`) with an accessible alternative table; no chart library                                                                                                                                                                                                                                                                                             | Two simple charts do not justify 100 kB                                              |
| D-10 | `GET /reports/summary?period=7d\|30d\|90d` returns every report section in one response                                                                                                                                                                                                                                                                                                               | One coherent period, one query per section, no N requests                            |
| D-11 | Serve the frontend from Spring Boot in deployment (same origin, no CORS): the `/api` prefix moves from `context-path` to `addPathPrefix` and an SPA fallback is added                                                                                                                                                                                                                                 | One image, one URL, session cookies without `SameSite=None`                          |
| D-12 | Customers still do not write in v1 (no ticket creation, no replies)                                                                                                                                                                                                                                                                                                                                   | It is the contract's decision; opening it requires new limits and validations (§10)  |
| D-13 | BFF + OIDC authentication with Keycloak (§3.8) — **status: proposal, reviewed before F8** (§4.5-4)                                                                                                                                                                                                                                                                                                    | No tokens in the browser; reproducible locally                                       |
| D-14 | First publication: **public demo** with demo data reset nightly and demo accounts in the IdP; no real users — **isolation, limits and the reset procedure in §4.5-5**                                                                                                                                                                                                                                 | Proportionate operational requirements (no support SLA, no personal-data retention)  |

### 4.3 Blocking questions (with a default)

Q-01 and Q-02 are answered (§4.1). The remaining four are shown again before the phase that depends on them starts; if there is no answer, the default applies.

| Id   | Question                                                              | Blocks    | Default                                                                         |
| ---- | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| Q-03 | Can agents see Team and Reports?                                      | F3 and F4 | Yes (read-only); only `admin` modifies                                          |
| Q-04 | Identity provider: self-hosted Keycloak or a managed service?         | F8        | Keycloak                                                                        |
| Q-05 | Deployment platform? (Fly.io / Render / Railway + managed PostgreSQL) | F9        | Fly.io (API + Keycloak) with Neon PostgreSQL; frontend served by the API (D-11) |
| Q-06 | Public demo with resettable data (D-14) or a product with real users? | F8 and F9 | Demo                                                                            |

### 4.4 Optional improvements (only if the phase has slack)

"¿Te resultó útil?" ratings (T5.7), full-text search in articles, `Idempotency-Key` on creations, customer "Activity" tab, custom period selector in reports, server-side CSV export, `X-Request-Id` tracing.

### 4.5 Decisions that required an additional justification

Requested by the owner on 2026-10-04. Each one is settled here before its implementation task.

**1. Monotonic `updated_at` on tickets (T1.2).** Three options were compared for the race described in §3.5:

| Option                                                                          | How                                                                                                                                                                                                            | Monotonic                                                                                                                                                                                            | Versioning                                                                                                                             | Internal notes                                  | Response accuracy                                                                                                | Cost                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| A. `BEFORE UPDATE` trigger keeping `greatest(OLD.updated_at, NEW.updated_at)`   | One migration, no Java                                                                                                                                                                                         | ✓ for every writer                                                                                                                                                                                   | Untouched                                                                                                                              | Untouched                                       | ✗ The entity still holds `t1`, so the `PATCH` body returns an older `updatedAt` than stored until the next `GET` | Logic hidden from JPA; needs a comment in three places                    |
| B. Atomic SQL `SET updated_at = greatest(updated_at, :now)` in the `PATCH` path | A second bulk `UPDATE` after the entity flush (an entity `UPDATE` cannot express `greatest` on its own column; `@ColumnTransformer(write)` would break `INSERT`)                                               | ✓                                                                                                                                                                                                    | Untouched (bulk updates bypass `@Version`)                                                                                             | Untouched                                       | ✗ Same stale entity value; needs a re-read (third statement) to answer correctly                                 | Two or three statements per `PATCH`; every future writer must remember it |
| **C. Row lock + monotonic assignment (chosen)**                                 | `PATCH` loads the ticket with `@Lock(PESSIMISTIC_WRITE)` (`SELECT … FOR UPDATE`, no fetch joins; associations load lazily inside the transaction); the three mutators assign `updatedAt = max(updatedAt, now)` | ✓ Nothing can change the row between the read and the write, so the in-memory maximum equals the stored one; a reply arriving meanwhile waits a few milliseconds and then applies its own `greatest` | Untouched: `@Version` still increments; the explicit `If-Match` check and the `OptimisticLock → 412` mapping stay for every other path | Untouched: notes still write nothing to the row | ✓ Body and `ETag` reflect the stored row                                                                         | ~10 lines of Java, all visible in the service and the entity              |

C is the simplest option that satisfies the three constraints and returns an accurate response, so T1.2 implements it. The deterministic test for the detected race is `aPatchCommittedAfterALaterReplyKeepsTheLaterUpdatedAt` (clock at `t2`, post a reply; clock at `t1 < t2`, `PATCH`; expect `updatedAt == t2`), plus the barrier-based interleaving test `aReplyThatArrivesWhileAPatchHoldsTheRowWaitsAndKeepsTheLatestUpdatedAt`.

**2. Generic `DataTable` (D-05).** The owner asked to extract only what has real reuse. Revised plan: F2 ships `CustomersTable` inside `features/customers`, reusing the `TicketTable` approach (a container query that switches between cards, priority columns and the full table, with the existing tokens and the `Menu` for row actions). F3 ships `TeamTable` the same way. T3.4 then compares both and extracts **only the duplicated parts** into `components/ui/Table` (candidates: the layout hook/CSS that reads the container width, the card header, the "Mostrando N resultados" caption). Reports and Knowledge reuse whatever was extracted, or stay feature-local if nothing was. No sorting, selection, column resizing or virtualization is built.

**3. Markdown without HTML (D-06).** Library: `react-markdown` 10.1.0 (unified/remark/rehype pipeline, React 19 compatible, renders to React elements with no `innerHTML`). Configuration: `skipHtml` so raw HTML nodes are dropped; `allowedElements: ['h2', 'h3', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'a']` with `unwrapDisallowed` so anything else (images, code, tables, headings of other levels) renders as its text; the default `urlTransform` (only `http`, `https`, `mailto`, `irc`, `ircs`, `xmpp` and relative URLs; other schemes such as `javascript:` or `data:` become empty); a custom `a` component that adds `rel="noopener noreferrer"` and `target="_blank"` to absolute URLs; a custom `h2`/`h3` component that assigns slug ids for the outline. Untrusted content: article bodies are written by staff but are still treated as untrusted (shared organization, future customer-visible pages); the renderer never evaluates HTML, scripts or event handlers, and the tests in T5.3 cover `<script>`, `<img onerror>`, `javascript:` and `data:` links. Cost: ~45 kB gzipped added to the knowledge routes only (lazy-loaded); eleven transitive packages, all from the unified ecosystem. Alternatives rejected: `marked` + `DOMPurify` (HTML strings and `dangerouslySetInnerHTML`, two libraries) and an in-house parser (owner's instruction).

**4. BFF + OIDC + Keycloak (D-13, proposal).** What each piece contributes: **OIDC** gives a standard, verified identity (email, name) without storing passwords, and lets any compliant provider replace Keycloak by changing three properties. **BFF** (Spring `oauth2Login` + server session) keeps tokens out of the browser, gives revocation and expiry on the server, and reduces the frontend to two redirects and a 401 handler; its cost is enabling CSRF for cookie-authenticated requests and keeping a session store (in-memory for a single instance; Redis or JDBC sessions if the API ever scales out). **Keycloak** makes the whole thing reproducible with `docker compose up` and a realm export, and keeps the demo accounts under our control; its operational cost is one more container (≈ 512 MB RAM, its own PostgreSQL schema or H2 in dev mode, version upgrades, TLS behind the platform's proxy) and its own backup in production mode. A managed IdP removes that container at the price of an external account and free-tier limits (user caps, branding). This stays a proposal: the choice between Keycloak and a managed IdP (Q-04) is made when F8 starts, with the realm export prepared either way.

**5. Resettable public demo (D-14).** Defined before anything is exposed:

- _Isolation._ A dedicated PostgreSQL database for the demo (never shared with a real deployment), a dedicated Keycloak realm with only the demo users, no outbound email, no real personal data anywhere (the seed uses `*.example` addresses and fictional names), `robots` set to `noindex`, and a persistent "Demostración pública · los datos se reinician cada noche" banner in the shell.
- _Limits._ Request rate limiting at the platform edge (or a servlet filter if the platform has none) of 60 writes per minute per IP; per-organization caps enforced by the service: 500 tickets, 200 customers, 50 members and 100 articles (a 409 Problem "Límite de la demostración" beyond them); bodies capped by the existing validation (`description` and `body` ≤ 20 000 characters); no file uploads.
- _Reset procedure._ A scheduled GitHub Actions workflow (03:00 in the organization's zone) that runs, against the demo database, `flyway clean` followed by `flyway migrate` with both locations (`db/migration`, `db/demo`), using a maintenance toggle: the API returns `503` with a Problem "Reinicio de la demostración en curso" for ~1 minute, and the health probe reports `OUT_OF_SERVICE` so the platform does not route traffic. The same workflow can be triggered manually. Keycloak sessions are not reset (users just sign in again if needed).
- _Verification._ T9.3 adds a smoke run after each reset and a test that the caps return 409.

---

## 5. Phases and dependencies

```
F0 Audit and fixes ──► F1 Tickets closure ──► F2 Customers ──► F3 Team ──► F4 Overview and Reports
                                                                                     │
F5 Knowledge base ◄──────────────────────────────────────────────────────────────────┘
F6 Settings ◄── F5
F7 Catalog and Forma UI criteria ◄── F6 (needs every component)
F8 Real authentication ◄── F3 (membership states); can start in parallel after F3
F9 Deployment and operations ◄── F8
```

Sizes: **small** = one PR of 1–3 commits; **medium** = one PR of 4–8 commits; **large** = two or more PRs. No dates are promised.

| Phase | Verifiable result                                                                                                | Tasks     |
| ----- | ---------------------------------------------------------------------------------------------------------------- | --------- |
| F0    | #9 closed, coherent cache keys, route guard, contract verified operation by operation                            | T0.1–T0.3 |
| F1    | Inbox with sorting, customer filter, dates in the organization's zone, concurrency tests, full-stack smoke in CI | T1.1–T1.5 |
| F2    | `/clientes` and `/clientes/:id` with creation, editing, archiving and the customer's tickets                     | T2.1–T2.5 |
| F3    | `/equipo` with invitation, roles, removal and portal access; shared table parts extracted if duplicated          | T3.1–T3.4 |
| F4    | `/` with real data and `/reportes` with period, accessible charts and CSV                                        | T4.1–T4.5 |
| F5    | `/conocimiento` with categories, articles, reading view and editor                                               | T5.1–T5.7 |
| F6    | `/configuracion` with company, profile, appearance and the permissions matrix                                    | T6.1–T6.4 |
| F7    | Catalog up to date and the Forma UI extraction ADR                                                               | T7.1–T7.2 |
| F8    | Sign-in with the chosen IdP, sign-out, expiry and organization selection                                         | T8.1–T8.4 |
| F9    | Docker image, deployment pipeline, runbooks, public demo                                                         | T9.1–T9.5 |

### 5.1 Parallelization lanes for F0 and F1 (two implementers, Herdr + git worktrees)

Shared resources that force sequencing: `features/tickets/queries.ts` (T0.1, T0.2), `api/client.ts` (T0.2, T1.4), `TicketsPage.tsx` (T1.1, T1.5), the OpenAPI contract and `schema.ts` (T1.3 only in F1), backend `tickets/*` and its tests (T1.2, T1.3). Each wave merges before the next starts; branches rebase on `main` between waves.

| Wave | Lane A (frontend)                     | Lane B (backend / CI)                                                           | Why they are independent                                                                                                          |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1    | T0.1 issue #9                         | T0.3 contract coverage + docs                                                   | Disjoint files; T0.3 is test support and docs                                                                                     |
| 2    | T0.2 key factories + `RequireRole`    | T1.2 concurrency + row lock                                                     | T0.2 is frontend-only after T0.1; T1.2 is backend-only                                                                            |
| 3    | T1.1 inbox sorting                    | T1.3 `customerId` filter (contract + backend + a two-line frontend type change) | T1.1 does not touch the contract; T1.3 touches `schema.ts`, so lane A rebases before using it                                     |
| 4    | T1.5 dates in the organization's zone | T1.4 full-stack smoke job                                                       | T1.4 touches `client.ts` (after T0.2), `vite.config.ts`, `playwright.config.ts`, `ci.yml`; T1.5 touches `lib/format.ts` and pages |

Each task runs in its own worktree and branch (`fix/tickets-follow-ups`, `refactor/query-keys`, `test/contract-coverage`, `feat/inbox-sort`, `test/ticket-concurrency`, `feat/inbox-customer-filter`, `test/fullstack-smoke`, `feat/org-time-zone`), with its own backend port, Vite port and PostgreSQL database per the Herdr configuration (validated before any agent starts). An independent reviewer checks requirements, permissions and behaviour (not only style) before the PR is opened.

---

## 6. Tasks

Task format: objective · dependencies · files · interfaces · decisions · steps · acceptance criteria · tests · commands · size. A task without a dependency line depends on the previous one in its phase; a phase depends on the previous one per §5. When no commands are listed, the common ones for the touched layer run. The common verification commands are:

```sh
# Frontend (from frontend/)
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
npm run api:types && git diff --exit-code src/api/schema.ts
npx playwright test
# Backend (from backend/, needs Docker)
./mvnw -B verify
./mvnw -B -Dtest=TestClassName test
# Full stack, manually
docker compose up -d                       # POSTGRES_PORT=5433 if 5432 is taken
SPRING_PROFILES_ACTIVE=dev DATABASE_URL=jdbc:postgresql://localhost:5433/resolve ./mvnw spring-boot:run
npm run dev                                # proxies /api → :8080
```

### Phase 0 · Audit and fixes

#### T0.1 · Close issue #9 (small)

**Objective:** remove the three known gaps of the Tickets UI without changing visible behaviour. Closing the issue requires the acceptance criteria below to be verified, not just the task being done.
**Dependencies:** none.
**Files:**

- Modify `frontend/src/features/tickets/queries.ts` (`useUpdateTicket`, `useQuickTicketUpdate`)
- Modify `frontend/src/app/layout/AppShell.tsx`; Create `frontend/src/app/pages/SessionErrorPage.tsx`
- Modify `frontend/src/components/ui/Combobox/Combobox.tsx`
- Test `frontend/src/features/tickets/TicketDetailPage.test.tsx`, `frontend/src/app/layout/AppShell.test.tsx`, `frontend/src/components/ui/Combobox/Combobox.test.tsx`

**Interfaces:** produces `SessionErrorPage({ error, onRetry })`; no public hook changes.

**Steps:**

- [ ] 1. Test in `TicketDetailPage.test.tsx`: "a detail refetch that resolves after a PATCH does not replace the newer version". With `mockApi`, `GET /api/tickets/1` takes 200 ms and returns `version: 0`; the `PATCH` answers `version: 1`. After changing the status, `await waitFor(() => expect(screen.getByRole('combobox', { name: 'Estado' })).toHaveValue('in_progress'))` and, 300 ms later, it is still `in_progress`. Run it and watch it fail.
- [ ] 2. In `useUpdateTicket.onMutate` and `useQuickTicketUpdate.mutationFn` call `await queryClient.cancelQueries({ queryKey: ticketKeys.detail(number), exact: true })` before the `PATCH`; in `onSuccess` write with `setQueryData` only if `ticket.version >= (previous?.version ?? -1)`.
- [ ] 3. Test in `AppShell.test.tsx`: "when /me fails a notice with retry is shown instead of the customer view". `mockApi({ 'GET /api/me': { status: 500 } })` → `screen.findByRole('heading', { name: 'No pudimos cargar tu sesión' })` and a "Reintentar" button that requests `/me` again. Fails.
- [ ] 4. Create `SessionErrorPage` (uses `EmptyState kind="error"`) and render it from `AppShell` instead of `<Outlet />` when `me.isError`; pages no longer need to handle that case.
- [ ] 5. Test in `Combobox.test.tsx`: "aria-controls points to the listbox only while open": closed → `expect(input).not.toHaveAttribute('aria-controls')`; open → `toHaveAttribute('aria-controls', listbox.id)`. Fails.
- [ ] 6. Pass `aria-controls={open ? listboxId : undefined}` in `Combobox.tsx`.
- [ ] 7. `npm test`, `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`, `npx playwright test`.
- [ ] 8. Commits: `fix(tickets): ignore detail refetches older than the patched version`, `feat(app): show a retry page when the session cannot load`, `fix(ui): reference the Combobox listbox only while it is open`. PR "fix: close the Tickets UI follow-ups (#9)" with `Closes #9`.

**Acceptance criteria (also the criteria for closing #9):** the three new tests pass; 180 + 3 tests; 73 e2e green; the detail never goes back a version in the 300 ms test; with the backend down, `/tickets` shows the retry page and "Reintentar" recovers once the backend is up; the Combobox passes an axe check closed and open.
**Tests:** the three above. **Commands:** the common frontend ones.

#### T0.2 · Coherent cache keys and a role guard for routes (small)

**Objective:** one key factory per feature, minimal invalidation for internal notes, cache cleanup when the demo user changes, and a reusable guard for restricted sections.
**Dependencies:** T0.1.
**Files:**

- Create `frontend/src/features/customers/queries.ts` (only `customerKeys` and `useCustomerSearch`, moved from tickets), `frontend/src/features/team/queries.ts` (`memberKeys`, `useAssignees`)
- Modify `frontend/src/features/tickets/queries.ts`, `NewTicketPage.tsx`, `TicketDetailPage.tsx`, `TicketsPage.tsx` (imports)
- Create `frontend/src/app/pages/RequireRole.tsx`; Modify `frontend/src/app/router.tsx`, `frontend/src/features/tickets/NewTicketPage.tsx` (uses the guard)
- Modify `frontend/src/api/client.ts` (demo-user change event), `frontend/src/lib/queryClient.ts`
- Tests: `RequireRole.test.tsx`, `queries.test.ts` (invalidation), `AppShell.test.tsx`

**Interfaces:**

```ts
export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (params: CustomerListParams) => [...customerKeys.lists(), params] as const,
  search: (q: string) => [...customerKeys.all, 'search', q] as const,
  detail: (id: string) => [...customerKeys.all, 'detail', id] as const,
  metrics: () => [...customerKeys.all, 'metrics'] as const,
  companies: () => [...customerKeys.all, 'companies'] as const,
}
export const memberKeys = {
  all: ['members'] as const,
  list: () => [...memberKeys.all, 'list'] as const,
  assignees: () => [...memberKeys.all, 'assignees'] as const,
  metrics: () => [...memberKeys.all, 'metrics'] as const,
}
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }): ReactElement
// Shows a Skeleton while /me loads, EmptyState kind="noAccess" when the role is not in `roles`, children otherwise.
```

**Steps:**

- [ ] 1. Test `queries.test.ts`: "an internal note only invalidates the ticket's messages" (spy on `queryClient.invalidateQueries` and check it receives only `ticketKeys.messages(1)`); "a public reply invalidates detail, messages, lists and metrics". Fails.
- [ ] 2. Branch on `variables.visibility` in `useAddMessage.onSuccess(_, variables)`.
- [ ] 3. Move `useCustomerSearch` and `useAssignees` to their features with the new keys; update imports.
- [ ] 4. Test `RequireRole.test.tsx`: customer → "No tienes acceso a esta sección"; agent → children; `/me` pending → skeleton. Fails; implement.
- [ ] 5. In `router.tsx`, wrap `/tickets/nuevo` in `<RequireRole roles={['admin', 'agent']}>` (replacing the manual check in `NewTicketPage`) and add an index route that redirects to `/tickets` when `me.role === 'customer'` (`IndexRedirect`), keeping `PendingPage` for staff until phase 4.
- [ ] 6. In `client.ts`, export `setDemoUser(email | null)` that writes `localStorage` and dispatches `window.dispatchEvent(new Event('resolve:demo-user'))`; in `main.tsx` (only `import.meta.env.DEV`) listen and call `queryClient.clear()`. Document in the README that `setDemoUser` replaces the manual `localStorage.setItem`.
- [ ] 7. Common checks. Commits: `refactor(frontend): give customers and members their own query key factories`, `feat(app): add a role guard for restricted routes`, `fix(tickets): invalidate only the conversation after an internal note`.

**Acceptance criteria:** no key outside a factory (`grep -rn "queryKey: \['" src` returns 0 lines except `session`); a customer entering `/` lands on `/tickets`; changing the demo user leaves the cache empty (test: after the event, `queryClient.getQueryCache().getAll()` is empty).

#### T0.3 · Operation-by-operation contract verification and docs sync (small)

**Objective:** no contract endpoint is left without a test validating its response, and `docs/api/README.md` and the README reflect exactly what exists.
**Dependencies:** none.
**Files:** Create `backend/src/test/java/com/resolve/api/support/ContractCoverageListener.java` and `backend/src/test/resources/META-INF/services/org.junit.platform.launcher.LauncherSessionListener`; Modify `OpenApiContract.java` (registry of verified operations), `docs/api/README.md`, `README.md`.

**Steps:**

- [ ] 1. In `OpenApiContract.assertMatches` record the `operationId` in a static `Set<String> VERIFIED`.
- [ ] 2. `ContractCoverageListener implements LauncherSessionListener`, registered through the service file: in `launcherSessionClosed` compute `OpenApiContract.operationIds()` minus `VERIFIED` and, if anything remains, throw `IllegalStateException` listing it (Surefire marks the build as failed). It only acts when at least one `ApiIntegrationTest` ran, so `-Dtest=SlugsTest` does not fail on coverage.
- [ ] 3. Add to `docs/api/README.md` a section "How the contract is enforced" with the three mechanisms (response validation, operation coverage, generated types in CI).
- [ ] 4. README: test figures per phase (not "about"); in the roadmap add "Customers, team… (plan in `docs/plans/`)".
- [ ] 5. `./mvnw -B verify`. Commit `test(api): fail when a contract operation has no response validation`.

**Acceptance criteria:** removing any `matchesContract` from any test fails the build naming the operation.

### Phase 1 · Tickets closure

#### T1.1 · Inbox sorting and the page-reset rule (small)

**Objective:** the user chooses the order (updated, created, number, priority, status; asc/desc), it lives in the URL, and any change of filter, view, search or sort returns to page 1.
**Dependencies:** T0.2.
**Files:** Modify `inboxParams.ts` (+`sort`), `TicketsPage.tsx` ("Ordenar por" `Select`), `TicketsPage.module.css`; Tests `inboxParams.test.ts`, `TicketsPage.test.tsx`; Modify `e2e/tickets.spec.ts`.

**Interfaces:** `InboxState.sort: TicketSort` with `type TicketSort = \`${'updatedAt'|'createdAt'|'number'|'priority'|'status'},${'asc'|'desc'}\``and`DEFAULT_STATE.sort = 'updatedAt,desc'`; `readInboxState` rejects values outside the list (falls back to the default).

**Steps:**

- [ ] 1. `inboxParams` tests: a valid `sort` is read and written; an invalid one → default and not written; the default never appears in the URL.
- [ ] 2. `TicketsPage` test: "changing the sort requests the list with that sort and returns to page 1" (start at `?page=3`, choose "Número", check the request carries `sort=number,desc&page=0` and the URL `?sort=number,desc`). Test: "changing a filter from page 3 returns to page 1" (exists partially; extend to view, search, assignee).
- [ ] 3. Implement the sort `Select` next to the filters (visible label "Ordenar por"); full width on mobile. Options spell out the direction ("Más recientes", "Más antiguos", "Número ↓", …).
- [ ] 4. e2e: add the sort choice to the filter scenario and check the parameter in the mocked request.
- [ ] 5. Checks; commit `feat(tickets): let the inbox choose its sort order`.

**Acceptance criteria:** `?sort=priority,asc` reloads with priority ascending; the inbox never shows a page > 1 after changing anything other than the page.

#### T1.2 · Concurrency tests and the row lock for `updated_at` (medium)

**Objective:** prove with real threads and controlled clocks that numbering, simultaneous edits and messages behave as the contract says, and close the `updated_at` regression with option C of §4.5-1.
**Dependencies:** none (backend).
**Files:** Modify `tickets/TicketRepository.java` (`@Lock(LockModeType.PESSIMISTIC_WRITE) Optional<Ticket> lockInOrganization(UUID organizationId, long number)` and `lockForCustomer(...)` — no fetch joins), `tickets/TicketService.java` (`update` uses the locking finders; a test-only `ObjectProvider<Runnable>` barrier is invoked after the version check), `tickets/Ticket.java` (`changeStatus`, `changePriority`, `assign` set `this.updatedAt = max(this.updatedAt, now)`); Create `backend/src/test/java/com/resolve/api/tickets/TicketConcurrencyTest.java`, `backend/src/test/java/com/resolve/api/tickets/TicketUpdateBarrier.java` (`@Component @Profile("test")`); Modify `TicketMessagesApiTest.java` (if the two §3.5 tests are missing); Modify `docs/api/README.md` ("Concurrency").

**Steps:**

- [ ] 1. `TicketConcurrencyTest extends TicketsFixture` with an 8-thread `ExecutorService` and a `CountDownLatch`; every thread does `POST /tickets` through `MockMvc` for the same organization. Assert: 8 responses 201, numbers = `{1..8}` with no repeats and no gaps. Name: `concurrentCreationsGetDistinctConsecutiveNumbers`. `@Timeout(30)`.
- [ ] 2. `twoConcurrentPatchesWithTheSameVersionYieldOne200AndOne412`: ticket at version 0; two threads with `If-Match: "0"` and different changes synchronized by the barrier after the version check; exactly one 200 and one 412; the final state matches the 200 and the activity has exactly one new entry. With the row lock the second thread blocks on the `SELECT … FOR UPDATE`, re-reads version 1 and gets the explicit 412 — the test must not depend on which thread wins.
- [ ] 3. `aPatchCommittedAfterALaterReplyKeepsTheLaterUpdatedAt`: with `MutableClock` at `t2 = 12:00` post a public reply; at `t1 = 11:59` `PATCH` the status; `GET` → `updatedAt == t2` and the status changed. Fails before the `max`; implement; passes.
- [ ] 4. `aReplyThatArrivesWhileAPatchHoldsTheRowWaitsAndKeepsTheLatestUpdatedAt`: thread A starts the `PATCH` and parks on the barrier after loading the locked row; thread B posts a public reply with a later clock and must block; release A; expect A's 200, B's 201, and `GET` → `updatedAt` equal to B's stamp and `version == 1`.
- [ ] 5. Check/add in `TicketMessagesApiTest`: `aPublicReplyMovesUpdatedAtWithoutBumpingTheVersion` (after the reply `ETag` is still `"0"` and `updatedAt` = the message stamp; a `PATCH` with `If-Match: "0"` answers 200) and `anInternalNoteLeavesTheTicketRowUntouched` (`updatedAt`, `version` and `firstResponseAt` equal before and after, read with `JdbcTemplate`).
- [ ] 6. `docs/api/README.md`: add to "Concurrency" the row lock on `PATCH`, the monotonic `updated_at` and the list of proven guarantees.
- [ ] 7. `./mvnw -B verify` three times in a row. Commits: `test(tickets): prove numbering and version checks under concurrency`, `fix(tickets): keep updated_at monotonic by locking the row during a patch`.

**Acceptance criteria:** 58 + 6 tests green three consecutive runs (no flakiness); no new migration; the `PATCH` response body `updatedAt` equals the stored value in every test.

#### T1.3 · `customerId` filter in the inbox (small)

**Objective:** list a customer's tickets (for the phase-2 customer detail and links such as "Ver tickets").
**Dependencies:** none.
**Files:** Modify `docs/api/openapi.yaml` (`listTickets`: `customerId` query parameter, uuid), `frontend/src/api/schema.ts` (generated), `TicketFilters.java`, `TicketRequestParser.java`, `TicketSearchImpl.java`; Test `TicketInboxApiTest.java`; Modify `features/tickets/queries.ts` (`TicketListParams.customerId?`).

**Steps:**

- [ ] 1. Contract: `- name: customerId · in: query · schema: {type: string, format: uuid}` described as "Only tickets of this customer. For customer members it combines with their own scope, so another id yields no results."; `npm run api:types`.
- [ ] 2. Test `filtersByCustomerWithinTheOrganization`: two customers with tickets; `?customerId=A` returns only A's; an id from another organization → `totalItems: 0` (not 400, not 404); a non-uuid value → 400. Test `aCustomerMemberCannotWidenTheScopeWithCustomerId`: María with Carlos's `customerId` → 0 results.
- [ ] 3. Implement in `TicketFilters` (`@Nullable UUID customerId`) and in the `TicketSearchImpl` predicate.
- [ ] 4. `./mvnw -B verify`; commit `feat(tickets): filter the inbox by customer`.

**Acceptance criteria:** the tests above; `schema.ts` without diff in CI.

#### T1.4 · Full-stack smoke e2e in CI (medium)

**Objective:** a CI job that starts PostgreSQL, the backend with the `dev` profile (demo data) and the built frontend, and runs a reduced Playwright set against the real API: create a ticket, see it in the inbox, reply, change status, see the history, the customer view.
**Dependencies:** T1.3 (optional).
**Files:** Modify `frontend/vite.config.ts` (`preview.proxy` and `smoke` mode), `frontend/src/api/client.ts` (gate `import.meta.env.MODE !== 'production'`), `frontend/playwright.config.ts` (`smoke` project, `testDir: './e2e-smoke'`), Create `frontend/e2e-smoke/tickets.smoke.ts`, `frontend/e2e-smoke/fixtures.ts` (`loginAs(page, email)` writing `resolve-demo-user`), Modify `.github/workflows/ci.yml` (`smoke` job), `README.md`.

**Decisions:** the smoke build uses `vite build --mode smoke` so the `X-Demo-User` middleware stays active (it is removed in `production`); the backend starts with `java -jar target/*.jar` after `./mvnw -B -DskipTests package` and the job waits for `/api/actuator/health`; the `smoke` project runs neither in the `e2e` job nor locally unless `SMOKE=1`.

**Steps:**

- [ ] 1. `vite.config.ts`: `preview: { proxy: { '/api': 'http://localhost:8080' } }` (same block as `server`).
- [ ] 2. `playwright.config.ts`: `projects: [chromium (testIgnore smoke), { name: 'smoke', testDir: './e2e-smoke', use: {...Desktop Chrome} }]`; `webServer.command` uses `vite build --mode ${process.env.SMOKE ? 'smoke' : 'production'}`.
- [ ] 3. `tickets.smoke.ts` with the objective's steps; assertions against real UI copy; each run creates a unique subject (`#${Date.now()}`) so it does not depend on order.
- [ ] 4. `smoke` job in `ci.yml`: `services: postgres: image: postgres:17-alpine` (env `POSTGRES_DB/USER/PASSWORD: resolve`, `options: --health-cmd pg_isready …`); steps: setup-java 25 + cache, `./mvnw -B -DskipTests package`, start the jar in the background with `SPRING_PROFILES_ACTIVE=dev DATABASE_URL=jdbc:postgresql://localhost:5432/resolve`, `curl --retry 30 --retry-connrefused http://localhost:8080/api/actuator/health`, setup-node, `npm ci`, `npx playwright install --with-deps chromium`, `SMOKE=1 npx playwright test --project=smoke`, upload traces on failure.
- [ ] 5. Add "Full-stack smoke" to the ruleset's required checks (done by the owner on GitHub; say so in the PR).
- [ ] 6. README: tick the roadmap and explain how to run it locally (`SMOKE=1 npx playwright test --project=smoke` with the `dev` backend up).
- [ ] 7. Commits: `build(frontend): keep the demo login in smoke builds`, `test(e2e): add a full-stack smoke suite`, `ci: run the smoke suite against the real API`.

**Acceptance criteria:** the job passes on the PR; it fails when the proxy breaks or when the API answers 401 (checked by temporarily removing the `dev` profile on a throwaway branch).

#### T1.5 · Dates in the organization's time zone (small)

**Objective:** "Hoy", "Ayer" and the times in the UI match the day the server metrics use.
**Dependencies:** none.
**Files:** Modify `frontend/src/lib/format.ts` (`formatDateTime(date, now, timeZone)`, `formatDate`, `formatTime`), `Message.tsx`, `TicketRow.tsx`, `TicketDetailPage.tsx`, `TicketsPage.tsx` (pass `me.data.organization.timeZone`); Create `frontend/src/features/session/useTimeZone.ts`; Tests `format.test.ts` (`America/Mexico_City` and `Asia/Tokyo` cases with the global `TZ=UTC`). No contract or backend change: `Organization.timeZone` is already required in `/me` **[existing]**.

**Steps:**

- [ ] 1. Check in `schema.ts` that `Me['organization']['timeZone']` is `string` (already generated).
- [ ] 2. `format` tests: at `2026-10-04T05:30:00Z` with zone `America/Mexico_City` the result starts with "Ayer" (it is 23:30 on the 3rd there) and with `Asia/Tokyo` with "Hoy, 14:30". Implement with `Intl.DateTimeFormat(…, { timeZone })` comparing days by formatted parts (`year-month-day`), never by `getDate()`.
- [ ] 3. `useTimeZone()` returns `me.data?.organization.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone`.
- [ ] 4. Replace the call sites; `Message` and `TicketRow` take `timeZone?` as a prop (browser zone by default) to stay pure components.
- [ ] 5. Checks; commit `feat(frontend): format dates in the organization time zone`.

**Acceptance criteria:** with the organization in `America/Mexico_City` and the browser in UTC, a ticket created at 23:30 local shows as "Hoy" in the inbox and counts in `openedToday`.

### Phase 2 · Customers

#### T2.1 · Customers contract and migration (small)

**Objective:** fix in the contract and the schema everything the phase needs before writing code. Goes in the same PR as T2.2 (separate commits), because the operation-coverage check of T0.3 fails until the tests exist; the same applies to T3.1+T3.2, T4.1, T5.1+T5.2 and T6.1+T6.2.
**Dependencies:** T1.3.
**Files:** Modify `docs/api/openapi.yaml`, `docs/api/README.md`; Create `backend/src/main/resources/db/migration/V3__customers_profile.sql`, `backend/src/main/resources/db/demo/V1003__demo_customer_notes.sql`; `schema.ts`.

**Contract (fragment):**

```yaml
paths:
  /customers:
    get:   # operationId: listCustomers — adds company, archived, sort (name|createdAt|openTickets)
    post:  # operationId: createCustomer — 201 CustomerDetail + Location + ETag; 400 field errors (duplicate email → field email)
  /customers/metrics:        get: # getCustomerMetrics → CustomerMetrics
  /customers/companies:      get: # listCompanies → array of string (max 200, case-insensitive alphabetical)
  /customers/{id}:
    get:   # getCustomer → CustomerDetail + ETag; 404
    patch: # updateCustomer — merge-patch, If-Match (412/428), CustomerPatch → 200 CustomerDetail + ETag; 409 when archived
  /customers/{id}/archive:   post: # archiveCustomer (admin) → 200 CustomerDetail; 409 if already archived
  /customers/{id}/restore:   post: # restoreCustomer (admin) → 200 CustomerDetail; 409 if not archived
components:
  schemas:
    CustomerSummary:
      type: object
      additionalProperties: false
      required: [id, name, email, company, openTickets, totalTickets, createdAt, archived]
      properties:
        id: { type: string, format: uuid }
        name: { type: string }
        email: { type: string }
        company: { type: [string, 'null'] }
        openTickets: { type: integer, minimum: 0, description: Tickets whose status is not resolved }
        totalTickets: { type: integer, minimum: 0 }
        createdAt: { type: string, format: date-time }
        archived: { type: boolean }
    CustomerDetail:
      allOf:
        - $ref: '#/components/schemas/CustomerSummary'
        - type: object
          additionalProperties: false
          required: [notes, archivedAt, version, portalAccess]
          properties:
            notes: { type: [string, 'null'], maxLength: 2000 }
            archivedAt: { type: [string, 'null'], format: date-time }
            version: { type: integer, minimum: 0 }
            portalAccess: { type: string, enum: [none, invited, active] }
    CustomerCreate:
      type: object
      additionalProperties: false
      required: [name, email]
      properties:
        name: { type: string, minLength: 1, maxLength: 120 }
        email: { type: string, format: email, maxLength: 254 }
        company: { type: [string, 'null'], maxLength: 120 }
        notes: { type: [string, 'null'], maxLength: 2000 }
    CustomerPatch:   # same fields, all optional; name and email do not accept null
    CustomerMetrics:
      type: object
      additionalProperties: false
      required: [total, companies, withOpenTickets, newThisMonth]
      properties: { total: {type: integer}, companies: {type: integer}, withOpenTickets: {type: integer}, newThisMonth: {type: integer} }
  responses:
    Conflict: { description: The action is not allowed in the current state, content: { application/problem+json: { schema: { $ref: '#/components/schemas/Problem' } } } }
```

`CustomerPage.items` becomes `CustomerSummary` (the Combobox keeps working: it uses a subset). `allOf` with `additionalProperties: false` on each part: check that `openapi-typescript` and the validator accept it; if the validator rejects properties from the other `allOf` branch, flatten `CustomerDetail` (no `allOf`) and note it.

**Migration `V3`:**

```sql
ALTER TABLE customers
    ADD COLUMN notes       text,
    ADD COLUMN archived_at timestamptz,
    ADD COLUMN version     bigint NOT NULL DEFAULT 0;
-- Lists and search exclude archived customers: partial index for the common case.
CREATE INDEX customers_active_name_idx ON customers (organization_id, lower(name), id) WHERE archived_at IS NULL;
CREATE INDEX customers_organization_created_idx ON customers (organization_id, created_at DESC);
```

`V1003` adds `notes` to María Pérez ("Prefiere recibir respuestas por correo…") with an `UPDATE`.

**Steps:** contract → `api:types` → API README (endpoint table, roles, "Deletion and archiving") → migration → `./mvnw -B verify` (Hibernate validates the new columns: add the fields to `Customer` in this same task so `validate` passes) → commits `docs(api): define the customers API` + `feat(customers): add notes, archiving and versioning to customers`.

**Acceptance criteria:** `schema.ts` without diff; `V3` applied by Flyway and validated by Hibernate.

#### T2.2 · Customers API (medium)

**Objective:** implement the eight operations with their rules in `customers/`.
**Dependencies:** T2.1.
**Files:** Modify `Customer.java` (`notes`, `archivedAt`, `@Version version`, `@DynamicUpdate`), `CustomerDto.java` → `CustomerDtos.java` (`CustomerSummaryDto`, `CustomerDetailDto`, `CustomerMetricsDto`), `CustomerRepository.java`, `CustomerSearchImpl.java` (counts through `LEFT JOIN LATERAL` or `FILTER` subqueries), `CustomersController.java`; Create `CustomerService.java`, `CustomerRequestParser.java` (merge-patch, same approach as `TicketRequestParser`), `common/web/Preconditions.java` (move `expectedVersion`), `common/error/ConflictException.java` (+ 409 handler in `ApiExceptionHandler`); Modify `SecurityConfiguration.java` (archive/restore → `ADMIN`); Modify `DemoPrincipalResolver` (ignore memberships of archived customers); Tests `CustomersApiTest.java` (extend), Create `CustomerLifecycleApiTest.java`.

**Rules (Q-02 definition):**

- Email unique per organization, case-insensitive (existing index): a duplicate → `ApiValidationException("email", "Ya existe un cliente con este correo.")`, also when the duplicate is archived.
- `archive`: admin; already archived → 409; does not touch tickets; the customer's membership stops resolving (401). `restore`: admin; not archived → 409; portal access resumes.
- Lists and search: `archived=false` by default excludes archived customers; `archived=true` lists only archived ones; `company` compares case-insensitively; `q` as today (name, email, company); `sort` `name,asc` by default, `createdAt`, `openTickets`; tie-breaker `id asc`. The new-ticket Combobox (`GET /customers`) therefore never offers archived customers; creating a ticket with an archived `customerId` → 400 field error (same message as unknown).
- Tickets of archived customers remain listed, readable and editable; `Ticket.customer` is unchanged (the UI reads `archived` from the customer detail when it needs the badge).
- `PATCH` on an archived customer → 409 "Restaura el cliente antes de editarlo."; `If-Match` required; no-op → 200 without a new version.
- `portalAccess`: `none` without a membership; `invited`/`active` from `memberships.status` (column that arrives in T3.1: until then, `active` when a membership exists).

**Steps (TDD per operation, test names):**

- [ ] 1. `listsCustomersWithTicketCountsAndHidesArchivedByDefault`, `filtersByCompanyCaseInsensitively`, `sortsByOpenTicketsWithStableTies`, `aCustomerMemberGets403OnEveryCustomerEndpoint`.
- [ ] 2. `createsACustomerAndReturnsLocationAndEtag`, `rejectsADuplicateEmailWithAFieldError`, `rejectsAnInvalidEmailAndALongName`.
- [ ] 3. `getsACustomerOfTheOrganizationAndHidesForeignOnes` (404 for another organization).
- [ ] 4. `patchesWithIfMatchAndBumpsTheVersion`, `aStalePatchIsRejectedWith412`, `aPatchWithoutIfMatchIsRejectedWith428`, `nullClearsCompanyAndNotes`, `patchingAnArchivedCustomerIsAConflict`.
- [ ] 5. `archivingHidesTheCustomerFromListsAndSearchButKeepsItsTickets`, `archivingTwiceIsAConflict`, `anAgentCannotArchive`, `restoringBringsTheCustomerBack`, `aMemberOfAnArchivedCustomerGets401`, `aTicketCannotBeCreatedForAnArchivedCustomer`.
- [ ] 6. `metricsCountActiveCustomersCompaniesOpenTicketsAndNewThisMonth` (with `MutableClock` on the 1st of the month at 00:30 in the organization's zone to test the boundary).
- [ ] 7. `listsDistinctCompaniesAlphabetically`.
- [ ] 8. Implement after each test; `matchesContract` on all; `./mvnw -B verify`.
- [ ] 9. Commits: `feat(api): add conflict responses and shared If-Match parsing`, `feat(customers): list, create, update and archive customers`, `feat(customers): add customer metrics and companies`.

**Acceptance criteria:** the 8 operations appear in `VERIFIED`; isolation proven with two organizations on every read and write; 64 + ~24 tests.

#### T2.3 · `CustomersTable` and the customers list page (medium)

**Objective:** `/clientes` with cards, search, company filter, sort, pagination and states, with a feature-local responsive table (D-05).
**Dependencies:** T2.2, T0.2.
**Files:** Create `features/customers/{CustomersPage.tsx, CustomersPage.module.css, CustomersPage.test.tsx, CustomersTable.tsx, CustomersTable.module.css, CustomersTable.test.tsx, listParams.ts, listParams.test.ts}`, `domain/customer.ts`; Modify `features/customers/queries.ts` (list, metrics, companies), `app/router.tsx` (`clientes` with `RequireRole`), `e2e/responsive.spec.ts` (route `/clientes`).

**Interfaces:**

```ts
export interface CustomersTableProps {
  customers: CustomerSummary[]
  caption: string
  actions?: (customer: CustomerSummary) => MenuItem[] // MenuItem from components/ui/Menu
}
// Same container-query pattern as TicketTable: < 560 px cards (name as title, company · email as metadata,
// open tickets and the "Archivado" badge as chips); 560–959 name, company, tickets, status; ≥ 960 every column.
// Each row links to /clientes/:id; actions only render when the array is non-empty.
```

**Steps:**

- [ ] 1. `CustomersTable` tests: renders a `<table>` with `aria-label`; in the narrow layout (forced through a `layout` prop in tests, as `TicketTable` does) shows cards titled with the name; each row has a link; `actions` only when provided; the caption shows "Mostrando N resultados".
- [ ] 2. Implement `CustomersTable`, reusing `Badge`, `Menu` and the tokens; no new shared component yet.
- [ ] 3. `listParams.ts` (like `inboxParams`: `q`, `company`, `archived`, `sort`, `page`) with tests.
- [ ] 4. `CustomersPage` tests: loading (skeleton), data (4 `Metric` cards, table with "Cliente, Empresa, Correo, Tickets, Estado"), no results with "Limpiar filtros", error with retry, empty with "Nuevo cliente", changing the company resets the page, `archived=true` shows "Archivados" with a badge, an agent sees "Nuevo cliente" and not "Archivar".
- [ ] 5. Implement the page: `PageHeader` with the Figma subtitle ("El contexto que tu equipo necesita para ayudar mejor.") and the "Nuevo cliente" action (opens `CustomerFormDialog` from T2.4; until then links to `/clientes/nuevo`), `SearchField`, `Select` "Empresa", `FilterChip` "Archivados", `CustomersTable`, `Pagination`.
- [ ] 6. Checks + responsive at 320/768/1200. Commits `feat(customers): add the customers list`, `feat(customers): add a responsive customers table`.

**Acceptance criteria:** the full §2.1 state matrix; no horizontal scroll at any width; `CustomersTable` covered ≥ 90 % of lines.

#### T2.4 · Customer detail, creation and editing (medium)

**Objective:** `/clientes/:id` with profile, context, notes, the customer's tickets, archive/restore, and the create/edit forms with `If-Match`.
**Dependencies:** T2.3, T1.3.
**Files:** Create `features/customers/{CustomerDetailPage.tsx, .module.css, .test.tsx, CustomerFormDialog.tsx, CustomerFormDialog.test.tsx, CustomerTickets.tsx}`; Modify `queries.ts` (`useCustomer`, `useCreateCustomer`, `useUpdateCustomer(id)`, `useArchiveCustomer`, `useRestoreCustomer`), `router.tsx` (`clientes/:id` with crumb = the name once loaded; `clientes/nuevo` opens the dialog over the list), `e2e/responsive.spec.ts` (route `/clientes/<demo-id>`).

**Decisions:** the form is a `Modal` (creation and editing share the component: `mode: 'create' | 'edit'`); server field errors (`email`) attach to the field; the detail shows `portalAccess` as a badge ("Sin acceso", "Invitación pendiente", "Acceso activo"); Figma's "Plan Pro" is omitted (D-02); the tabs are "Tickets" and "Notas" (no "Actividad", deferred); the tickets use `TicketTable` with `useTicketList({ customerId })` and link to the ticket detail; an archived customer shows the "Archivado" badge, disabled edit controls and a "Restaurar" button (admin).

**Steps:**

- [ ] 1. `CustomerFormDialog` tests: client validation (name and email required, focus on the first error), submit disabled while `isPending`, server field error on `email`, success closes and shows "Cliente creado" / "Cambios guardados", a 412 shows an amber `Alert` and reloads.
- [ ] 2. `CustomerDetailPage` tests: loading, 404 ("No existe el cliente"), data (context "4 tickets · 1 abierto · 3 resueltos" from `totalTickets`/`openTickets`), Notes tab with editing (textarea + save with `If-Match`), archive with confirmation → "Archivado" badge and "Restaurar" (admin only), an agent does not see "Archivar", editing is disabled while archived.
- [ ] 3. Implement; `key={id}` on the inner component as in `TicketDetail`.
- [ ] 4. e2e `customers.spec.ts` (mocked API): list → open detail → edit the name → it shows in the list; mobile: profile and context stacked.
- [ ] 5. Commits `feat(customers): add the customer detail with notes and tickets`, `feat(customers): create and edit customers with optimistic concurrency`.

**Acceptance criteria:** the whole flow checked against the `dev` backend (create, edit, archive, restore) with no console errors; the inbox shows the new name after editing (§3.4 invalidation).

#### T2.5 · Phase closure: e2e, catalog and docs (small)

- [ ] Add `/clientes` and the detail to `responsive.spec.ts`; screenshots `docs/screenshots/customers.png` (light) and `customer-detail-dark.png`.
- [ ] README: status, test figures, "Design decisions" (D-02 for Customers, D-05), roadmap.
- [ ] `docs/api/README.md`: "Scope" table updated.
- [ ] Smoke (T1.4): add "create a customer and use it in a new ticket".
- [ ] Commit `docs: describe the customers area`.

### Phase 3 · Team

#### T3.1 · Memberships contract and migration (small)

**Files:** `openapi.yaml`, `docs/api/README.md`, `V4__membership_status.sql`, `schema.ts`.

**Migration:**

```sql
ALTER TABLE memberships
    ADD COLUMN status     varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('invited', 'active', 'removed')),
    ADD COLUMN invited_at timestamptz,
    ADD COLUMN joined_at  timestamptz,
    ADD COLUMN removed_at timestamptz;
UPDATE memberships SET joined_at = created_at;
CREATE INDEX memberships_organization_status_idx ON memberships (organization_id, status);
```

**Contract (fragment):**

```yaml
/members:            get: listMembers (staff) → array TeamMember ; post: inviteMember (admin) MemberInvite → 201 TeamMember
/members/metrics:    get: getTeamMetrics (staff) → TeamMetrics
/members/{userId}/role:   post: changeMemberRole (admin) {role: admin|agent} → 200 TeamMember; 404; 409 last admin
/members/{userId}/remove: post: removeMember (admin) → 200 TeamMember; 409 when it is oneself or the last active admin
/customers/{id}/invite:   post: inviteCustomer (admin) → 201 TeamMember (role customer); 409 if it already has access
TeamMember: { id (user id), name, email, role, status: invited|active|removed, openTickets: int, joinedAt: date-time|null, invitedAt: date-time|null }
MemberInvite: { email (format email), name?: string (≤120; defaults to the local part of the email), role: admin|agent }
TeamMetrics: { staff, assignedOpen, unassignedOpen, averageLoad: number, firstResponseMinutes: int|null, firstResponseTargetMinutes }
MemberStatus: enum [invited, active, removed]
```

`Member` (from `/assignees`) is unchanged; `/assignees` only returns `active` members.

#### T3.2 · Team API (medium)

**Files:** Modify `Membership.java` (status and dates), `MembershipRepository.java` (`findTeam`, `findStaff` filtering `active`, `findByOrganizationAndUser`), `UserAccountRepository.java` (`findByEmailIgnoreCase`); Create `MemberService.java`, `MembersController.java`, `MemberDtos.java`, `TeamMetricsQuery.java`; Modify `DemoPrincipalResolver.java` (and the future `OidcPrincipalResolver`): `removed` → empty; `invited` → `MemberService.activate(membershipId)` in its own transaction (`REQUIRES_NEW`) and then resolve; Modify `TicketService`/`TicketRepository` (`unassignOpenTickets(organizationId, userId, actor, now)` with one activity per ticket); `SecurityConfiguration` (admin routes); Tests `MembersApiTest.java`, `MemberLifecycleApiTest.java`, extend `DemoAuthenticationTest`.

**Rules:** inviting an email that is already an active or invited member → 400 field `email` "Ya forma parte del equipo."; a `removed` email → back to `invited` (201); the email of a customer of the organization as agent → 400 "Este correo pertenece a un cliente."; changing the role of the last active `admin` → 409; removing oneself → 409; removing the last admin → 409; removal unassigns the unresolved tickets with `assignee_changed` (actor: the admin) in the same transaction; `openTickets` = unresolved tickets assigned; `inviteCustomer` creates the user (if missing) and a `customer` membership with `customer_id`, `invited`.

**Tests (names):** `listsTheTeamWithStatusAndOpenTicketCounts`, `invitesANewMemberAsInvited`, `reinvitingARemovedMemberReusesTheMembership`, `inviteRejectsExistingMembersAndCustomerEmails`, `anInvitedMemberBecomesActiveOnFirstRequest`, `aRemovedMemberGets401`, `removingAMemberUnassignsItsOpenTicketsWithActivity`, `removingYourselfOrTheLastAdminIsAConflict` (review focus 2), `changingTheLastAdminRoleIsAConflict`, `assigneesOnlyListActiveStaff`, `teamMetricsCountStaffLoadAndUnassigned`, `anAgentCannotInviteChangeRolesOrRemove`, `invitesACustomerToThePortal`, `twoOrganizationsCannotSeeEachOthersMembers`.

**Commits:** `feat(memberships): add invitation, activation and removal states`, `feat(team): list members, team metrics and admin actions`, `feat(customers): invite a customer to the portal`.

#### T3.3 · Team page (medium)

**Files:** Create `features/team/{TeamPage.tsx, .module.css, .test.tsx, TeamTable.tsx, TeamTable.test.tsx, InviteMemberDialog.tsx, InviteMemberDialog.test.tsx, ChangeRoleDialog.tsx, RemoveMemberDialog.tsx}`, `domain/member.ts`; Modify `features/team/queries.ts` (`useTeam`, `useTeamMetrics`, `useInviteMember`, `useChangeRole`, `useRemoveMember`), `router.tsx` (`equipo` with `RequireRole` staff), `features/customers/CustomerDetailPage.tsx` ("Dar acceso al portal" button, admin).

**UI:** cards "Agentes", "Tickets asignados" (+ "N sin asignar"), "Carga promedio" ("Tickets por agente"), "Primera respuesta" (target); `TeamTable` "Agente, Rol, Estado, Carga, Acción" (badge "Invitación pendiente" / "Activo"; removed members only behind a `FilterChip` "Retirados"); per-row actions in a `Menu` only for admins ("Cambiar rol", "Retirar del equipo"); "Invitar agente" opens `InviteMemberDialog`, whose Figma copy "Enviaremos una invitación al correo indicado" is replaced by "La persona entrará con este correo; todavía no enviamos correos de invitación" (honest, D-08); the "Permisos por rol" notice links to `/configuracion/permisos`.

**Tests:** the §2.1 states; admin sees actions, agent does not; an invalid invitation email → field error; a 409 when removing the last admin → `Alert` with the Problem `detail`; removal confirmation names the member.
**e2e:** `team.spec.ts` (mocked API): invite, change role, remove with confirmation; mobile as cards.

#### T3.4 · Phase closure and table extraction review (small)

- [ ] Compare `CustomersTable` and `TeamTable`; extract into `components/ui/Table` only the parts that are literally duplicated (layout hook/CSS, card header, caption), keep the column definitions in each feature, and add the extracted parts to the catalog. If the duplication is under ~40 lines, extract nothing and record why in the README "Design decisions".
- [ ] Screenshots, README (D-08, summarized permissions matrix), `docs/api/README.md`, smoke: "invite an agent and watch them go from invited to active".

### Phase 4 · Overview and Reports

#### T4.1 · Reports API and the recent activity feed (medium)

**Files:** `openapi.yaml` (`/reports/summary`, `/tickets/activity`), Create `reports/{ReportsController.java, ReportSummaryQuery.java, ReportDtos.java, ReportPeriod.java}`, `tickets/ActivityFeedQuery.java` (+ `TicketsController` `GET /activity`), Tests `ReportsApiTest.java`, `ActivityFeedApiTest.java`; migration `V5__tickets_created_at_index.sql` (`CREATE INDEX tickets_organization_created_idx ON tickets (organization_id, created_at)`).

**Contract (fragment):**

```yaml
/reports/summary:
  get:
    operationId: getReportSummary
    parameters: [{ name: period, in: query, schema: { type: string, enum: [7d, 30d, 90d], default: 7d } }]
    responses: { '200': ReportSummary, '400': ..., '401': ..., '403': ... }
ReportSummary:
  required: [period, created, resolved, firstResponseMinutes, resolutionHours, byDay, byChannel, byAgent]
  properties:
    period: { from: date-time, to: date-time, days: integer, timeZone: string }
    created: { value: integer, previous: integer }
    resolved: { value: integer, previous: integer }
    firstResponseMinutes: { value: integer|null, previous: integer|null, target: integer }
    resolutionHours: { value: number|null, previous: number|null }
    byDay: array of { date: string (YYYY-MM-DD in the organization's zone), created: integer, resolved: integer }
    byChannel: array of { channel: TicketChannel, created: integer, share: number (0–100, one decimal) }
    byAgent: array of { member: MemberRef, resolved: integer, firstResponseMinutes: integer|null, openAssigned: integer }
/tickets/activity:
  get:
    operationId: listRecentActivity
    parameters: [{ name: size, in: query, schema: { type: integer, minimum: 1, maximum: 50, default: 10 } }]
    responses: { '200': array of ActivityFeedItem }
ActivityFeedItem: { ticketNumber: integer, subject: string, activity: Activity }
```

**Implementation:** native SQL in `ReportSummaryQuery` with `generate_series` for the days (in the zone: `date_trunc('day', created_at AT TIME ZONE :zone)`), `percentile_cont(0.5)` for medians, `FILTER` for resolved; `previous` repeats the query for the previous period of equal length. The current period is `[today − (days − 1) at 00:00 zone, now]`.

**Tests:** `summaryCountsCreatedAndResolvedPerDayInTheOrganizationZone` (review focus 4: a ticket created at 23:30 `America/Mexico_City` falls on that day; repeat the case on the daylight-saving days, 2026-04-05 and 2026-10-25, with `MutableClock`), `previousPeriodHasTheSameLength`, `medianFirstResponseAndResolutionIgnoreTicketsWithoutData`, `byChannelSharesSumToOneHundred`, `byAgentCountsDistinctResolvedTicketsPerActor`, `reopenedAndResolvedAgainCountsOnce`, `emptyOrganizationReturnsZerosAndNulls`, `aCustomerGets403`, `recentActivityIsLimitedToTheOrganizationAndOrdered`.

**Commits:** `feat(reports): add the report summary by period`, `feat(tickets): add the recent activity feed`.

#### T4.2 · `BarChart` and `ProgressBar` components (small)

**Files:** Create `components/ui/BarChart/{BarChart.tsx, .module.css, .test.tsx}`, `components/ui/ProgressBar/{ProgressBar.tsx, .module.css, .test.tsx}`; Modify `index.ts`, `CatalogPage.tsx`.

**Interfaces:**

```ts
export interface BarChartProps {
  label: string
  series: { id: string; label: string; color?: 'brand' | 'muted' }[]
  points: { key: string; label: string; values: Record<string, number> }[]
  valueFormatter?: (n: number) => string
}
export interface ProgressBarProps {
  label: string
  value: number
  max?: number
  valueText?: string
}
```

Fluid SVG (`viewBox` + `width: 100%`), bars with `<title>`, axis labels readable at 320 px (no rotation; days abbreviated "L M X J V S D"), a visually hidden `<table>` always present for screen readers with a "Ver como tabla" button that reveals it; no animation under `prefers-reduced-motion`; `role="img"` + `aria-describedby` pointing to the table.

**Tests:** the table contains every value; the button toggles `hidden`; empty `points` shows "Sin datos en este periodo"; values use `valueFormatter`.

#### T4.3 · Overview page (medium)

**Files:** Create `features/overview/{OverviewPage.tsx, .module.css, .test.tsx, queries.ts}`; Modify `router.tsx` (index: `OverviewPage` for staff, redirect for customers), `features/tickets/activityText.ts` (reuse `toTimelineEvent` with number and subject), `e2e/responsive.spec.ts` (`/`).

**Data:** `useTicketMetrics()`, `useReportSummary('7d')` (only `byDay`; in `features/reports/queries.ts`: `reportKeys = { all: ['reports'] as const, summary: (period: ReportPeriod) => [...reportKeys.all, 'summary', period] as const }`), `useRecentActivity(10)` (in `features/tickets/queries.ts`: `ticketKeys.feed = () => [...ticketKeys.all, 'feed'] as const`), `useTicketList({ view: 'all', status: ['open', 'in_progress'], sort: 'priority,asc', page: 1, pageSize: 5 })`.
**UI:** `PageHeader` "Resumen" / "Tu equipo, tus clientes y lo que necesita atención." with "Ver reportes"; cards: "Tickets abiertos" (+ "N nuevos hoy"), "Resueltos hoy" ("vs. ayer" with an arrow and the absolute difference; no "%" when yesterday = 0), "Primera respuesta" ("Objetivo: N min"; "Sin datos" when `null`), "Sin responsable" (`views.unassigned`, linking to `/tickets?view=unassigned`); `BarChart` "Solicitudes · Últimos 7 días" (no "Datos de ejemplo"); `Timeline` "Actividad reciente" linking to the ticket; `TicketTable` "Necesitan atención" (columns Ticket, Prioridad, Responsable, Actualizado) with "Ver todos".
**Tests:** states; each card with concrete mock values; the activity link goes to `/tickets/1047`; customer redirected.

#### T4.4 · Reports page (medium)

**Files:** Create `features/reports/{ReportsPage.tsx, .module.css, .test.tsx, queries.ts, csv.ts, csv.test.ts, periodParams.ts, AgentsTable.tsx}`; Modify `router.tsx` (`reportes`, staff).

**UI:** period selector (`Tabs` or `Select` "Últimos 7 / 30 / 90 días", in the URL as `?period=30d`); cards: "Solicitudes" (vs. the previous period in %, no % when the previous is 0), "Resueltos" (and "N % de las creadas" = resolved/created when created > 0), "Primera respuesta" (target), "Resolución" (median hours, "Sin datos"); `BarChart` with two series (created, resolved) and its table; "Solicitudes por canal" with a `ProgressBar` per channel (labels "Correo", "Chat", "Teléfono", "Web"); agents table ("Agente, Resueltos, Primera respuesta, Asignados abiertos") built on whatever T3.4 extracted, otherwise feature-local; "Exportar CSV" generated on the client (`csv.ts`: RFC 4180 escaping, UTF-8 BOM, file name `reporte-agentes-<period>-<date>.csv`) and disabled without rows.
**Tests:** `csv.test.ts` (commas, quotes, line breaks, BOM); page: changing the period changes the request and the URL; null values show "Sin datos"; the download calls `URL.createObjectURL` (spy).

#### T4.5 · Phase closure (small)

Screenshots `overview.png`, `reports-dark.png`; README (D-02, D-09, D-10, metric definitions linked to the extended `docs/api/README.md` "Metrics"); e2e `overview.spec.ts` (the chart's alternative table reachable by keyboard); smoke: the created ticket appears under "Necesitan atención".

### Phase 5 · Knowledge base

#### T5.1 · Contract and migration (small)

**Migration `V6__knowledge.sql`:**

```sql
CREATE TABLE knowledge_categories (
    id              uuid PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES organizations (id),
    name            varchar(80)  NOT NULL,
    slug            varchar(80)  NOT NULL,
    description     varchar(160),
    created_at      timestamptz  NOT NULL,
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, slug)
);
CREATE TABLE articles (
    id              uuid PRIMARY KEY,
    organization_id uuid         NOT NULL REFERENCES organizations (id),
    category_id     uuid         NOT NULL,
    slug            varchar(120) NOT NULL,
    title           varchar(160) NOT NULL,
    body            text         NOT NULL,
    status          varchar(16)  NOT NULL CHECK (status IN ('draft', 'published')),
    visibility      varchar(16)  NOT NULL CHECK (visibility IN ('internal', 'public')),
    allow_feedback  boolean      NOT NULL DEFAULT true,
    version         bigint       NOT NULL DEFAULT 0,
    created_by      uuid         NOT NULL REFERENCES users (id),
    updated_by      uuid         NOT NULL REFERENCES users (id),
    created_at      timestamptz  NOT NULL,
    updated_at      timestamptz  NOT NULL,
    published_at    timestamptz,
    UNIQUE (organization_id, id),
    UNIQUE (organization_id, slug),
    FOREIGN KEY (organization_id, category_id) REFERENCES knowledge_categories (organization_id, id)
);
CREATE INDEX articles_list_idx ON articles (organization_id, status, updated_at DESC, id DESC);
CREATE INDEX articles_category_idx ON articles (organization_id, category_id);
```

Demo `V1004__demo_knowledge.sql`: the three categories and the four articles from Figma (the body of "Cómo recuperar el acceso a tu cuenta" with its three steps).

**Contract:** `GET /knowledge/categories` → `Category[] {id, name, slug, description|null, articles: int (visible to the caller)}`; `POST /knowledge/categories` (admin) `{name, description?}`; `GET /knowledge/articles?q&category=<slug>&status&page&size&sort=updatedAt|title` → `ArticlePage` of `ArticleSummary {id, slug, title, category: {id, name, slug}, status, visibility, updatedAt, publishedAt|null}`; `POST /knowledge/articles` (staff) `ArticleCreate {title, body, categoryId, visibility, allowFeedback?}` → 201 `Article` (= summary + `body`, `version`, `createdBy: MemberRef`, `updatedBy: MemberRef`); `GET /knowledge/articles/{slug}` (ETag; customers only published and public → 404 otherwise); `PATCH /knowledge/articles/{slug}` (If-Match, `ArticlePatch`); `POST …/publish`, `POST …/unpublish` (staff; 409 if already in that state); `ArticleStatus` and `ArticleVisibility` enums.

#### T5.2 · Knowledge API (medium)

**Files:** Create `knowledge/{Category.java, Article.java, ArticleStatus.java, ArticleVisibility.java, CategoryRepository.java, ArticleRepository.java, ArticleSearchImpl.java, ArticleService.java, ArticleRequestParser.java, KnowledgeController.java, KnowledgeDtos.java, Slugs.java}`; `SecurityConfiguration`; Tests `KnowledgeApiTest.java`, `KnowledgeAccessApiTest.java`, `SlugsTest.java`.

**Rules:** `Slugs.from(title)`: NFD + strip diacritics + lowercase + `[^a-z0-9]+` → `-` + trim to 100; if it exists in the organization, suffix `-2`, `-3`…; the slug does not change when the title is edited. Search `q`: `ILIKE` on title, body and category name (pattern escaped with `LikePatterns`). Customers: `status` and `visibility` forced. `updated_by`/`updated_at` change on `PATCH`, `publish` and `unpublish`.
**Tests:** `slugsAreAsciiUniqueAndStable`, `customersOnlySeePublishedPublicArticles` (list, detail 404, categories with different counts), `searchMatchesTitleBodyAndCategory`, `creatingUsesTheCategoryOfTheOrganizationOnly` (foreign category → 400 field `categoryId`), `patchRequiresIfMatchAndBumpsVersion`, `publishingTwiceIsAConflict`, `unpublishingHidesFromCustomers`, `anAgentCannotCreateCategories`, `twoOrganizationsCanShareASlug`.

#### T5.3 · Markdown rendering with `react-markdown` (small)

**Files:** `frontend/package.json` (+ `react-markdown` 10.1.0, lazy-loaded with the knowledge routes); Create `features/knowledge/markdown/{ArticleBody.tsx, ArticleBody.test.tsx, outline.ts, outline.test.ts, readingTime.ts, readingTime.test.ts, slugify.ts}`.

**Interfaces:**

```ts
export function ArticleBody({ source }: { source: string }): ReactElement
// <ReactMarkdown skipHtml allowedElements={['h2','h3','p','strong','em','ul','ol','li','a']} unwrapDisallowed
//   components={{ a: SafeLink, h2: Heading(2), h3: Heading(3) }}>  — default urlTransform kept.
export function outline(source: string): { id: string; level: 2 | 3; text: string }[] // from the `## `/`### ` lines, ids via slugify (unique per document)
export function readingTimeMinutes(source: string): number // words / 200, minimum 1
```

`SafeLink` renders `<a rel="noopener noreferrer">`, adds `target="_blank"` for absolute `http(s)` URLs, and renders plain text when `href` is empty (which is what the default `urlTransform` returns for `javascript:`, `data:` and other unsafe schemes). Headings get `id={slugify(text)}` so the outline links work.
**Tests (review focus 3):** `**bold**`, `_italic_`, `-`/`1.` lists, `[t](https://…)` links with the `rel`/`target` attributes, `[x](mailto:a@b.example)` allowed, `javascript:alert(1)` and `data:text/html` links rendered as text, `<script>alert(1)</script>` and `<img src=x onerror=alert(1)>` never appear in the DOM (`container.querySelector('script, img')` is null), a `#` level-1 heading and a code fence render as plain text, `##`/`###` headings get unique ids, the outline lists them in order, reading time of 450 words = 3, and the bundle check that `react-markdown` is not in the main chunk (`npm run build` output).

#### T5.4 · List, categories and search (medium)

**Files:** Create `features/knowledge/{KnowledgePage.tsx, .module.css, .test.tsx, listParams.ts, queries.ts, CategoryCard.tsx, ArticlesTable.tsx}` (`articleKeys = { all: ['articles'] as const, lists: () => [...articleKeys.all, 'list'] as const, list: (params) => [...articleKeys.lists(), params] as const, detail: (slug: string) => [...articleKeys.all, 'detail', slug] as const, categories: () => [...articleKeys.all, 'categories'] as const }`), `domain/article.ts`; `router.tsx` (`conocimiento`, every role; customers only see published articles).
**UI:** `PageHeader` "Base de conocimiento" / "Respuestas claras que ayudan a tus clientes y a tu equipo." with "Nuevo artículo" (staff); `SearchField` "Buscar por título, contenido o categoría…"; category cards (`book` icon, name, "description · N artículos") that filter the list (`?category=slug`); articles table "Artículo, Categoría, Estado, Actualizado" (status hidden for customers); `FilterChip` "Borradores" (staff).
**Tests:** states; a customer sees neither "Nuevo artículo" nor drafts; clicking a category filters and resets the page.

#### T5.5 · Article reading view (small)

**Files:** Create `features/knowledge/{ArticlePage.tsx, .module.css, .test.tsx}`; `router.tsx` (`conocimiento/:slug`, crumb = category › title).
**UI:** header with the status badge (staff) and "Editar artículo" (staff); "Actualizado el 4 de octubre · Lectura: 3 minutos"; body `ArticleBody` at 720 px; "En este artículo" with `outline` (sticky aside ≥ 1200, `<details>` on top below); "¿Necesitas ayuda? Crear un ticket" → `/tickets/nuevo` (staff) or "Contacta con soporte: <support email>" for customers (the email arrives in T6; until then a generic text); an unpublished article seen by staff shows an `Alert` "Borrador: los clientes no lo ven".
**Tests:** 404; the outline links to the ids; a customer has no edit button.

#### T5.6 · Article editor (medium)

**Files:** Create `features/knowledge/{ArticleEditorPage.tsx, .module.css, .test.tsx, PublishPanel.tsx}`; `queries.ts` (`useCreateArticle`, `useUpdateArticle(slug)`, `usePublishArticle`, `useUnpublishArticle`); `router.tsx` (`conocimiento/nuevo`, `conocimiento/:slug/editar`, staff).
**UI:** title (`Input`), body (`Editor` in article mode: no reply/note selector, buttons H2 · B · I · Lista · Enlace), local draft through `useDraft(\`resolve-article-${slug ?? 'nuevo'}\`)` with the text "Borrador guardado en este navegador"; "Guardar" (`PATCH`with`If-Match`; a 412 → `Alert` and reload without losing the local text, which is offered for restore); "Publicación" panel: category (`Select`), visibility (`Radio` "Solo el equipo" / "Clientes y equipo"), status (badge) with "Publicar"/"Despublicar" (confirmation on unpublish), "Permitir valoraciones" (`Switch`, saved; the ratings UI is T5.7); a "Vista previa" tab renders `ArticleBody`of the current text.
**Tests:** validation (title and body required, category required), single submit while`isPending`, a 412 keeps the text, publishing updates the badge and shows a toast, the preview renders the Markdown.

#### T5.7 · Phase closure (+ optional ratings) (small)

e2e `knowledge.spec.ts` (create → preview → publish → see it as a customer), screenshots, README (D-06), `docs/api/README.md`. Optional: `POST /knowledge/articles/{slug}/feedback {helpful}` (204, once per session on the client), `helpfulYes`/`helpfulNo` counters on `Article` for staff and the design's "¿Te resultó útil? Sí / No" block.

### Phase 6 · Settings

#### T6.1 · Contract and migration (small)

`V7__organization_settings.sql`: `ALTER TABLE organizations ADD COLUMN support_email varchar(254), ADD COLUMN version bigint NOT NULL DEFAULT 0;` (the `next_ticket_number` counter is updated through native SQL and does not touch `version`).
Contract: `GET /organization` (staff) → `OrganizationSettings {id, name, supportEmail|null, timeZone, firstResponseTargetMinutes, version}` + ETag; `PATCH /organization` (admin, If-Match) `OrganizationPatch {name? (1–120), supportEmail?: string|null (email), timeZone? (valid IANA → otherwise a 400 field error), firstResponseTargetMinutes? (1–1440)}`; `PATCH /me` (every role) `ProfilePatch {name (1–120)}` → `Me` (no `If-Match`: a single-owner resource, documented). `Organization` (the schema `/me` uses) gains `supportEmail` (nullable) for the article footer.

#### T6.2 · Organization and profile API (small)

**Files:** Modify `Organization.java` (`supportEmail`, `@Version`), Create `organizations/{OrganizationController.java, OrganizationService.java, OrganizationDtos.java}`, Modify `MeController.java` (`PATCH /me`), `UserAccount.java`, `SecurityConfiguration`.
**Tests:** `getsAndPatchesTheOrganizationWithIfMatch`, `rejectsAnUnknownTimeZoneWithAFieldError`, `anAgentCanReadButNotPatchTheOrganization`, `changingTheTargetChangesTicketMetrics`, `patchingMyNameReflectsInMeAndMemberRefs`, `aCustomerCanOnlyPatchItsOwnName`.

#### T6.3 · Settings page and the permissions matrix (medium)

**Files:** Create `features/settings/{SettingsPage.tsx, .module.css, .test.tsx, OrganizationForm.tsx, ProfileForm.tsx, AppearanceForm.tsx, PermissionsMatrix.tsx, permissions.ts, permissions.test.ts, queries.ts}` (`organizationKeys = { all: ['organization'] as const, settings: () => [...organizationKeys.all, 'settings'] as const }`, `useOrganizationSettings`, `useUpdateOrganization`, `useUpdateProfile`); `router.tsx` (`configuracion` with URL tabs `configuracion/{empresa|perfil|apariencia|permisos}`; `configuracion/roles` redirects to `permisos`).
**UI:** tabs "Empresa" (admin; agents see it read-only), "Perfil", "Apariencia", "Permisos" (staff); every form has its own "Guardar cambios" (no global button, so untouched forms are never saved) disabled without changes; time zone as a `Select` over `Intl.supportedValuesOf('timeZone')` grouped by region with the current one preselected; "Apariencia" with `Radio` light/dark/system wired to `useTheme` and the text "Esta preferencia se guarda en este navegador"; "Permisos": a table "Capacidad, Administrador, Agente, Cliente" generated from `permissions.ts` with Figma's amber notice ("Los permisos se validan también en el servidor"); no "Guardar permisos".
**`permissions.ts`:** a list of capabilities `{ key, label, admin: 'allowed'|'own'|'assigned'|'no', agent, customer }` with the values of §3.7 summarized; `permissions.test.ts` compares it with an inline truth table (and F8 may add a backend test that walks `SecurityConfiguration` — optional).
**Tests:** every form (validation, `isPending`, a 412 on Company, success updates `/me` → the workspace name changes in the sidebar), a customer only sees Profile and Appearance.

#### T6.4 · Phase closure (small)

e2e `settings.spec.ts`, screenshots, README (D-07), `docs/api/README.md`; smoke: change the first-response target and see it on the Overview.

### Phase 7 · Catalog and Forma UI criteria

#### T7.1 · Catalog parity and component documentation (small)

- [ ] Add to `/catalogo`: Combobox, SearchField, the table parts extracted in T3.4 (if any), BarChart, ProgressBar; a "Estados" section with "Guardando…", "Cambios guardados", "Error al enviar · Borrador guardado" (copy from Figma "Estados de interfaz").
- [ ] JSDoc on every exported prop; a test imports `index.ts` and fails if an exported component does not appear in `CatalogPage` (explicit exception list: `Field`, `Icon` paths).
- [ ] New catalog screenshot; README "Forma UI" with the component list.

#### T7.2 · Forma UI extraction ADR (small)

Create `docs/decisions/0001-forma-ui-extraction.md` with the brief's criteria (used in ≥ 3 areas without changes for a phase, stable API, no `domain/tickets` types, tokens as CSS custom properties, tests and catalog), the current state per component (table) and the trigger: "extract into `packages/forma-ui` (npm workspace, Vite library mode, tokens as their own package) when a second real consumer exists". Until then, no package is created.

### Phase 8 · Real authentication (proposal until reviewed at the start of F8)

#### T8.1 · Reproducible IdP in local (small)

**Files:** Modify `docker-compose.yml` (`keycloak` service with `start-dev --import-realm`, port `${KEYCLOAK_PORT:-8081}`), Create `deploy/keycloak/resolve-realm.json` (realm `resolve`, confidential client `resolve-api` with redirect `http://localhost:*/api/login/oauth2/code/resolve`, demo users with the seed emails and the password `demo` only in this development realm), `README.md` ("Sign in locally" section). If Q-04 chooses a managed IdP instead, this task becomes the documented tenant configuration and the realm file is skipped.
**Criteria:** `docker compose up -d` leaves Keycloak ready; `curl http://localhost:8081/realms/resolve/.well-known/openid-configuration` answers.

#### T8.2 · OIDC BFF in the backend (large)

**Files:** `pom.xml` (`spring-boot-starter-oauth2-client`), `application-oidc.properties` (`oidc` profile: `spring.security.oauth2.client.registration.resolve.*`, `provider.resolve.issuer-uri=${RESOLVE_OIDC_ISSUER}`), Modify `SecurityConfiguration` (chain for `/api/**`: `oauth2Login` with `defaultSuccessUrl` to `${resolve.public-url}`, `logout` with `POST /logout` → 204, CSRF `CookieCsrfTokenRepository.withHttpOnlyFalse()` + `CsrfTokenRequestAttributeHandler`, session `IF_REQUIRED`, `exceptionHandling` still answers a 401 Problem instead of redirecting for `Accept: application/json`), Create `common/security/OidcPrincipalResolver.java` (`@Profile("oidc")`: verified email → active/invited memberships; several → the one stored in the session or the first; `invited` → activate), `memberships/SessionController.java` (`GET /session/organizations`, `POST /session/organization`), `openapi.yaml` (`Me` gains an optional `organizations: MemberRef[]`, the new routes, `csrf` in the security description), Tests: `OidcAuthenticationTest` (with `oidcLogin()` from `spring-security-test` and `email` claims), `CsrfTest` (a `POST` without the header → 403 Problem), `ProdProfileHasNoDemoLoginTest` (`prod` profile + `X-Demo-User` → 401), `SessionOrganizationTest` (switching to a foreign organization → 403; to an own one → `/me` changes).
**Rules:** `invited` becomes active on the first authenticated access; `removed` and archived customers → 401 with `detail` "Tu acceso a esta organización fue desactivado"; the IdP's name updates `users.name` only when it is empty or equal to the email's local part.

#### T8.3 · Session in the frontend (medium)

**Files:** Create `features/session/{SessionGate.tsx, LoginPage.tsx, OrganizationSwitcher.tsx, useSessionActions.ts}`, Modify `api/client.ts` (CSRF middleware: reads the `XSRF-TOKEN` cookie and sends `X-XSRF-TOKEN` on unsafe methods; `onResponse` 401 → dispatches `resolve:unauthorized`), `AppShell.tsx` (user menu with "Cerrar sesión" and the active organization), `main.tsx`, `router.tsx` (`/entrar`).
**Behaviour:** `/me` 401 → `LoginPage` ("Entrar con tu cuenta" → `window.location.assign('/api/oauth2/authorization/resolve')`); a 401 during a mutation → a persistent `Toast` "Tu sesión caducó" with a "Volver a entrar" button while the form keeps its state (review focus 5: test in `TicketDetailPage.test.tsx` "a 401 while sending a reply keeps the draft and shows the notice"); sign out → `POST /api/logout` → `queryClient.clear()` → `LoginPage`; organization switch → `POST /api/session/organization` → `queryClient.clear()`.
**Dev:** with the `dev` profile (without `oidc`) everything keeps working with the demo user; `LoginPage` additionally shows a demo-user picker (only `MODE !== 'production'`).

#### T8.4 · e2e with the IdP and documentation (medium)

Job `auth-e2e` (optional as a required check): Keycloak as a service with the imported realm, backend with the `dev,oidc` profiles, Playwright `auth.spec.ts`: sign in as Laura, see her name, sign out, 401 on return; README "Authentication" (BFF model, variables, why no in-house passwords, what is missing for production: HTTPS, domain, secret rotation).

### Phase 9 · Deployment and operations

#### T9.1 · Serve the frontend from the API (medium)

**Files:** `application.properties` (remove `server.servlet.context-path`), Create `common/web/ApiPathPrefix.java` (`WebMvcConfigurer` with `configurePathMatch(c -> c.addPathPrefix("/api", HandlerTypePredicate.forBasePackage("com.resolve.api")))`), `common/web/SpaResources.java` (`WebMvcConfigurer.addResourceHandlers`: `/**` → `classpath:/static/` with a `PathResourceResolver` whose `getResource` returns `index.html` when the resource does not exist and the path does not start with `api/` or `actuator/`), `SecurityConfiguration` (matchers with the `/api` prefix, static resources `permitAll`), every `MockMvc` test (`/api/...` → a constant in `ApiIntegrationTest`), `openapi.yaml` (`servers: [{url: /api}]` already says so), `vite.config.ts` unchanged.
**Criteria:** `./mvnw -B verify` green; with `frontend/dist` copied into `backend/target/classes/static`, `java -jar` serves the app at `/` and the API at `/api`; reloading `/tickets/1047` returns `index.html`.

#### T9.2 · Docker image and per-environment configuration (medium)

**Files:** Create `Dockerfile` (multi-stage: `node:22-alpine` frontend build → `maven:3.10-eclipse-temurin-25` jar build with `dist` in `static/` → `eclipse-temurin:25-jre` with a non-root user, `HEALTHCHECK` on `/actuator/health/readiness`), `.dockerignore`, `deploy/docker-compose.prod.yml` (api + postgres + keycloak to test the image locally), `application-prod.properties` (`management.endpoint.health.probes.enabled=true`, `server.forward-headers-strategy=framework`, `logging.structured.format.console=ecs`, `spring.flyway.locations=classpath:db/migration`), `docs/deploy/README.md` (variable table: `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `SPRING_PROFILES_ACTIVE=prod,oidc`, `RESOLVE_OIDC_ISSUER`, `RESOLVE_OIDC_CLIENT_ID`, `RESOLVE_OIDC_CLIENT_SECRET`, `RESOLVE_PUBLIC_URL`, `SERVER_PORT`; none with a default in `prod`).
**HTTP security:** `HSTS`, `X-Content-Type-Options`, `Referrer-Policy`, a `Content-Security-Policy` for the SPA (`default-src 'self'`; bundled fonts, no CDN), `Secure` cookies.
**Logs:** ECS JSON, no request bodies or emails at `INFO`; `ApiExceptionHandler` logs 5xx with the Problem `instance` as correlation.
**Tests:** `ProdProfileSmokeTest` boots the context with `prod` and dummy variables and checks there is no `DemoPrincipalResolver` and that `/api/me` → 401.

#### T9.3 · Deployment pipeline and the resettable demo (medium)

**Files:** `.github/workflows/deploy.yml` (on `push` to `main` after CI: image build → GHCR tagged with the SHA and `latest` → deployment to the platform chosen in Q-05 with the SHA tag), `deploy/fly.toml` (if Fly), `.github/workflows/demo-reset.yml` (scheduled at 03:00 in the organization's zone and manual: maintenance toggle on → `flyway clean` + `flyway migrate` with `db/migration,db/demo` against the demo database → toggle off → smoke run), `common/web/MaintenanceFilter.java` (503 Problem "Reinicio de la demostración en curso" and health `OUT_OF_SERVICE` while the toggle is on), `common/web/DemoLimits.java` (the §4.5-5 caps as a service check, 409 Problem "Límite de la demostración"; enabled by `resolve.demo.limits=true`), the "Demostración pública" banner in `AppShell` driven by a `demo` flag in `/me`'s organization (contract change), README "Live demo" with the demo accounts.
**Criteria:** a `push` to `main` publishes the new version; `health` answers `UP`; the reset workflow completes in under 2 minutes and the smoke passes afterwards; the caps return 409 (tested); rollback = redeploy the previous tag (documented in T9.4).

#### T9.4 · Runbooks: backups, restore and rollback (small)

`docs/deploy/runbooks.md`: backups (provider snapshots + a weekly `pg_dump -Fc` to external storage), a rehearsed restore into an empty database (`pg_restore`), deployment rollback (previous tag; expand/contract rule: every migration must be compatible with the previous application version, verified in the PR), OIDC secret rotation, what to look at when `health` is `DOWN`.

#### T9.5 · Closure (small)

README: "public demo" status, deployment badge, "Operations" section; remove the fulfilled roadmap items; `docs/api/README.md` "Authentication" updated.

---

## 7. Testing strategy

| Level                                                                    | What it covers                                                                                                                                                                                                                                                                                                                                                                                                        | How                                                                                                                        | When it runs                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Backend integration (JUnit + MockMvc + Testcontainers PG 17)             | Organization isolation (two organizations in every read and write test), permissions per role (admin, agent, customer on every endpoint), internal-note privacy, reference validation, filters/search/sort, pagination, concurrent numbering, edit conflicts, change↔activity consistency, metrics with a controlled clock and time zones, real migrations, the contract (validated responses and operation coverage) | One class per use case, `TestData` for seeding, `MutableClock`, `matchesContract`, real threads in `TicketConcurrencyTest` | `./mvnw -B verify` on every PR (backend job) |
| Frontend unit and component (Vitest + Testing Library + typed `mockApi`) | Forms, the §2.1 states, navigation and guards, visible permissions, filters/pagination/URL, 412 conflicts, 401, relevant accessible behaviours (names, focus, `aria-*`)                                                                                                                                                                                                                                               | One test per matrix row; no implementation details (queries by role and name)                                              | frontend job (coverage ≥ 80/75/75/80)        |
| e2e with a mocked API (Playwright)                                       | Flows per area, drawer, responsive (320–1440, the 767/768 and 1199/1200 edges, both themes), keyboard                                                                                                                                                                                                                                                                                                                 | `e2e/*.spec.ts` with `fixtures.ts`                                                                                         | e2e job                                      |
| Full-stack smoke (Playwright + `dev` backend + PostgreSQL)               | Create and find a ticket, detail, changes, reply and note, customer view, plus one scenario per new phase                                                                                                                                                                                                                                                                                                             | `e2e-smoke/*.smoke.ts`                                                                                                     | smoke job (T1.4)                             |
| Authentication e2e (optional)                                            | Sign in, sign out, expiry                                                                                                                                                                                                                                                                                                                                                                                             | IdP in CI                                                                                                                  | auth-e2e job (T8.4)                          |
| Manual before every UI PR                                                | Comparison with Figma at equal width, both themes, expanded/collapsed/drawer menu, long names and empty lists                                                                                                                                                                                                                                                                                                         | Playwright screenshots                                                                                                     | PR checklist                                 |

Principles: tests of observable behaviour; tests that only repeat the implementation do not count; coverage is a threshold, not the criterion; fast (unit) and slow (smoke) tests live in different folders and jobs; independent reviewers check requirements, permissions and behaviour, not only code style.

## 8. Deployment strategy

First publication: **public demo** (D-14, Q-06, with the isolation, limits and reset procedure of §4.5-5). Requirements: one image (API + SPA), managed PostgreSQL with snapshots, the IdP with the demo realm, documented variables without defaults in `prod`, secrets in the platform's manager and in GitHub Environments, HTTPS terminated by the platform with `forward-headers`, no CORS (same origin), JSON logs without sensitive data, `health` with liveness/readiness probes, demo data reset nightly, rollback by image tag, backward-compatible migrations. What is missing for real users (and is not promised): own domain, personal-data retention and deletion policy, support and SLA, alerting.

## 9. Technical risks and how to check them

| Risk                                                                                                                                   | Signal                                                    | Check / mitigation                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Recent Spring Boot 4.1 / Hibernate 7 / Jackson 3 ecosystem (`tools.jackson` APIs, `HandlerTypePredicate`, `oauth2Login` in Security 7) | Compilation failures or behaviour different from the docs | Versions pinned by the parent; one test per mechanism (contract, CSRF, path prefix); the parent is not upgraded in product PRs                                     |
| `allOf` + `additionalProperties: false` (T2.1)                                                                                         | The validator or `openapi-typescript` reject properties   | Checked in T2.1; if it fails, flat schemas duplicating fields                                                                                                      |
| Thread-based tests (T1.2) flaky                                                                                                        | Intermittent CI failures                                  | `CountDownLatch` + injectable barrier; run 3 times locally; `@Timeout`                                                                                             |
| Row lock on `PATCH` (T1.2)                                                                                                             | A long-running `PATCH` would block replies                | The transaction only covers the parse, the check and the flush (milliseconds); the barrier test proves the wait is bounded; no I/O inside the lock                 |
| Slow reports with real data                                                                                                            | p95 > 500 ms on `/reports/summary`                        | `(organization_id, created_at)` index; a local script in `tools/` seeds 50 000 tickets and measures with `EXPLAIN ANALYZE`; `previous` in the same query if needed |
| Time zones and daylight saving                                                                                                         | "Hoy" differs between UI and metrics; duplicated days     | T1.5 and T4.1 with `MutableClock` on the 2026 transitions                                                                                                          |
| Markdown rendering                                                                                                                     | XSS or broken HTML                                        | `react-markdown` with `skipHtml`, an element whitelist and the default URL sanitizer; hostile-input tests                                                          |
| BFF + cookies + SPA                                                                                                                    | CSRF, `SameSite`, redirects that break the Vite proxy     | Same origin through the proxy; `CsrfTest`; e2e with the IdP                                                                                                        |
| Dependabot majors (react-router 8, TS 7, jsdom 30)                                                                                     | A misleading green CI on big PRs                          | Individual review on their own branch with the full suites and the changelogs; Node ≥ 22.22.2 for jsdom 30                                                         |
| `addPathPrefix` (T9.1) breaks security matchers                                                                                        | An endpoint ends up open or closed by mistake             | A test walks `operationIds()` and, for each operation, asserts the expected status per role (extension of the coverage listener)                                   |
| Backend CI time as tests grow                                                                                                          | > 10 min                                                  | One shared container (already `@ServiceConnection`), `spring.test.context.cache`, grouped fixtures; measured every phase                                           |
| Numbering through a locked row                                                                                                         | Waits under creation bursts                               | Acceptable (an organization does not create hundreds of tickets per second); the T1.2 test documents it                                                            |
| Demo abuse                                                                                                                             | Spam or resource exhaustion on the public demo            | Rate limit, per-organization caps and the nightly reset of §4.5-5                                                                                                  |

## 10. Deferred features

Tags and attachments (file storage), SLA (targets per priority, pauses, business hours) and "Cumplimiento SLA", satisfaction (surveys), notifications (email, in-app, preferences), ticket deletion and bulk actions (multi-select already supported by `TicketTable`), customers who create tickets or reply (D-12), agent availability (present/away), email invitations, the customer "Activity" tab, customer merging, full-text search, article versions, ratings (optional T5.7), custom periods and server-side export, `Idempotency-Key`, a full organization switcher, the `forma-ui` package, mobile frames for the new views (derived from rules), real-time events (WebSocket/SSE), rate limiting outside the demo, API versioning, i18n (the UI is Spanish only), PWA/offline.

## 11. Final table

| Phase                   | Verifiable result                                                                                        | Dependencies | Completion criterion                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| F0 Audit                | Issue #9 closed on its criteria; per-feature cache keys; `RequireRole`; contract operation coverage      | —            | 3 PRs merged; `grep` for loose keys = 0; removing a `matchesContract` breaks the build        |
| F1 Tickets closure      | Inbox sorting; customer filter; dates in the organization's zone; 6 concurrency tests; smoke job         | F0           | Smoke as a required check in green; README updated; the F1 delivery report reviewed before F2 |
| F2 Customers            | `/clientes`, `/clientes/:id`, create/edit/archive; `CustomersTable`                                      | F1           | Full state matrix; manual flow against `dev`; e2e + smoke; screenshots                        |
| F3 Team                 | `/equipo` with invite, role, remove; portal access; membership states; shared table parts (if extracted) | F2           | Last-admin 409 tested; `/assignees` only active; invitation smoke                             |
| F4 Overview and Reports | Real `/`; `/reportes` by period; `BarChart`/`ProgressBar`; activity feed; CSV                            | F3           | §3.6 definitions tested with time zones; no "Datos de ejemplo"; accessible table              |
| F5 Knowledge base       | Categories, articles, reading view, editor, publication; safe rendering                                  | F4           | Hostile Markdown tests; customers only see published public articles; e2e                     |
| F6 Settings             | Company, profile, appearance, permissions matrix                                                         | F5           | Changing the target shows on the Overview; matrix validated against the permissions table     |
| F7 Catalog              | Complete catalog; extraction ADR                                                                         | F6           | Catalog↔`index.ts` parity test; ADR merged                                                    |
| F8 Authentication       | IdP locally; OIDC BFF; session, expiry, sign-out, organization                                           | F3           | `prod` without demo (tested); CSRF tested; sign-in/out e2e                                    |
| F9 Deployment           | Image, pipeline, public demo with limits and reset, runbooks                                             | F8           | Public URL with `health` UP; rollback rehearsed; restore rehearsed; reset rehearsed           |

## 12. First task and prior decisions

**First implementation task: T0.1 (close issue #9)** on the branch `fix/tickets-follow-ups`, in lane A of wave 1 (§5.1), with T0.3 in lane B. Issue #9 is closed only when the acceptance criteria listed in T0.1 are verified. No decision is required.

Before **F1**: no decision; T1.4 needs the owner to add "Full-stack smoke" to the ruleset's required checks once the job exists. At the end of F1 the coordinator delivers: changes made, tests and results, pending problems, and the end-to-end status of Tickets; that delivery is reviewed before F2 starts.

Before **F2**: Q-01 and Q-02 are confirmed (§4.1).

Before **F3/F4**: Q-03 (agents see Team and Reports). Default: yes, read-only.

Before **F8/F9**: Q-04 (IdP), Q-05 (platform), Q-06 (public demo). Defaults: Keycloak, Fly.io + Neon, demo. D-13 is reviewed at the start of F8 with §4.5-4.

---

## Appendix A · The brief (summarized)

Goal: Resolve as a functional support platform and a solid portfolio project: coherent visuals, light/dark theme, expanded/collapsed navigation with tooltips, responsive, real backend and database, clear contracts, organization isolation, server-side permissions, tests of the important behaviours, documentation to run, maintain and deploy. First delivery: Tickets end to end; the rest with its own scope, dependencies and criteria.
Mandatory prior inspection with findings in four categories (§1). Fixed stack (§Global constraints). Plan rules: tasks with objective, dependencies, files, decisions, observable criteria, tests, commands and size; distinguish decisions taken, recommendations, blockers and optional items; no dates; save under `docs/plans/` in the absence of a repository convention.
Areas and states per screen (§2). Tickets: inbox, views, filters, search, sort, pagination, metrics, detail, creation, changes, replies, notes, history, conflicts; URL for filters/sort/page; full backend (§1.1, F1). Backend by feature with `common` as infrastructure only (§3.1). Central contract with generation and CI checks (§3.3). Organizations and permissions with two-organization tests (§3.7). Two-stage authentication with a proposal (§3.8). Database: Flyway, validate, separate demo, justified indexes, UUID + per-organization number without `max+1`, concurrent tests, activity in the same transaction, behaviour on deletion/deactivation/renaming (§3.9). Concurrency and messages with the version/`updatedAt`/messages compatibility explained (§3.5, §4.5-1). Defined metrics, no SLA (§3.6). Design system, navigation and Forma UI criteria (§3.10, T7.2). Responsive and accessibility (§3.10). Frontend state and data with invalidations (§3.4). Tests (§7). Git, CI and dependencies (§Global constraints). Deployment and operations (§8, F9). Suggested order (§5). Deliverables (§1–§12) and definition of done (Appendix B). Follow-up instructions of 2026-10-04: Q-01 and Q-02 confirmed; justify the `updated_at` trigger, the generic table, Markdown without an in-house parser, BFF + OIDC + Keycloak and the resettable demo (§4.5); execute subagent-driven with Herdr and git worktrees, at most two implementers in parallel, independent review of requirements and behaviour; deliver and review F1 before F2.

## Appendix B · Definition of done (checklist for every PR)

- [ ] Works with real data against the `dev` backend (checked manually and, where applicable, in the smoke).
- [ ] Persists and shows up in the affected lists, details and metrics (§3.4 invalidations).
- [ ] Respects organization and permissions (a test with two organizations and the three roles).
- [ ] Honours the contract (`matchesContract`, `api:types` without diff, `docs/api/README.md` updated).
- [ ] Handles loading, empty, no results, error and no permission (§2.1 matrix).
- [ ] Keeps the style (tokens, Forma UI components, both themes reviewed).
- [ ] Works at 320, 390, 768, 1024 and 1440 px and on the 767/768 and 1199/1200 edges (responsive e2e).
- [ ] Has the §7 tests it needs; no test repeats the implementation.
- [ ] CI green without disabling anything; every commit builds on its own.
- [ ] README and `docs/` describe what was done without presenting pending work as finished; screenshots when a view changes.
