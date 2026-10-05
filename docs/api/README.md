# Resolve API contracts

This document fixes the decisions behind the Resolve API. The machine-readable contract is [`openapi.yaml`](openapi.yaml): the backend validates its responses against it in tests and the frontend generates its types from it, so it is the single source of truth.

## Scope of the first delivery

| In scope | Out of scope (documented, not exposed in the UI yet) |
| --- | --- |
| Ticket inbox with views, filters, search, sorting and pagination | Tags, attachments and file storage |
| Ticket detail: conversation, internal notes, activity | SLA targets and SLA compliance |
| Create ticket, change status, priority and assignee | Customer notifications by email |
| Customer search and assignee list for forms | Deleting tickets and bulk actions |
| Inbox metrics and view counts | Authentication provider (see below) |

## Organizations, users and roles

- Every request runs in the context of **one organization**, taken from the authenticated principal. The API never accepts an organization id from the client, and every query and mutation is scoped to that organization.
- A **user** belongs to an organization through a **membership** with one role:

| Role | Tickets | Messages | Activity, metrics, customers, assignees |
| --- | --- | --- | --- |
| `admin` | Read all, create, update | Read all, post `public` and `internal` | Yes |
| `agent` | Read all, create, update | Read all, post `public` and `internal` | Yes |
| `customer` | Read only the tickets of their own customer record | Read only `public` messages | No (403) |

- A `customer` membership is linked to a **customer** record of the same organization. Customers are read-only in this delivery: every write returns `403`.
- **Internal notes never reach customers.** The filter is applied in the database query, and no field visible to customers is derived from internal notes.
- Resources show other members as `{ id, name }` (`MemberRef`); contact data is only in `GET /api/me` and `GET /api/assignees`, which customers cannot call.

### Authentication

There is no authentication provider yet. The security layer resolves the principal from a pluggable source:

- Profiles `dev` and `test` enable a **demo principal resolver** (declared in the contract as the optional `X-Demo-User` security scheme): the `X-Demo-User` header selects a seeded user by email; without the header, `dev` falls back to the demo administrator and `test` rejects the request.
- Any other profile (including the default and production) has no resolver, so every API call returns `401`. A test guards this.

## Identifiers

