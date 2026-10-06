# Resolve API contracts

This document fixes the decisions behind the Resolve API. The machine-readable contract is [`openapi.yaml`](openapi.yaml): the backend validates its responses against it in tests and the frontend generates its types from it, so it is the single source of truth.

## Paths and server

Every endpoint of this document lives under `/api` (`servers: [{ url: /api }]` in the contract). The prefix is added to the controllers by `ApiPathPrefix` and to the security rules by `SecurityConfiguration`, not by a servlet context path, so the same application can serve the web app from the root of the same origin (no CORS). Anything outside `/api` is public static content or the web app (`SpaResources`: a path that is not a file and does not start with `api/` or `actuator/` answers `index.html`, `/assets/**` is cached for a year, `index.html` is never cached, and a missing `/assets/**` file is a `404`, not the index); anything under `/api` that is not an operation answers `401` to an anonymous caller, `403` to a customer and `404` to staff. The health endpoint stays under the prefix: `GET /api/actuator/health`. Tests walk every contract operation with every role (`ApiAccessMatrixTest`, `OidcApiAccessMatrixTest`) so a rule that stops matching its route cannot go unnoticed.

## Scope of the first delivery

| In scope | Out of scope (documented, not exposed in the UI yet) |
| --- | --- |
| Ticket inbox with views, filters, search, sorting and pagination | Tags, attachments and file storage |
| Ticket detail: conversation, internal notes, activity | SLA targets and SLA compliance |
| Create ticket, change status, priority and assignee | Customer notifications by email |
| Customers: list, search, company filter, profile, create, edit, archive, restore, portal invitation and metrics; assignee list for forms | Deleting tickets and bulk actions |
| Inbox metrics and view counts | Local passwords and self-registration (the identity provider owns them, see [Authentication](#authentication)) |
| Team: list, invite, change role, remove, team metrics | Invitation emails, agent availability and profiles |
| Reports: created, resolved, first response, resolution time, by day, channel and agent | Satisfaction and agent availability |
| Knowledge base: categories, Markdown articles with draft/published and internal/public visibility, search, editing with `If-Match`, publish and unpublish | Article ratings, versions, attachments and full-text search |
| Recent activity feed: the latest entries of every ticket's log, newest first | Editing roles and permissions (roles are fixed; the server decides) |
| Settings: the organization (name, support email, time zone, first-response target; `If-Match`) and your own display name (`PATCH /me`) | Notification settings (D-07: nothing consumes them yet) |
| Session: current user (`/me`), switching organization (`/session/organizations`, `/session/organization`) and sign-out (`/logout`) | Local passwords, registration and password recovery (the identity provider owns them) |

## Organizations, users and roles

- Every request runs in the context of **one organization**, taken from the authenticated principal. The API never accepts an organization id from the client, with one exception: `POST /api/session/organization` receives the id of the organization to work in and never trusts it (it is checked against the memberships of the verified identity). Every query and mutation is scoped to that organization.
- A **user** belongs to an organization through a **membership** with one role:

| Role | Tickets | Messages | Activity, metrics, reports, customers, assignees |
| --- | --- | --- | --- |
| `admin` | Read all, create, update | Read all, post `public` and `internal` | Yes |
| `agent` | Read all, create, update | Read all, post `public` and `internal` | Yes |
| `customer` | Read only the tickets of their own customer record | Read only `public` messages | No (403) |

- A `customer` membership is linked to a **customer** record of the same organization. Customers are read-only in this delivery: every write returns `403`, and so does every `/customers` endpoint.
- The **team** (`/members`) is readable by `admin` and `agent` (`customer` gets `403`); inviting, changing a role and removing a member are **admin-only**, and the URL rule answers `403` before the member is even looked up.
- `PATCH /api/me` is open to every role, including `customer`, and edits only the caller's own **person** (`users.name`): not the customer record that staff manage, not the email or the role, and any other field is a `400`. The name shows up live in `/me` and, for staff, in the assignee, the authors of their messages, the team, the assignees and the reports; the activity history (both the per-ticket log and the organization feed) keeps the name it had when it was recorded (plan §3.9). A customer's tickets and messages keep showing the customer record, so renaming a customer member only changes their own `/me`. The person is global, so the new name applies to all their organizations.
- The **organization settings** (`/organization`) are readable by `admin` and `agent` and editable only by `admin`; a `customer` gets `403` on both. Changing the first-response target changes `firstResponseTargetMinutes` in the ticket and team metrics and `firstResponseMinutes.target` in the reports; changing the time zone changes the reports' `period` and `byDay` days.
- Archiving, restoring and inviting a customer to the portal is **admin-only**: an agent gets `403`, before the customer is even looked up.
- The **knowledge base** is readable by every role, but a `customer` only reaches the articles that are `published` **and** `public`; any other article answers `404`, exactly like an unknown slug or one of another organization. Creating and editing articles and publishing or unpublishing them is for `admin` and `agent`; creating categories is **admin-only** (`403` for an agent). The role check runs before anything is read, so a `customer` that attempts a write gets `403` whatever the body or the slug.
- **Internal notes never reach customers.** The filter is applied in the database query, and no field visible to customers is derived from internal notes.
- Resources show other members as `{ id, name }` (`MemberRef`); contact data is only in `GET /api/me` and `GET /api/assignees`, which customers cannot call.

### Authentication

The security layer resolves the principal from a pluggable source, one per profile:

- **`oidc` profile: a backend-for-frontend with OpenID Connect.** The browser signs in by navigating to `/api/oauth2/authorization/resolve`; the API runs the authorization code flow with PKCE against the identity provider (Keycloak in local development, any compliant provider by changing three properties: `RESOLVE_OIDC_ISSUER`, `RESOLVE_OIDC_CLIENT_ID`, `RESOLVE_OIDC_CLIENT_SECRET`), keeps the tokens **on the server** and answers with an `HttpOnly`, `SameSite=Lax` session cookie (`Secure` unless `RESOLVE_SESSION_COOKIE_SECURE=false`). The frontend manages no tokens. After signing in the browser returns to `RESOLVE_PUBLIC_URL`; if the provider rejects the sign-in it returns to `RESOLVE_PUBLIC_URL/entrar?error=oidc`.
  - **Identity.** The email the provider verified is matched, without regard to case, against the memberships. A token whose `email_verified` is not `true` authenticates nobody: otherwise, with another provider, registering someone else's address would activate their invitation. The principal is resolved on **every request** from that email and is never stored in the session, so removing a member or archiving their customer takes effect on their next request even if their session is still alive. A person without memberships gets `401` and no user is created.
  - **First access.** An `invited` membership is activated by the first authenticated request that resolves into it, and only that one: an invitation to another organization, or another person's, is untouched. The provider's name replaces `users.name` only when the stored name is empty or equals the local part of the email (what an invitation leaves); it never overwrites a name the person chose.
  - **CSRF.** Requests authenticated by the cookie must prove they come from the application. The API sets a readable `XSRF-TOKEN` cookie (`Path=/`, `SameSite=Lax`, `Secure` in `prod`) on every response under `/api`, including `401` ones (the web app's own files, such as `index.html` and `/assets`, carry no cookie), and expects its value in the `X-XSRF-TOKEN` header on every `POST`, `PATCH`, `PUT` and `DELETE`; without it the answer is a `403` Problem whose `detail` is "Falta el token CSRF o no es válido." (not the role message). Signing in discards the previous token, so a client reads the cookie again after its first `GET /api/me`. A request without a session but with a valid token gets `401`, not `403`.
  - **401 is a Problem, never a redirect**, whatever the `Accept` header: the only redirects are the ones of the sign-in flow itself.
  - **Sign out.** `POST /api/logout` invalidates the server session, deletes the `JSESSIONID` cookie (same `Path`, `/api`: `server.servlet.session.cookie.path`) and answers `200` with `{ "logoutUrl": "…" }`: the provider's end-session endpoint with `id_token_hint` and `post_logout_redirect_uri` (`RESOLVE_PUBLIC_URL`). The client navigates to that URL (`window.location.assign`), which also ends the provider's session, so the next "Sign in" asks for the password again. The URL carries the signed-out person's ID token and nothing else of the client (no secret, access or refresh token, or session id); without a session, or with a provider that has no end-session endpoint, it is just the public URL. It is idempotent and needs the CSRF header. The tokens of the OIDC client live in the HTTP session and die with it.
  - **Organization.** A person with usable memberships in several organizations works in the one stored in their session (`POST /api/session/organization`, listed by `GET /api/session/organizations` and by `Me.organizations`), or in the first by id when nothing is stored or the stored one stopped being usable. An organization where the caller has no usable membership answers `403`, exactly like one that does not exist.
- **`dev` and `test` profiles (without `oidc`): a demo principal resolver** (declared in the contract as the optional `X-Demo-User` security scheme): the `X-Demo-User` header selects a seeded user by email; without the header, `dev` falls back to the demo administrator and `test` rejects the request. There is no CSRF here, and no session either until someone chooses an organization: `POST /api/session/organization` is the only thing that creates one (an `HttpOnly`, `SameSite=Lax` cookie, not `Secure`), and the resolver then honours the organization stored in it. The demo frontend and the full-stack smoke test work as before.
- **Any other profile** (the default, `prod`) has no demo resolver, and the demo resolver is also off whenever `oidc` is active, even next to `dev`: `X-Demo-User` does nothing. Without `oidc` every API call returns `401`. Tests guard both cases (`ProdProfileHasNoDemoLoginTest`, `ProdProfileWithOidcHasNoDemoLoginTest`).
- A membership has a **status**: `invited` (bound to an email that has not signed in), `active` or `removed`. A `removed` membership does not resolve a principal (`401`); if the same user has another membership that is usable, that one is used. An `invited` membership is **activated on the first request** of that user, in its own transaction, with a conditional `UPDATE` so a removal committed in between is not undone. The read, the activation and the name update are successive transactional calls, never nested: a request does not hold a connection of the pool while asking for another (issue #37).
- A `customer` membership whose customer is **archived** does not resolve a principal either: the member gets `401` until an admin restores the customer. If the same user has another membership that is not archived, that one is used. When the identity exists but has no usable membership left, the `401` `detail` is "Tu acceso a esta organización fue desactivado" (otherwise "Inicia sesión para usar la API.").

## Identifiers

- Internal identifiers are UUIDs. Tickets also have a visible `number` that is unique **within the organization** (two organizations each have a ticket #1).
- Numbers come from a per-organization counter row locked during the insert, never from `max(number) + 1`.
- A `format: uuid` value (path, query parameter or body field) must have the **canonical form**: 36 characters, hyphens at 8-4-4-4-12, hexadecimal digits in lower or upper case; only spaces, tabs and line breaks (`[ \t\r\n]`) around it are ignored; any other character, Unicode spaces such as U+3000 and control characters such as NUL included, is a `400`. Anything else (`1-2-3-4-5`, braces, no hyphens, a `+` sign, a control character) is a `400` on the field, never an empty page or a lookup that finds nothing. No version or variant is required. One shared reader, `Uuids.parse`, covers the tickets, customers and knowledge APIs; the team API (`memberships`) still reads its member ids with `UUID.fromString` and is pending the same change.
- Customer routes use the uuid: `/api/customers/{id}`. A malformed id is a `400` on the field `id`; a well-formed id that belongs to another organization or does not exist is the same `404`.
- Article routes use the **slug**: `/api/knowledge/articles/{slug}`. It comes from the title when the article is created and never changes, so links keep working after a title edit. Two organizations can have the same slug.
- Ticket routes use the number: `/api/tickets/{number}`. A number that does not exist in the caller's organization, or a ticket that belongs to another customer, returns `404` (never `403`, so existence is not leaked). The role check runs before the lookup, so a `customer` that attempts a write always gets `403`, whatever the number.

## Wire format

- JSON with `camelCase` fields, ISO 8601 timestamps in UTC (`2026-10-04T10:12:00Z`).
- Enumerations are lowercase `snake_case` and match the frontend exactly:
  - `status`: `open`, `in_progress`, `waiting`, `resolved`
  - `priority`: `urgent`, `high`, `medium`, `low`
  - `visibility`: `public`, `internal`
  - `channel`: `email`, `chat`, `phone`, `web`
  - `role`: `admin`, `agent`, `customer`
- Text filters (`q` and `company` on customers, `q` on tickets, `q` and `category` on articles) are single lines: a control character, the NUL that PostgreSQL cannot store included, is a `400` on that parameter ("No admite caracteres de control."), exactly as in request bodies. A filter made only of control characters, such as `?q=%0A`, is therefore a `400` too (it used to be ignored as blank). It is checked on the value as received, so a trailing NUL is not silently trimmed away. As a safety net, a database error with SQLSTATE `22021` that escapes the validation is also a `400` Problem; any other integrity error stays a `500`.
- Errors use **Problem Details** (RFC 9457, `application/problem+json`). Validation errors add `errors: [{ field, message }]`.

| Status | When |
| --- | --- |
| 400 | Malformed request, invalid path number, invalid query parameter (unknown sort field, size over 100) or validation error |
| 401 | No authenticated principal |
| 403 | The role does not allow the action |
| 404 | Resource not found in the caller's scope (foreign and missing ids answer the same) |
| 409 | The action is not allowed in the resource's current state (archiving an archived customer, editing an archived customer, removing yourself or the last active admin, changing the role of the last active admin, acting on a removed member). It is a business-rule conflict, not input validation (400) and not versioning (412). On the public demo, creating a ticket, customer, team member or article beyond the per-organization cap (500, 200, 50, 100) is a `409` titled "Límite de la demostración" |
| 412 | `If-Match` does not match the current version of the resource |
| 428 | `If-Match` is missing on an update |
| 429 | Public demo only: more than 60 writes in a minute from the same address (`Retry-After` says when to retry; an IPv6 client is counted by its /64 prefix). It comes from a servlet filter before the controllers and is declared (`TooManyWrites`) on every write operation |
| 503 | Another transaction held the row lock for more than 3 seconds (title "Recurso ocupado"), or, on the public demo, the nightly data reset is in progress (title "Reinicio de la demostración en curso", from a filter that answers every `/api` path except the health probes); repeat the request after `Retry-After`. Declared (`ServiceUnavailable`) on every operation |

### References to other records

`customerId` and `assigneeId` in request **bodies** must belong to the caller's organization, the customer must not be archived and the assignee must be an admin or agent. Unknown, foreign and archived customers get the **same** `400` field error, so the API never reveals data of other organizations. List filters never fail on foreign or unknown ids: they return an empty page (see [Ticket list filters](#ticket-list-filters)).

## Pagination and sorting

- `page` starts at **0**; `size` defaults to **20** and must be between 1 and 100 (otherwise `400`).
- Responses use the envelope `{ items, page, size, totalItems, totalPages }`.
- `sort` is `field,direction` (for example `updatedAt,desc`). Only whitelisted fields are accepted; any other field returns `400`.
  - Tickets: `updatedAt` (default, `desc`), `createdAt`, `number`, `priority`, `status`. `priority` and `status` sort by rank (urgent → low; open → in_progress → waiting → resolved), not alphabetically. Ties are broken by `number desc`.
  - Customers: `name` (default, `asc`, compared case-insensitively), `createdAt` and `openTickets`. Ties are broken by `id asc`.
- A page past the last one returns `200` with no items; `totalPages` is `0` when nothing matches.
- Messages and activity are not paginated.
- The frontend shows 1-based page numbers and converts at the API client.

## Concurrency

- Tickets and customers expose a `version` and an `ETag: "<version>"` header.
- `PATCH /api/tickets/{number}` requires `If-Match: "<version>"`, a single strong validator (weak validators, lists and `*` are rejected with `400`):
  - a different version returns `412` and the client reloads the ticket before retrying;
  - a missing header returns `428`.
- `PATCH` loads the ticket with a row lock (`PESSIMISTIC_WRITE`, which Hibernate issues as `SELECT … FOR NO KEY UPDATE` on PostgreSQL) and compares the client's version with the stored one inside the same transaction. Two simultaneous patches with the same version are serialized: the second waits for the first to commit, reads the new version and gets the explicit `412`. JPA optimistic locking (`WHERE version = ?`) stays as a safety net for any other writer. That lock does not conflict with the `FOR KEY SHARE` taken by the `INSERT` of a message: an internal note never waits for a `PATCH`, and a public reply only waits at its `UPDATE` of the ticket.
- A patch that changes nothing returns `200` without a new version or activity entry.
- Errors are checked in this order: `401`, `403`, `404`, `428`, `400`, `412`.
- `PATCH /api/customers/{id}` works the same way (`If-Match`, `428` when missing, `412` when stale, no new version for a patch that changes nothing). Its `409` for an archived customer comes **last**: `401`, `403`, `404`, `428`, `400`, `412`, `409`. A client holding an old version is told to reload (`412`) before it is told the customer is archived. Archiving and restoring bump the version, so an edit form opened before an archive fails with `412` afterwards. `PATCH`, archive and restore load the customer with a row lock (`PESSIMISTIC_WRITE`), so simultaneous writes are serialized: two patches with the same version yield one `200` and one `412`, and two simultaneous archives (or restores) yield one `200` and `409` for the rest, never a `412` that those actions do not declare. JPA optimistic locking stays as the safety net.
- `PATCH /api/organization` follows the same rules (`If-Match`, `428`, `400` before `412`, no new version for a patch that changes nothing, row lock so two simultaneous edits yield one `200` and one `412`). The ticket counter (`next_ticket_number`) is bumped with a native `UPDATE` that never touches `version`, so creating tickets does not invalidate a settings form that is open. `timeZone` must be an IANA region spelled exactly as both Java and PostgreSQL know it (checked against `pg_timezone_names`): offsets (`+05:00`), `Z` and aliases such as `UTC+5` (which PostgreSQL reads with the opposite sign) are a `400` on `timeZone`. `null` is the documented way to clear `supportEmail`; an empty or blank text is tolerated and also clears it (the schema's `format: email` does not allow it, so a generated client that validates the format should send `null`).
- **Bounded wait for the row lock.** Every request that loads its row with an explicit lock (`PATCH /api/tickets/{number}`, `PATCH`, archive, restore and invite of a customer, `PATCH`, publish and unpublish of an article, `PATCH /api/organization`, changing the role of a member or removing one, and a public reply `POST /api/tickets/{number}/messages`, whose `UPDATE` of the last activity gets the same limit with an explicit `set local lock_timeout` because the hint does not apply to a bulk update) waits at most **3 seconds** for it (`jakarta.persistence.lock.timeout`, issued by Hibernate as `set local lock_timeout`). If another transaction still holds the row after that, the answer is `503 Service Unavailable` with `Retry-After: 1` and a Problem titled "Recurso ocupado". It is not a `409` (that means a business rule of the current state) nor a `412` (version): the request is valid, nothing was changed and the same request can simply be sent again. Only the lock timeout (SQLSTATE `55P03`) is a `503`: a deadlock (`40P01`) reaches the API as the same Spring exception, so the handler checks the SQLSTATE and a deadlock stays a `500`. It is checked at the point where the row is loaded, so for a ticket, customer or article it comes with the `404` (before the `428`, `400` and `412` checks). For `PATCH /api/organization` it comes after `428` and `400` and before `412`. A public reply answers it after the `404` and `400`, when it stamps the last activity. Changing the role of a member or removing one answers it for the member's row together with the `404`, before the `409` and the `400` of the body, because locking that row is the lookup itself; removing one can also answer it after the `409` checks, when it locks the member's open tickets; assigning a ticket (including `POST /api/tickets`) answers it when it resolves the assignee.
  The same limit applies to the assignee's membership, which `PATCH /api/tickets/{number}` (with `assigneeId`, or when it reopens a resolved ticket) and `POST /api/tickets` (with `assigneeId`) read with a shared lock while they hold the ticket row, and to the open tickets that removing a team member locks: all of them answer `503` too, and nothing is changed.
  Since #69 the waits that were listed here are bounded: the team advisory lock (invite, role change and removal answer 503, and so does the reinvitation of a removed member), the advisory lock that serializes article creation (`POST /api/knowledge/articles`), the ticket counter (`POST /api/tickets`), `PATCH /api/me` and the reinvitation of a removed portal access. The activation of an invitation is not bounded but **skipped**: it runs in the principal filter, which every operation goes through, so it selects the membership with `FOR NO KEY UPDATE SKIP LOCKED` (the lock the `UPDATE` itself takes, so a foreign key pointing at the row does not make it skip). If another transaction holds the row, the request resolves with the same role and the same `/me`, the membership stays `invited`, and the next request activates it. A removal that already committed still wins (401). The name adoption of the same filter skips a held account the same way. While the row is held, that request sees the member as still `invited`: views that list only active members (assignees, team metrics, reports) do not include them yet, and assigning a ticket to themselves in that request is a `400`. It never grants more access than before, and the next request shows them as active.
- Posting a message does **not** change the ticket version, so a reply never invalidates a parallel status change. A **public** message moves `updatedAt`, which means *last activity* and drives the inbox «Actualizado» column; internal notes do not, so customers cannot infer them from timestamps.
- `updatedAt` never moves backwards: a `PATCH` stamps `max(updatedAt, now)` and a public message stamps `greatest(updatedAt, now)`. A public reply that arrives while a `PATCH` holds the row waits a few milliseconds for it and then applies its own stamp, so the inbox order is not corrupted by clock differences between requests. The `PATCH` response body and `ETag` match the row as that `PATCH` committed it.

Guarantees covered by tests (real threads in `TicketConcurrencyTest`, a controlled clock in the rest):

- simultaneous creations in one organization get distinct, consecutive numbers;
- two simultaneous `PATCH`es with the same version yield exactly one `200` and one `412`, one new activity entry and the state of the `200`;
- a `PATCH` committed after a later reply keeps the later `updatedAt`;
- a public reply that arrives during a `PATCH` waits and its stamp prevails;
- a public reply keeps the version and `ETag` unchanged; an internal note leaves the ticket row untouched.

## Activity

Creating a ticket and changing its status, priority or assignee writes an activity entry with the actor, the previous and the new value, **in the same transaction** as the change: if either fails, both roll back. Entries are a typed union by `type`; assignee changes keep the member id and the name at the time of the change.

`GET /api/tickets/activity` is the **recent activity feed** of the whole organization: the latest `size` entries (1–50, default 10; anything else is a `400` on the field `size`) of every ticket's log, newest first (ties by id), as `{ ticketNumber, subject, activity }` where `activity` is the same union as above. It only reads the activity log, so internal notes and replies (which are messages, not activity) never appear and there is nothing to filter by role; customers get `403`. Because `activity` also matches `/tickets/{number}`, the rule that restricts it to staff sits before the one for ticket numbers (a test pins it: a customer gets `403`, not a `400` from the number parser).

## Metrics

`GET /api/tickets/metrics` describes the **whole organization**, not the active filters, so the numbers stay stable while the user filters the inbox. Days are computed in the organization's time zone.

| Field | Definition |
| --- | --- |
| `open` / `openedToday` | Tickets with status `open`; those of them created today |
| `inProgress` / `inProgressAssignedToMe` | Tickets `in_progress`; those assigned to the caller |
| `resolvedToday` / `resolvedYesterday` | Distinct tickets that entered `resolved` today and yesterday, from the activity log |
| `firstResponseMinutes` | Median minutes, rounded to the nearest integer, from creation to the first public agent message, over tickets created in the last 168 hours that have one; `null` when there are none |
| `firstResponseTargetMinutes` | Organization target (30 by default) |
| `views` | Counts for the inbox views: `all`, `mine`, `unassigned`, `resolved` |

### Where each figure on screen comes from

The Overview and Reports screens calculate nothing beyond the items marked **(client)**: every other number is shown as the server sends it. Comparisons are always an absolute difference first; a percentage is only added when the base is greater than zero and the result does not round to 0.

**Overview** (`GET /api/tickets/metrics`, `GET /api/reports/summary?period=7d`, `GET /api/tickets/activity` and `GET /api/tickets`):

| On screen | Source and definition |
| --- | --- |
| Tickets abiertos, "N nuevos hoy" | `open` and `openedToday`. Only tickets with status `open`: those `in_progress` are not counted |
| Resueltos hoy, "N más que ayer" | `resolvedToday` against `resolvedYesterday`, both from the activity log (distinct tickets that entered `resolved`, in the organization's calendar days). The difference and the percentage are computed **(client)** from those two integers |
| Primera respuesta, "Mediana de 7 días · Objetivo: N min" | `firstResponseMinutes` (median over the tickets **created** in the last 168 rolling hours that have a first response, **not** the calendar window of Reports; a ticket created earlier does not count even if it was answered inside that window) and `firstResponseTargetMinutes`, the value saved in Settings. "Sin datos" when `null` |
| Sin responsable | `views.unassigned`: tickets without an assignee whose status is not `resolved` (`waiting` ones count). The link opens the inbox on that view |
| Solicitudes · Últimos 7 días | `byDay[].created` of the 7-day report: tickets created per calendar day of the organization, today included. The alternative table lists the same seven values |
| Actividad reciente | The latest 5 entries of the activity feed (see [Activity](#activity)) |
| Necesitan atención | The first 5 tickets with status `open` or `in_progress`, sorted by priority, highest first (`sort=priority,desc`: ranked urgent, high, medium, low; not alphabetical); within the same priority the highest ticket number (the newest) comes first, always `t.number desc`, so a new urgent ticket is listed first |

**Reports** (`GET /api/reports/summary?period=7d|30d|90d`; the period lives in the URL as `?period=`):

| On screen | Source and definition |
| --- | --- |
| Solicitudes, "N más (P %) frente a los N días anteriores" | `created.value` against `created.previous` (the adjacent window of the same elapsed duration). The text is "N más (P %) frente a los N días anteriores" or "N menos (P %) …"; "Sin cambios frente a los N días anteriores" when equal; the "(P %)" is left out when the previous period had none or it rounds to 0. Difference and percentage **(client)**; the trend is neutral because more requests is neither good nor bad |
| Resueltos, "N resueltos por cada 100 creados" | `resolved.value` (distinct tickets that entered `resolved` in the period) divided by `created.value`, rounded, **(client)**; hidden when nothing was created. It can exceed 100 because the resolved tickets include some created before the period: it is a ratio, not a share of the created ones |
| Primera respuesta | `firstResponseMinutes`: median over the tickets created in the period that have a first public agent message, next to the organization's `target`; "Sin datos" when `null` |
| Resolución | `resolutionHours`: median hours from creation to the first time a ticket entered `resolved`, over the tickets created in the period that were ever resolved; "Sin datos" when `null` |
| Gráfico y tabla alternativa | `byDay`: created and resolved per calendar day. With 90 days the chart (and its table) groups **(client)** by week, adding the resolved of each day, so a week can add up to more than the period's `resolved.value` |
| Solicitudes por canal | `byChannel`: tickets created in the period per channel with its `share` (one decimal, adding up to exactly 100.0); channels without tickets are not listed |
| Agentes | `byAgent`: resolved, median first response and tickets assigned and still open now, per member; someone who left but worked in the period is listed with their status |
| Exportar CSV | The agents table of the period, generated in the browser **(client)**: RFC 4180 escaping, UTF-8 BOM, cells that could be read as formulas neutralized, disabled without rows |

Every "today" and every day boundary uses the organization's time zone, so changing it in Settings moves them; the client reads the Overview and Reports again after saving it.

## Endpoints

These are the endpoints proposed for the first delivery. `GET /api/me` is an addition: the UI needs it to show the current user and to implement «Asignados a mí».

| Method and path | Roles | Purpose |
| --- | --- | --- |
| `GET /api/me` | all | Current user, organization and role. `organization.demo` is `true` on the public demo installation (`resolve.demo.enabled`) |
| `GET /api/session/organizations` | all | Organizations where the caller has a usable membership, by name |
| `POST /api/session/organization` | all | Work in another of those organizations (`{ organizationId }`); `403` for any other, existing or not; answers the new `Me` |
| `POST /api/logout` | `oidc` profile | End the server session and answer `{ logoutUrl }` to end the provider's session too (`200`); needs the CSRF header |
| `PATCH /api/me` | all | Change your own display name (`name` is the only field); no `If-Match`: a resource with a single owner, last write wins |
| `GET /api/organization` | admin, agent | Settings of the organization (name, support email, time zone, first-response target) with `ETag` |
| `PATCH /api/organization` | admin | Edit the settings (`If-Match`); `403` for agents, before anything is read |
| `GET /api/tickets` | all | Inbox: views, filters, search, sorting and pagination |
| `GET /api/tickets/metrics` | admin, agent | Inbox metrics and view counts |
| `POST /api/tickets` | admin, agent | Create a ticket |
| `GET /api/tickets/{number}` | all | Ticket detail (with `ETag`) |
| `PATCH /api/tickets/{number}` | admin, agent | Change status, priority and/or assignee (`If-Match`) |
| `GET /api/tickets/{number}/messages` | all | Conversation; customers only receive `public` messages |
| `POST /api/tickets/{number}/messages` | admin, agent | Reply (`public`) or internal note (`internal`) |
| `GET /api/tickets/activity` | admin, agent | Latest activity of the whole organization, each with the number and subject of its ticket (`size` 1–50, default 10) |
| `GET /api/tickets/{number}/activity` | admin, agent | Activity log |
| `GET /api/customers` | admin, agent | Customer list and search: `q`, `company`, `archived`, sorting and pagination |
| `GET /api/customers/metrics` | admin, agent | Customer metrics of the whole organization |
| `GET /api/customers/companies` | admin, agent | Distinct company names, for the list filter |
| `POST /api/customers` | admin, agent | Create a customer (`201`, `Location`, `ETag`) |
| `GET /api/customers/{id}` | admin, agent | Customer detail (with `ETag`); archived customers can be read |
| `PATCH /api/customers/{id}` | admin, agent | Edit contact data and notes (`If-Match`); `409` when archived |
| `POST /api/customers/{id}/archive` | admin | Archive a customer; `409` when already archived |
| `POST /api/customers/{id}/restore` | admin | Restore a customer; `409` when not archived |
| `POST /api/customers/{id}/invite` | admin | Invite a customer to the portal (`201`, a `TeamMember` with role `customer`); `409` when archived or already with access |
| `GET /api/assignees` | admin, agent | Members who can be assigned (active admins and agents) |
| `GET /api/members` | admin, agent | The team in any status (including `removed`), by name, with the open tickets of each |
| `GET /api/members/metrics` | admin, agent | Team metrics of the whole organization |
| `POST /api/members` | admin | Invite an admin or agent (`201`); `400` on the field `email` when already a member or a customer |
| `POST /api/members/{userId}/role` | admin | Change the role (`admin` or `agent`); `409` for the last active admin or a removed member |
| `POST /api/members/{userId}/remove` | admin | Remove from the team; `409` for yourself, the last active admin or a removed member |
| `GET /api/reports/summary` | admin, agent | Report of a period (`7d`, `30d`, `90d`) with the previous period of the same duration |
| `GET /api/knowledge/categories` | all | Categories with the number of articles the caller can read |
| `POST /api/knowledge/categories` | admin | Create a category (`201`); `400` on the field `name` when its slug already exists |
| `GET /api/knowledge/articles` | all | Article list and search: `q`, `category`, `status`, sorting and pagination; customers only get published, public articles |
| `POST /api/knowledge/articles` | admin, agent | Create a draft (`201`, `Location`, `ETag`); `409` only if another writer took the slug first |
| `GET /api/knowledge/articles/{slug}` | all | Article with its Markdown body (with `ETag`); `404` for a customer when it is a draft or internal |
| `PATCH /api/knowledge/articles/{slug}` | admin, agent | Edit title, body, category, visibility and feedback (`If-Match`) |
| `POST /api/knowledge/articles/{slug}/publish` | admin, agent | Publish; `409` when already published |
| `POST /api/knowledge/articles/{slug}/unpublish` | admin, agent | Back to draft; `409` when already a draft |

### Ticket list filters

| Parameter | Values |
| --- | --- |
| `view` | `all` (default): every ticket. `mine`: assigned to the caller and not resolved. `unassigned`: no assignee and not resolved. `resolved`: status `resolved` |
| `status` | One or more statuses (repeat the parameter) |
| `priority` | One or more priorities |
| `assigneeId` | A member id, or `none` for unassigned tickets |
| `customerId` | Only the tickets of this customer (a uuid; an invalid value is a 400, an empty one is ignored). It combines with the caller's own scope, so a customer member asking for another customer, an id from another organization or an unknown id gets an empty page, never a 400 or 404 |
| `q` | Case-insensitive contains match on the subject and the customer name, email and company; a number, with or without `#`, matches the ticket number exactly |

Filters combine with `AND` (so `view=resolved&status=open` is empty); repeated values of one filter combine with `OR`.

### Customers

| Parameter | Values |
| --- | --- |
| `q` | Case-insensitive contains match on the name, email and company (at most 120 characters) |
| `company` | Exact company name, compared case-insensitively. A fragment or an unknown company gives an empty page, never an error |
| `archived` | `false` (default) lists active customers; `true` lists only archived ones. Any other value is a `400` |
| `sort` | `name` (default, `asc`), `createdAt` or `openTickets`, with `asc` or `desc` |

Every item carries `openTickets` (tickets whose status is not `resolved`) and `totalTickets`, so the list needs no per-row requests. `CustomerDetail` adds `notes` (at most 2 000 characters), `archivedAt`, `version` and `portalAccess` (`none` without a customer membership or when it was removed, `invited` until the person first signs in, `active` afterwards). `portalAccess` mirrors the membership status only: **while `archived` is `true` the portal access is suspended** (the member gets `401`) whatever `portalAccess` says, so consumers should treat an archived customer as suspended.

Rules for writes:

- `name` is required (at most 120 characters); `email` is required, must look like an email (at most 254) and is **unique per organization ignoring case, archived customers included**. A duplicate is a `400` on the field `email`, also when two creations or two edits race for the same address (the unique index decides and the loser gets the same `400`).
- `company` and `notes` are optional; blank text is stored as `null`. In a `PATCH`, `null` clears them, while `name` and `email` do not accept `null`.
- The organization is never part of the body: an `organizationId` is an unknown field and a `400`.

#### Customer metrics and companies

`GET /api/customers/metrics` describes the **active (non-archived) customers of the whole organization**, not the list filters. The month is the current month in the organization's time zone, so a customer created at 23:30 local time on the last day of a month belongs to that month even when it is already the next one in UTC.

| Field | Definition |
| --- | --- |
| `total` | Customers that are not archived |
| `companies` | Distinct non-empty company names among them, ignoring case |
| `withOpenTickets` | Customers with at least one ticket whose status is not `resolved` |
| `newThisMonth` | Customers created in the current month of the organization's time zone |

`GET /api/customers/companies` returns those company names as a plain array: once per name ignoring case (when only the case differs, the first in binary order wins, so capitals come first), alphabetical without regard to case, at most 200, and without empty values, archived customers or other organizations' companies. It feeds the company filter of the list.

#### Deletion and archiving

Customers are never deleted. **Archiving** (admin only) sets `archivedAt` and:

- hides the customer from lists, search, metrics and the new-ticket selector (`GET /api/customers?archived=true` lists the archived ones);
- keeps their tickets listed, readable and editable, and leaves `ticket.customer` as it was;
- rejects new tickets for them with the same `400` field error as an unknown customer;
- rejects edits with `409` ("Restaura el cliente antes de editarlo.") until they are restored;
- stops their portal access: a `customer` membership of an archived customer gets `401`.

**Restoring** (admin only) brings the customer back to every list and resumes portal access. Archiving an archived customer and restoring an active one are `409`.

### Team

`TeamMember.id` is the **user id**; `/members/{userId}/…` takes that id. The team is the organization's admins and agents: customers with portal access are not listed and, for these routes, answer `404` like any unknown id (as do users of another organization).

#### Invitations

There is no outgoing email. **Inviting** creates an `invited` membership bound to the email (and the user, when the email is new; an existing user keeps their name) and returns `201` with `invitedAt`. The person joins by signing in with that address, which activates the membership on their first request and sets `joinedAt`. Rules, all `400` on the field `email`:

- an email that belongs to a customer of the organization (also an archived one, ignoring case, or a `customer` membership) is rejected with "Este correo pertenece a un cliente.";
- an email that is already an `active` or `invited` member is rejected with "Ya forma parte del equipo.";
- an email whose membership was `removed` is invited again **on the same row**: it goes back to `invited` with the new role, `joinedAt` empty and a new `invitedAt`.

`name` is optional and defaults to the part of the email before the `@`.

#### Customer portal invitations

`POST /api/customers/{id}/invite` (admin only) creates the user when the customer's email is new and an `invited` `customer` membership linked to that customer, and answers `201` with the same `TeamMember` shape (`role` `customer`). Like a team invitation it sends no email: the customer gets access by signing in with the address on their record, which activates the membership. Afterwards `portalAccess` of the customer reads `invited`, then `active`.

- The customer must be active: inviting an archived customer is a `409` ("Restaura el cliente antes de invitarlo al portal."); restoring it first makes the invitation possible.
- A customer that already has an `invited` or `active` access is a `409`. A customer whose access was `removed` is invited again on the same membership.
- A `409` also when the email belongs to someone on the team ("Este correo ya pertenece al equipo.") or the user is already linked to another customer. An existing user (for example from another organization) keeps their name.
- The customer record is locked until the end of the transaction, so two simultaneous invitations (or an invitation and an archive) are evaluated one after the other.
- Removing a customer's portal access is not exposed yet; archiving the customer suspends it.

#### Roles and removal

Members are never deleted. **Removing** a member marks the membership `removed` (with its date) and, in the same transaction, unassigns their unresolved tickets with one `assignee_changed` activity per ticket whose actor is the admin; resolved tickets keep their assignee, and the history keeps the name at the time. A removed member leaves `/assignees` and the team metrics and gets `401`.

Rules, all `409` and leaving the membership untouched:

- removing yourself, even when there are other admins;
- removing the last **active** admin, or changing its role (an invited admin does not count as active);
- changing the role of, or removing, a member who is already `removed`.

A resolved ticket keeps its assignee even if that person is removed; **reopening** it (status out of `resolved`) unassigns an assignee who is no longer active staff (removed, or invited again and not signed in yet) in the same transaction, with an `assignee_changed` activity whose actor is the caller, unless the same `PATCH` brings a new valid assignee. A `PATCH` that merely resends the unchanged assignee is not revalidated, unless it also reopens the ticket.

A request already in flight from an admin who is demoted or removed meanwhile finishes with the authority it had when its principal was resolved; the last-admin rule is always evaluated on committed state.

Changing a role to the one the member already has is a no-op `200`. Error order: `403` (URL), `404`, `400` (body), `409`.

Role changes, removals and invitations of an organization are serialized with a per-organization advisory lock, so two admins who remove or demote each other at the same time cannot both succeed and leave the organization without an admin. Assigning a ticket takes a shared lock on the assignee's membership: a removal that races an assignment either waits and then unassigns that ticket, or finds the assignee already removed and the assignment is a `400`.

#### Team metrics

Computed per organization, independent of any list.

| Field | Definition |
| --- | --- |
| `staff` | Active admins and agents (invited and removed members do not count) |
| `assignedOpen` / `unassignedOpen` | Tickets whose status is not `resolved`, with and without an assignee |
| `averageLoad` | `assignedOpen / staff` with one decimal; `0` without staff |
| `firstResponseMinutes` | The same median as the ticket metrics (last 168 hours); `null` without data |
| `firstResponseTargetMinutes` | Organization target (30 by default) |

### Reports

`GET /api/reports/summary?period=7d|30d|90d` (default `7d`; admin and agent, a customer gets `403`) is computed on the server for the caller's organization, in the organization's time zone (`organizations.time_zone`, never the server's). A `period` that is none of the three values is a `400` on the field `period`; a blank one is the default.

**The window.** The period covers the last `days` calendar days of the organization, today included: it starts at 00:00 of `today - (days - 1)` in the organization's zone and ends at the moment of the request **truncated to a whole second** (`period.from`, `period.to`, in UTC; every instant in the report is a whole second; a ticket created in the fraction of a second before the request shows up in the next report, and a request in the last second of the local day still reports that day). All the figures of one report are read in a single read-only `REPEATABLE READ` transaction, so they describe the same state even if a ticket is created while the report is computed. The **previous period is the adjacent window of the same elapsed duration**, `[from - (to - from), from)`. It is measured in elapsed time, not in 24-hour days, so a period that contains a daylight-saving change still compares like with like; and since the current period ends "now", the previous one is not a longer, complete one. Bounds are inclusive at the start and, for the current period, at `to`; a ticket created after `to` counts in neither.

**Days.** `byDay` has one entry for each calendar day of the window (`days` entries, oldest first, `date` as `YYYY-MM-DD`), with zeros where nothing happened. A ticket belongs to the day on which its instant falls **in the organization's zone**: one created at 23:30 in `America/Mexico_City` counts on that day, not on the next UTC day. A day with a daylight-saving change lasts 23 or 25 hours and the repeated hour belongs to the same day; when midnight does not exist the day starts at the first instant that does. The tests cover the 25-hour days of `Europe/Madrid` on 2026-10-25 and `Australia/Sydney` on 2026-04-05, the 23-hour day of `Europe/Madrid` on 2026-03-29, a period that starts on a change day (`America/New_York`, 2026-03-08), the skipped midnight of `America/Santiago` on 2026-09-06 and `America/Mexico_City` (which has no daylight-saving time in 2026). The day series is built from dates, so the database session's zone plays no part.

| Field | Definition |
| --- | --- |
| `created` `value` / `previous` | Tickets with `created_at` in the period / in the previous period |
| `resolved` `value` / `previous` | **Distinct** tickets with a `status_changed` → `resolved` activity in the period / in the previous period. A ticket reopened and resolved again counts once |
| `firstResponseMinutes` | Median minutes (rounded) from creation to the first public agent message, over the tickets **created in the period** that have one; `null` without data. `target` is the organization's target. Internal notes are not responses |
| `resolutionHours` | Median hours (one decimal) from creation to the **first** time a ticket entered `resolved`, over the tickets created in the period that were ever resolved (also later than the period); `null` without data. Later reopenings do not move it |
| `byDay[]` | Per day: tickets created, and distinct tickets that entered `resolved` that day |
| `byChannel[]` | Channels with at least one ticket created in the period, most tickets first (ties by channel name); empty without data |
| `byAgent[]` | Per member, see below |

`byDay[].resolved` counts distinct tickets **per day**, while `resolved.value` counts them **per period**: a ticket resolved, reopened and resolved again on different days counts on each of those days and once in the period, so the days can add up to more than `resolved.value`. The same applies to `byAgent[].resolved`, which counts distinct tickets per person: a ticket resolved by one agent, reopened and resolved by another counts for both.

**Shares.** `byChannel[].share` is a percentage with one decimal and the shares add up to **exactly 100.0** (largest-remainder rounding: every channel gets its share rounded down to a tenth and the tenths left over go to the channels with the largest remainders; on a tie, to the one listed first). Rounding each share on its own could add up to 99.9 or 100.1.

**By agent.** One row per member, most resolved first, then by name and id:

- every **active** admin or agent, even with zeros, and anyone else (removed, or invited again) who **resolved tickets in the period or gave the first response to a ticket created in the period** (the same tickets their `firstResponseMinutes` is based on; answering an older ticket does not list them), so the work done by someone who left does not vanish from the report and the rows keep adding up. Someone who is not active and did neither in the period is not listed. Customers never appear;
- `status`: the membership status (`active`, `removed` or `invited`), so the interface can mark whoever left;
- `resolved`: distinct tickets the member moved to `resolved` in the period (the actor of the activity);
- `firstResponseMinutes`: the median of the tickets created in the period whose **first** public message is the member's; a later reply on a ticket someone else answered first does not count, nor does an internal note; `null` without data;
- `openAssigned`: tickets assigned to the member that are not `resolved`, as of now (removing a member unassigns their open tickets, so a removed member shows `0`).

Memberships are matched on the organization, so a user who belongs to two organizations only brings the work of the organization that asks.

### Knowledge base

Categories group articles; an article has one category, a Markdown `body`, a `status` (`draft` or `published`) and a `visibility` (`internal`: only the team, even when published; `public`: customers too, once published).

| Parameter of `GET /api/knowledge/articles` | Values |
| --- | --- |
| `q` | Case-insensitive contains match on the title, the body and the category name (at most 120 characters, counted as characters: an emoji is one). `%`, `_` and `\` are plain text |
| `category` | Slug of a category. An unknown slug gives an empty page, never an error |
| `status` | `draft` or `published`; anything else is a `400` |
| `sort` | `updatedAt` (default, `desc`) or `title`, with `asc` or `desc`. Titles compare ignoring case; ties are broken by `id` in the same direction |

The list returns `ArticleSummary` (no body). `Article` adds `body`, `allowFeedback`, `version`, `createdBy` and `updatedBy` (`MemberRef`). `allowFeedback` is not in the first sketch of the contract: the editor needs to read it to draw its switch; the ratings themselves are not part of this API.

**What a customer sees.** One rule, applied in the same place to the list, its total, the search, the detail and the category counts: published **and** public. A customer cannot widen it with filters (`status=draft` gives an empty page) or learn from search that a hidden article exists (`q` only matches what they can read). `GET /api/knowledge/categories` counts, for each category, the articles the caller can read, and a customer only receives the categories with at least one: the name of a category that only holds internal articles or drafts never reaches them. Unpublishing, or turning a published article `internal`, hides it from customers immediately.

**Writes.**

- `POST /api/knowledge/articles` always creates a `draft`. Required: `title` (at most 160 characters), `body` (at most 20 000 characters, counted in characters, not UTF-16 units), `categoryId` and `visibility`; `allowFeedback` defaults to `true`. A category of another organization is the same `400` on `categoryId` as an unknown one.
- The `body` is **plain Markdown text**: it is stored and returned exactly as received (leading and trailing whitespace included) and the API neither renders nor sanitizes it, so hostile content such as `<script>` or `javascript:` links is data, never markup. Clients render it with an element whitelist and must never insert it as HTML. It admits line breaks and tabs; other control characters, including the NUL that PostgreSQL cannot store, are a `400`. Titles and category names are single lines: any control character is a `400`.
- A value of the wrong type is an error of its field, not a failed request: a numeric `title` is a `400` on `title` ("Debe ser un texto."). No field accepts `null` except the `description` of a category.
- The **slug** is `Slugs.from(title)`: Unicode decomposed, accents removed, lowercase, every run of characters other than `a-z` and `0-9` becomes a hyphen, cut to 100 characters without a trailing hyphen; a title with no letters or digits (`¿?`, an emoji) uses `articulo`. The slugs `nuevo` and `editar` are **reserved** for the routes of the interface (`/conocimiento/nuevo` opens the editor, so an article with that slug could never be opened): they are treated as taken, so the title «Nuevo» gets `nuevo-2`. If the slug already exists in the organization the first free suffix is used (`-2`, `-3`…), so a title that already looks like a suffixed slug ("Factura 2") takes that slug and the next "Factura" skips to `factura-3`. Two creations at the same time never get the same slug: each takes a per-organization transaction lock (`pg_advisory_xact_lock`) before reading the taken slugs and keeps it until it commits; the unique constraint `(organization_id, slug)` stays as a safety net, and a writer that bypassed the lock would get a `409` («Otro artículo acaba de tomar ese título; vuelve a intentarlo.») instead of a server error. A category slug comes from its name (at most 80 characters) with no suffix: a name whose slug already exists is a `400` on `name`.
- `PATCH` uses JSON Merge Patch semantics with the fields of the creation, all optional and none nullable. `status` and `slug` cannot be patched (a `400`, "Campo no permitido."): the status changes with `publish` and `unpublish`. It requires `If-Match` and returns the new `ETag`. A patch whose values equal the current ones answers `200` without a new version and without changing `updatedAt` or `updatedBy`. Errors are checked in this order: 401, 403, 404, 428, 400, 412.
- `publish` and `unpublish` take no `If-Match`; like the other state transitions they lock the row and read the committed state, so two simultaneous publications give one `200` and one `409`, never a `412`. Publishing sets `publishedAt` to now and unpublishing clears it, so `publishedAt` is the date of the **last** publication. They bump the version.
- `updatedAt` and `updatedBy` change on every real edit, `publish` and `unpublish`; `createdBy` and `createdAt` never do.

### Partial updates

`PATCH` uses JSON Merge Patch semantics (`application/merge-patch+json`): a field that is **absent** is left unchanged, and `"assigneeId": null` **unassigns** the ticket. `status` and `priority` cannot be `null`.

### Ticket and message bodies

`POST /api/tickets` and `POST /api/tickets/{number}/messages` check the type of every field on the parsed JSON, like the customers and knowledge APIs, instead of letting the deserializer convert it: `{"subject": 123}` is a `400` on `subject` ("Debe ser un texto."), never a ticket titled `"123"`. Rules:

- The body must be a JSON object, and unknown fields (an `organizationId`, an `authorId`) are a `400` that names the field ("Campo no permitido.").
- Text fields must be JSON strings. `null` is only accepted for `assigneeId` (as the schema says); in `subject`, `description`, `body`, `priority`, `channel` and `visibility` it is a `400` ("No admite null."). Omit `priority` and `channel` to get `medium` and `web`.
- A `subject` admits no control character; `description` and message `body` admit line breaks and tabs but no other control character, which includes the NUL that PostgreSQL cannot store. All of them are a `400` on the field ("No admite caracteres de control.").
- Every invalid field is reported in one response.

### Ticket description

The `description` belongs to the ticket and is shown above the conversation; it is not returned as a message.

## Demo data

Demo organizations, users, customers and tickets live in a Flyway location (`db/demo`) that only the `dev` profile loads, with its own version range, so they never reach other environments. The demo knowledge base of Acme Studio (three categories, four articles, taken from the design) has one draft, «Configurar notificaciones»: the demo customer María Pérez can read the other three, and the team reads all four.

## Contract modelling notes

- `CustomerDetail` repeats the fields of `CustomerSummary` instead of composing it with `allOf`: with `additionalProperties: false` on every branch, a JSON Schema validator treats the fields of the other branch as unexpected and rejects every valid response (checked with the response validator of the tests). `openapi-typescript` accepts the `allOf` form, but the contract has to hold for both tools.
- `Article` repeats the fields of `ArticleSummary` for the same reason; `CategoryRef` is the reference embedded in both.
- The `Customer` schema (id, name, email, company) is the reference embedded in tickets; `CustomerSummary` and `CustomerDetail` are the resources of `/customers`.

## How the contract is enforced

Three checks keep the backend, the frontend and [`openapi.yaml`](openapi.yaml) in step. All of them run in CI on every pull request and on `main`.

1. **Every response is validated.** API tests call `.andExpect(matchesContract("<operationId>"))` (`backend/src/test/java/com/resolve/api/support/OpenApiContract.java`). The status must be declared by that operation, and the body must match its schema for the returned media type. Response schemas reject extra properties, so an exposed entity field or an internal note fails the test. The exception is `Problem`, which RFC 9457 leaves open to extension members: only its `errors` items are closed, so an extra member in an error response passes. A response without declared content must have an empty body.
2. **Every operation is covered.** `ContractCoverageListener`, a JUnit `LauncherSessionListener` in the same package, fails `./mvnw -B verify` when an operation in the contract was never validated by `matchesContract`, and lists the missing `operationId`s. It only checks coverage when the run includes every concrete subclass of `ApiIntegrationTest`: a partial run such as `./mvnw -B -Dtest=MembershipsApiTest test` passes and prints `Cobertura del contrato: no comprobada (faltan N clases de API: …)`, and a full run that passes prints a `Cobertura del contrato: …` line with the number of validated operations. Because a subclass that never runs would keep the check inactive, every run fails when a concrete subclass of `ApiIntegrationTest` declares no test method that Jupiter can run (Jupiter skips `private`, `static` and `abstract` methods, and `@Test` or `@TestTemplate` methods that do not return `void`) or has a name outside Surefire's default includes (`Test*`, `*Test`, `*Tests`, `*TestCase`; nested classes are excluded), and the error names the class and the reason.
3. **Frontend types are generated from the contract.** `npm run api:types` regenerates `frontend/src/api/schema.ts` with `openapi-typescript`. CI runs it and fails on `git diff --exit-code src/api/schema.ts` when the committed types are out of date. The frontend API client compiles against these types.

What these checks do not cover:

- Coverage is counted per operation, not per declared response: an operation counts once any of its statuses is validated.
- Request bodies and parameters are not validated against the contract by these tests. Their rules (validation errors, `If-Match`, sorting and paging limits) are covered by the behaviour tests.
- The coverage check runs within one test JVM. If Surefire is configured to split the tests across several forks (`forkCount` greater than 1), or a tag filter leaves out an API test class, no run sees the whole suite and the check stays inactive, with the `no comprobada` line as the only signal. Today the default single reused fork is used and there are no tags.
- Partial runs fail too while a new API test class has no test yet, for example in the first step of TDD. Add the first test or make the class `abstract` to run the others.
- The runnable-class check mirrors Surefire's default includes. If the `pom.xml` configures other includes (or an `*IT` suite run by Failsafe), `ContractCoverageListener` has to be updated to match.
