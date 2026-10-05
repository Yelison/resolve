# Resolve

A customer-support platform (tickets, customers, team, reports and a knowledge base) built from a complete Figma design, with a focus on accessibility, responsive behaviour and a shared component library. The interface is in Spanish.

[![CI](https://github.com/Yelison/resolve/actions/workflows/ci.yml/badge.svg)](https://github.com/Yelison/resolve/actions/workflows/ci.yml)

> **Status:** work in progress. The design system, the shared components (internally called **Forma UI**), the application shell and the **Overview**, **Tickets**, **Customers** and **Team** areas (views and Spring Boot API) are done. The API for reports, the recent-activity feed and the knowledge base exists too, but their views (Reports, Knowledge base) and settings come next; until then each one says so instead of showing fake screens.

| Ticket inbox | Ticket detail (dark) |
| --- | --- |
| ![Ticket inbox with metrics, views, filters and the ticket table](docs/screenshots/tickets-inbox.png) | ![Ticket detail with conversation, internal note and editable fields](docs/screenshots/ticket-detail-dark.png) |

| Customers | Customer detail (dark) |
| --- | --- |
| ![Customers list with metrics, filters and the table](docs/screenshots/customers.png) | ![Customer detail with profile, care context and the customer's tickets](docs/screenshots/customer-detail-dark.png) |

| Team |
| --- |
| ![Team with metrics, the permissions notice and the table with a pending invitation](docs/screenshots/team.png) |

| Component catalog (`/catalogo`) | Mobile drawer (dark) |
| --- | --- |
| ![Forma UI catalog](docs/screenshots/catalog-light.png) | ![Mobile navigation drawer in dark mode](docs/screenshots/drawer-mobile.png) |

| Ticket table adapting to its container, from the catalog (dark) |
| --- |
| ![Ticket table as cards, priority columns and full table](docs/screenshots/tickets-dark.png) |

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript (strict), Vite 8 |
| Server state | TanStack Query |
| Routing | React Router 7 |
| UI | Forma UI: in-house components in `frontend/src/components/ui`, CSS Modules and design tokens |
| Backend | Java 25, Spring Boot 4, Spring Data JPA, Flyway |
| Database | PostgreSQL 17 |
| Quality | Vitest + Testing Library, Playwright, oxlint, Prettier, GitHub Actions, Dependabot |

## Highlights

- **Contract-first API.** [`docs/api/openapi.yaml`](docs/api/openapi.yaml) is the single source of truth: the backend integration tests validate every response against it (extra fields fail, so entities or internal notes cannot leak) and the frontend generates its TypeScript types and typed client from it. The decisions behind it are in [`docs/api/README.md`](docs/api/README.md).
- **Multi-organization by construction.** The organization always comes from the authenticated principal; composite foreign keys keep every reference inside one organization, foreign ids look exactly like missing ones, and customers only see their own tickets and public messages.
- **Safe concurrent edits.** Tickets carry an `ETag`; updates are merge-patches with `If-Match`, so a stale edit gets `412` and the UI reloads instead of overwriting someone else's change. Each change and its activity entry are written in the same transaction.
- **Design tokens from Figma, not by hand.** Colors (light and dark), spacing and type styles are generated from the Figma variables into [`tokens.css`](frontend/src/styles/tokens.css), and the 23 icons into typed path data, by an export tool that runs inside Figma (kept outside this repository). Dark mode is a pure token swap that follows `prefers-color-scheme` unless the user picks a theme, and an inline script applies the choice before the first paint.
- **Accessible by construction.** Components follow the WAI-ARIA Authoring Practices: menu button, tabs, toolbar, dialogs on native `<dialog>` (focus trap, Escape, focus return), tooltips that also appear on focus and can be dismissed (WCAG 1.4.13), labelled fields with announced errors, 44 px touch targets on small screens, a skip link and `prefers-reduced-motion`.
- **Responsive by content, not by device.** Two breakpoints (768 and 1200 px) drive the shell: a drawer on mobile, an icon sidebar on tablets and a collapsible sidebar on desktop. The customer and team tables share one layout built on container queries: cards in narrow containers, priority columns from 768 to 1199 px and the full table from 1200 px. The ticket table has its own container-query layout and is not guaranteed to behave the same at every width (at 1024 px it already shows all its columns).
- **Honest UI.** No fake success states: actions without a backend say they are not connected yet, and demo data is labelled as such.
- **Tested.** 441 unit and component tests with coverage thresholds; 283 backend tests, most of them integration tests on PostgreSQL (Testcontainers), covering organization isolation, permissions, internal notes, filters, pagination, validation, update conflicts, metrics, transactional rollback and concurrency with real threads (ticket numbering, racing edits and replies), with a check that fails the build when an operation of the contract has no validated response; and 225 Playwright tests (mocked API) for the ticket, customer and team flows, table layouts at 390, 1024, 1200 and 1440 px, drawer focus, the persisted sidebar and horizontal overflow at 320–1440 px (including the 767/768 and 1199/1200 edges) in both themes, plus 3 full-stack smoke scenarios against the real API.

## Project structure

```
docs/api/           # API decisions and the OpenAPI 3.1 contract
docs/decisions/     # Architecture decision records (Forma UI extraction criteria)
docs/deploy/        # Operations runbooks: backups, restore, rollback, secret rotation, health
docs/development/   # How to work on several tasks in parallel with Herdr
frontend/
  src/
    api/            # Types generated from the contract and the typed client
    app/            # Shell, routes, pages, theme and the /catalogo route
    components/ui/  # Forma UI: one folder per component (tsx, module.css, tests)
    features/       # Product features (tickets, customers, team, session): pages, queries and their tests
    domain/         # Domain types, re-exported from the generated contract types
    lib/            # Small helpers (positioning, formatting, scroll lock, mutation errors, focus…)
    styles/         # Generated tokens and global styles
  e2e/              # Playwright specs with a contract-typed mock API
backend/
  src/main/java/com/resolve/api/
    common/         # Shared infrastructure only: errors, security, paging, persistence, time
    organizations/ memberships/ customers/ tickets/   # One package per feature
  src/main/resources/db/migration  # Flyway schema; db/demo holds dev-only demo data
docker-compose.yml  # PostgreSQL for local development
```

## Getting started

Requirements: Node 22.12+, Java 25 and Docker (for PostgreSQL and the backend tests).

```sh
# Frontend
cd frontend
npm ci
npm run dev            # http://localhost:5173 (component catalog at /catalogo)

# Database and API
docker compose up -d   # from the repository root; POSTGRES_PORT=5433 if 5432 is taken
cd backend
SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run   # http://localhost:8080/api, proxied by Vite at /api
```

The API reads `DATABASE_URL`, `DATABASE_USERNAME` and `DATABASE_PASSWORD`, with defaults that match `docker-compose.yml` (development only). There is no authentication provider yet: the `dev` profile loads demo data and a demo login (the `X-Demo-User` header, defaulting to the demo admin), and any other profile answers `401`. See the [API contract](docs/api/README.md).

To try other roles in development, call `setDemoUser` from the browser console, for example for the customer María Pérez: `setDemoUser('maria.perez@cliente.example')` (agents: `laura.mendez@acme.example`; `setDemoUser(null)` goes back to the admin). It replaces setting `resolve-demo-user` in `localStorage` by hand and also empties the query cache so data from the previous user never shows; reload the page to load the new session.

### Frontend scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `preview` | Develop, build and serve the production build |
| `npm test` / `test:watch` / `coverage` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Playwright against a production build and a mocked API |
| `SMOKE=1 npx playwright test --project=smoke` | Full-stack smoke test against the real API (see below) |
| `npm run lint` / `typecheck` / `format:check` | oxlint, `tsc -b` and Prettier |
| `npm run api:types` | Regenerate `src/api/schema.ts` from `docs/api/openapi.yaml` (CI fails if it is stale) |

### Full-stack smoke test

`frontend/e2e-smoke/` holds three Playwright scenarios with nothing mocked: an agent creates a ticket, finds it in the inbox, replies, leaves an internal note and changes the status, and then the customer opens the ticket and sees only the public reply; an admin creates a customer and uses it in a new ticket; and an admin invites an agent, sees the invitation as pending and then active once the invited person signs in. CI runs them in the `Full-stack smoke` job against PostgreSQL and the `dev` API. To run it locally, start PostgreSQL and the API with the `dev` profile as above (port 8080, or set `API_PROXY_TARGET`), then:

```sh
cd frontend
SMOKE=1 npx playwright test --project=smoke   # PLAYWRIGHT_PORT=4182 if 4173 is taken
```

`SMOKE=1` builds the frontend with `vite build --mode smoke`, which keeps the demo login so the test can act as different users. Only the dev server and the `smoke` build include it; every other mode, `production` among them, drops it: the `X-Demo-User` header, its storage key and `setDemoUser` are absent from `dist/assets/*.js`. Without `SMOKE=1` the `smoke` project does not exist, so `npm run test:e2e` is unchanged.

## Design decisions

The Figma frames are the visual reference. Where they conflict with the written responsive and accessibility rules, the rules win:

- **Touch targets:** buttons and fields keep the 42/40 px Figma height on desktop and grow to 44 px below 768 px; icon buttons are always 44 px.
- **Focus:** a shared 2 px outside focus ring replaces the 2 px inside stroke of the Figma focus variants, so focusing never shifts layout.
- **Navigation:** nav items fill the sidebar width (Figma hugs the label); the mobile header is 56 px (64 in the frame); the drawer can be up to 280 px wide and has *Cerrar menú* (close) instead of *Colapsar menú* (collapse).
- **Panels:** dialogs use the 12 px panel radius; the large avatar is 48 × 48 (21 × 48 in the frame).
- **Editor:** the toolbar applies Markdown, so underline is left out.
- **Tickets scope:** tags, attachments, SLA, customer notifications, deleting and bulk actions are not in the API yet, so the UI leaves them out (no inert controls); the inbox has no selection checkboxes until bulk actions exist.
- **Text-only placeholders** in Figma (pagination, breadcrumb, editor toolbar, search) are implemented as real, keyboard-operable controls.
- **Cards without data (D-02).** Figma metrics that have no data or definition in the model are replaced rather than invented: Customers shows «Nuevos este mes» instead of «Satisfacción» and omits «Plan Pro»; Team omits «Disponibilidad» and shows «Primera respuesta» instead of «Respuesta media». Customers also has no «Actividad» tab yet (only «Tickets» and «Notas»).
- **Invitations (D-08).** Inviting someone creates an `invited` membership for that email, which becomes `active` the first time that person signs in. No email is sent yet, and the dialog says so ("todavía no enviamos correos de invitación") instead of promising one. It stays compatible with an identity provider that verifies the email.
- **Permissions, summarized.** The server decides; the interface only hides what would be a `403`. A *customer* reads their own tickets and public messages and nothing else.

  | | Admin | Agent | Customer |
  | --- | --- | --- | --- |
  | Tickets: read, create, update, reply, notes | ✓ | ✓ | own tickets and public messages only |
  | Customers: list, profile, create, edit | ✓ | ✓ | 403 |
  | Archive, restore and invite a customer to the portal | ✓ | 403 | 403 |
  | Team and its metrics: read | ✓ | ✓ | 403 |
  | Invite, change role, remove a member | ✓ | 403 | 403 |
  | Reports and the activity feed | ✓ | ✓ | 403 |

- **Tables stay feature-local, except for their shared layout (D-05).** `CustomersTable` and `TeamTable` were compared with each other (`TicketTable` was not measured against them): the container grid, the hidden header, the card with hover, the actions cell, the «Mostrando N resultados» caption, the mid-range rules and the ARIA scaffolding were duplicated line by line (123 identical non-blank lines of CSS between the two files, well over the 40-line threshold, plus the table markup), so they moved to `components/ui/Table`, shown in the catalog. Columns, cells and the grid areas of each range stay in each feature; no sorting, selection or virtualization was added. `TicketTable` is left as it is: it also owns row selection and its own container, and migrating it is outside this change.
- **Full table from 1200 px.** The table container measures about 894 px at a 1200 px viewport (240 px sidebar) and about 898 px at 1024 px (76 px sidebar), so no container threshold alone can show the full table from 1200 px and still keep priority columns below it. The customer and team tables therefore show the full table only when the viewport is at least 1200 px (the project's own breakpoint) and their container is at least 860 px, with the sidebar expanded or collapsed; from 768 to 1199 px they keep priority columns.
- **Focus after a dialog.** If a `403` hides the actions that opened a dialog, closing it moves focus to the page title instead of letting it fall to the page body. After a member is removed successfully, the row leaves the active filter a moment after the dialog closes, so focus goes to the page title unconditionally.

## Roadmap

- [x] Design tokens, icons and theming
- [x] Forma UI components with tests and a living catalog
- [x] Application shell: sidebar, topbar, mobile drawer
- [x] API contract (OpenAPI) with generated frontend types
- [x] Tickets: Spring Boot API with organization scoping, concurrency control and activity log
- [x] Tickets: inbox, detail and new ticket views wired with TanStack Query
- [x] Full-stack end-to-end smoke test against the real API in CI
- [x] Customers: API, list, detail, create, edit, archive and portal invitation
- [x] Team: API, list, invitation, roles and removal
- [x] Shared table layout in Forma UI
- [x] Reports API and recent-activity feed
- [x] Knowledge base API
- [x] Overview view
- [ ] Reports view
- [ ] Knowledge base views and settings (company, profile, appearance and permissions)
- [ ] Authentication provider replacing the dev-only demo login
- [ ] Tags, attachments and SLA for tickets

## License

The code written for this project is released under the [MIT License](LICENSE), © 2026 Yelison Ortiz.

Third-party software keeps its own license and attribution:

- npm and Maven dependencies are distributed under their respective licenses, listed in each package.
- The Inter typeface is bundled through [Fontsource](https://fontsource.org/fonts/inter) under the [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt), © The Inter Project Authors.
- The Maven Wrapper scripts (`backend/mvnw`, `backend/mvnw.cmd`) are licensed under the Apache License 2.0, as stated in their headers.