- Internal identifiers are UUIDs. Tickets also have a visible `number` that is unique **within the organization** (two organizations each have a ticket #1).
- Numbers come from a per-organization counter row locked during the insert, never from `max(number) + 1`.
- Ticket routes use the number: `/api/tickets/{number}`. A number that does not exist in the caller's organization, or a ticket that belongs to another customer, returns `404` (never `403`, so existence is not leaked). The role check runs before the lookup, so a `customer` that attempts a write always gets `403`, whatever the number.

## Wire format

- JSON with `camelCase` fields, ISO 8601 timestamps in UTC (`2026-10-04T10:12:00Z`).
- Enumerations are lowercase `snake_case` and match the frontend exactly:
  - `status`: `open`, `in_progress`, `waiting`, `resolved`
  - `priority`: `urgent`, `high`, `medium`, `low`
  - `visibility`: `public`, `internal`
  - `channel`: `email`, `chat`, `phone`, `web`
  - `role`: `admin`, `agent`, `customer`
- Errors use **Problem Details** (RFC 9457, `application/problem+json`). Validation errors add `errors: [{ field, message }]`.

| Status | When |
| --- | --- |
| 400 | Malformed request, invalid path number, invalid query parameter (unknown sort field, size over 100) or validation error |
| 401 | No authenticated principal |
| 403 | The role does not allow the action |
| 404 | Resource not found in the caller's scope |
| 412 | `If-Match` does not match the current ticket version |
| 428 | `If-Match` is missing on a ticket update |

### References to other records

`customerId` and `assigneeId` in requests must belong to the caller's organization, and the assignee must be an admin or agent. Unknown and foreign ids get the **same** `400` field error, so the API never reveals data of other organizations.

## Pagination and sorting

- `page` starts at **0**; `size` defaults to **20** and must be between 1 and 100 (otherwise `400`).
- Responses use the envelope `{ items, page, size, totalItems, totalPages }`.
- `sort` is `field,direction` (for example `updatedAt,desc`). Only whitelisted fields are accepted; any other field returns `400`.
  - Tickets: `updatedAt` (default, `desc`), `createdAt`, `number`, `priority`, `status`. `priority` and `status` sort by rank (urgent → low; open → in_progress → waiting → resolved), not alphabetically. Ties are broken by `number desc`.
  - Customers: `name` (default, `asc`), compared case-insensitively. Ties are broken by `id asc`.
- A page past the last one returns `200` with no items; `totalPages` is `0` when nothing matches.
- Messages and activity are not paginated.
- The frontend shows 1-based page numbers and converts at the API client.

## Concurrency

- Tickets expose a `version` and an `ETag: "<version>"` header.
- `PATCH /api/tickets/{number}` requires `If-Match: "<version>"`, a single strong validator (weak validators, lists and `*` are rejected with `400`):
  - a different version returns `412` and the client reloads the ticket before retrying;
  - a missing header returns `428`.
- `PATCH` loads the ticket with a row lock (`PESSIMISTIC_WRITE`, which Hibernate issues as `SELECT … FOR NO KEY UPDATE` on PostgreSQL) and compares the client's version with the stored one inside the same transaction. Two simultaneous patches with the same version are serialized: the second waits for the first to commit, reads the new version and gets the explicit `412`. JPA optimistic locking (`WHERE version = ?`) stays as a safety net for any other writer. That lock does not conflict with the `FOR KEY SHARE` taken by the `INSERT` of a message: an internal note never waits for a `PATCH`, and a public reply only waits at its `UPDATE` of the ticket.
- A patch that changes nothing returns `200` without a new version or activity entry.
- Errors are checked in this order: `401`, `403`, `404`, `428`, `400`, `412`.
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

## Endpoints

These are the endpoints proposed for the first delivery. `GET /api/me` is an addition: the UI needs it to show the current user and to implement «Asignados a mí».

| Method and path | Roles | Purpose |
| --- | --- | --- |
| `GET /api/me` | all | Current user, organization and role |
| `GET /api/tickets` | all | Inbox: views, filters, search, sorting and pagination |
| `GET /api/tickets/metrics` | admin, agent | Inbox metrics and view counts |
| `POST /api/tickets` | admin, agent | Create a ticket |
| `GET /api/tickets/{number}` | all | Ticket detail (with `ETag`) |
| `PATCH /api/tickets/{number}` | admin, agent | Change status, priority and/or assignee (`If-Match`) |
| `GET /api/tickets/{number}/messages` | all | Conversation; customers only receive `public` messages |
| `POST /api/tickets/{number}/messages` | admin, agent | Reply (`public`) or internal note (`internal`) |
| `GET /api/tickets/{number}/activity` | admin, agent | Activity log |
| `GET /api/customers` | admin, agent | Paginated customer search for forms |
| `GET /api/assignees` | admin, agent | Members who can be assigned (admins and agents) |

### Ticket list filters

| Parameter | Values |
| --- | --- |
| `view` | `all` (default): every ticket. `mine`: assigned to the caller and not resolved. `unassigned`: no assignee and not resolved. `resolved`: status `resolved` |
| `status` | One or more statuses (repeat the parameter) |
| `priority` | One or more priorities |
| `assigneeId` | A member id, or `none` for unassigned tickets |
| `q` | Case-insensitive contains match on the subject and the customer name, email and company; a number, with or without `#`, matches the ticket number exactly |

Filters combine with `AND` (so `view=resolved&status=open` is empty); repeated values of one filter combine with `OR`.

### Partial updates

`PATCH` uses JSON Merge Patch semantics (`application/merge-patch+json`): a field that is **absent** is left unchanged, and `"assigneeId": null` **unassigns** the ticket. `status` and `priority` cannot be `null`.

### Ticket description

The `description` belongs to the ticket and is shown above the conversation; it is not returned as a message.

## Demo data

Demo organizations, users, customers and tickets live in a Flyway location (`db/demo`) that only the `dev` profile loads, with its own version range, so they never reach other environments.

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
