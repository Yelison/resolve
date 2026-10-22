# Development guide

Everything needed to run, test and understand Resolve locally. The [README](../../README.md) has the overview; the API is in the [contract](../api/README.md), deployment in [docs/deploy](../deploy/README.md) and the design choices in [Design decisions](../design-decisions.md).

- [Getting started](#getting-started)
- [Sign in locally](#sign-in-locally)
- [Frontend scripts](#frontend-scripts)
- [Full-stack smoke test](#full-stack-smoke-test)
- [Authentication](#authentication)
- [Static demo](#static-demo)
- [Forma UI](#forma-ui)
- [Project structure](#project-structure)
- [Engineering highlights in detail](#engineering-highlights-in-detail)

## Getting started

Requirements: Node 22.22.2+ (or 24.15+), Java 25 and Docker (for PostgreSQL, Keycloak and the backend tests).

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

To run the web app and the API as one process on one origin (what a deployment does), build the frontend, copy it into the backend's static resources and package without `clean`:

```sh
cd frontend && npm run build
mkdir -p ../backend/target/classes/static && cp -r dist/. ../backend/target/classes/static/
cd ../backend && ./mvnw -B -DskipTests package && SPRING_PROFILES_ACTIVE=dev java -jar target/*.jar   # app at http://localhost:8080/, API at /api
```

Any path that is not a file and does not start with `api/` or `actuator/` answers `index.html`, so reloading `/tickets/1047` works; `/assets/**` (hashed files) is cached for a year and `index.html` is never cached. `frontend/dist` is not committed. During development nothing changes: Vite serves the app and proxies `/api`.

The API reads `DATABASE_URL`, `DATABASE_USERNAME` and `DATABASE_PASSWORD`, with defaults that match `docker-compose.yml` (development only). The `dev` profile alone loads demo data and a demo login (the `X-Demo-User` header, defaulting to the demo admin); adding `oidc` turns on real sign-in against the local Keycloak (see [Sign in locally](#sign-in-locally)), and any profile without either answers `401`. See the [API contract](../api/README.md).

To try other roles in development, call `setDemoUser` from the browser console, for example for the customer María Pérez: `setDemoUser('maria.perez@cliente.example')` (agents: `laura.mendez@acme.example`; `setDemoUser(null)` goes back to the admin). It replaces setting `resolve-demo-user` in `localStorage` by hand and also empties the query cache so data from the previous user never shows; reload the page to load the new session. The same switch is in the account menu (top right, «Cambiar usuario de demostración») and, when the API answers `401`, on the `/entrar` page; both exist only in the dev server and the `smoke` build, never in `production`.
## Sign in locally

`docker compose up -d` also starts a local [Keycloak](https://www.keycloak.org/) (image `quay.io/keycloak/keycloak:26.7.5`, pinned to the last patch of the 26.7 series when this was written; never `latest`) that imports the realm in [`deploy/keycloak/resolve-realm.json`](../../deploy/keycloak/resolve-realm.json). It is the identity provider of the backend's `oidc` profile and it is for local development only.

```sh
docker compose up -d keycloak   # KEYCLOAK_PORT=8182 if 8180 is taken
curl http://localhost:8180/realms/resolve/.well-known/openid-configuration

# Backend as an OpenID Connect BFF with the demo data (dev) and Keycloak (oidc)
cd backend
SPRING_PROFILES_ACTIVE=dev,oidc ./mvnw spring-boot:run   # RESOLVE_OIDC_ISSUER=http://localhost:8182/realms/resolve with another KEYCLOAK_PORT
```

Then open `http://localhost:8080/api/oauth2/authorization/resolve` in a browser, sign in as `laura.mendez@acme.example` / `demo` and call `/api/me`. With `oidc` the demo login (`X-Demo-User`) is off even next to `dev`; the session is an `HttpOnly` cookie and every `POST`, `PATCH` and `DELETE` must send the `XSRF-TOKEN` cookie's value in `X-XSRF-TOKEN`. `POST /api/logout` ends the session and answers `{ "logoutUrl": … }`; navigating there also ends Keycloak's session, so the next sign-in asks for the password again. The API contract has the details: [Authentication](../api/README.md#authentication).

- **Frontend.** With `oidc`, open the app through Vite (`RESOLVE_PUBLIC_URL`, e.g. `http://localhost:5173`). Without a session every route goes to `/entrar`, and «Entrar con tu cuenta» signs in through `/api/oauth2/authorization/resolve`; the backend returns to `RESOLVE_PUBLIC_URL`, so the app always opens at `/` after signing in, and `/entrar?error=oidc` explains a failed attempt. The account menu has «Cerrar sesión» (posts `/api/logout` with the CSRF header, empties the cache and the unsent drafts, and navigates to the returned `logoutUrl`) and, for people in several organizations, «Cambiar de organización». A `401` while the app is open (an expired session) keeps what you typed and shows «Tu sesión caducó»; «Volver a entrar» opens the provider in another tab and the notice goes away when you come back signed in. Without `oidc` there is no `/api/logout` and no `XSRF-TOKEN` cookie, so in development the menu offers the demo-user switch instead.
- **Port.** `KEYCLOAK_PORT` (default `8180`) is the host port, published only on `127.0.0.1`; the admin console is at `http://localhost:8180` with `admin` and the password in `KC_BOOTSTRAP_ADMIN_PASSWORD` (default `admin`, a development value).
- **Demo users.** The realm has `yelisson.ortiz@acme.example` (admin), `laura.mendez@acme.example` (agent), `maria.perez@cliente.example` (customer) and `jordi.puig@northwind.example` (agent of the second organization), all with the password `demo` and a verified email, the same emails as the demo data.
- **Development values, not secrets.** The `demo` passwords and the client secret of `resolve-api` (`resolve-dev-secret`) only exist in this local realm. Override the secret with `RESOLVE_OIDC_CLIENT_SECRET` before the first start; the realm is imported once, so run `docker compose down --volumes` to import it again after changing the file or the variable.
- **Backend variables.** `RESOLVE_OIDC_ISSUER` (default `http://localhost:8180/realms/resolve`), `RESOLVE_OIDC_CLIENT_ID` (`resolve-api`), `RESOLVE_OIDC_CLIENT_SECRET`, `RESOLVE_PUBLIC_URL` (where the browser lands after signing in, default `http://localhost:5173`) and `RESOLVE_SESSION_COOKIE_SECURE` (default `true`; browsers treat `localhost` as secure, so it only matters for other hosts over plain HTTP).
- **Redirect URIs.** Keycloak only accepts a wildcard at the end of a redirect URI, so the client lists the local ports one by one: `8080`-`8089` (API) and `5173`/`4173` (Vite). Another port needs its `http://localhost:<port>/api/login/oauth2/code/resolve` entry in the realm file. After signing out, the browser returns to `RESOLVE_PUBLIC_URL`, which must be listed in the client's `post.logout.redirect.uris`; `5173`, `4173`, `5181`-`5189` and `4181`-`4189` already are, any other URL needs its entry (with and without the final `/`).
## Frontend scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `preview` | Develop, build and serve the production build |
| `npm test` / `test:watch` / `coverage` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Playwright against a production build and a mocked API |
| `SMOKE=1 npx playwright test --project=smoke` | Full-stack smoke test against the real API (see below) |
| `npm run lint` / `typecheck` / `format:check` | oxlint, `tsc -b` and Prettier |
| `npm run api:types` | Regenerate `src/api/schema.ts` from `docs/api/openapi.yaml` (CI fails if it is stale) |

## Full-stack smoke test

`frontend/e2e-smoke/` holds six Playwright scenarios with nothing mocked: an agent creates a ticket, finds it in the inbox, replies, leaves an internal note and changes the status, and then the customer opens the ticket and sees only the public reply; an admin creates a customer and uses it in a new ticket; an admin invites an agent, sees the invitation as pending and then active once the invited person signs in; a new urgent ticket shows up under «Necesitan atención» on the Overview; the first-response target saved in Settings appears on the Overview; and an agent publishes a public article that the customer then finds and reads. The scenarios that change shared state undo it (the ticket is resolved, the target restored, the article unpublished) so they can run repeatedly. CI runs them in the `Full-stack smoke` job against PostgreSQL and the `dev` API. To run it locally, start PostgreSQL and the API with the `dev` profile as above (port 8080, or set `API_PROXY_TARGET`), then:

```sh
cd frontend
SMOKE=1 npx playwright test --project=smoke   # PLAYWRIGHT_PORT=4182 if 4173 is taken
```

`SMOKE=1` builds the frontend with `vite build --mode smoke`, which keeps the demo login so the test can act as different users. Only the dev server and the `smoke` build include it; every other mode, `production` among them, drops it: the `X-Demo-User` header, its storage key and `setDemoUser` are absent from `dist/assets/*.js`. Without `SMOKE=1` the `smoke` project does not exist, so `npm run test:e2e` is unchanged.
## Authentication

Resolve has no passwords of its own. People sign in with an OpenID Connect identity provider and the backend turns the verified email into a membership; the `users` table stores a name and an email, never a credential.

**The backend is the OIDC client (a BFF).** The browser never holds a token. `/api/oauth2/authorization/resolve` starts the authorization-code flow (a confidential client with PKCE), the backend exchanges the code, keeps the tokens in its own session and answers the browser with one cookie: `JSESSIONID`, `HttpOnly`, `SameSite=Lax`, `Secure` and scoped to `/api`, so JavaScript cannot read it and the web assets never carry it. The session changes id on sign-in (session-fixation protection). On every request the verified email is resolved again against the memberships, so removing someone or archiving their customer takes effect on their next request, not when the session expires.

- **Writes need the CSRF token.** The API sets a readable `XSRF-TOKEN` cookie with its first authenticated response; every `POST`, `PATCH` and `DELETE` must repeat its value in `X-XSRF-TOKEN`. The frontend does it for you; a `POST` right after signing in first needs a `GET` so the cookie exists.
- **Signing out** is `POST /api/logout`, which answers `{ "logoutUrl": … }`. The browser must navigate there: that ends the provider's session too, so the next «Entrar» asks for the password again.
- **People and organizations.** An invitation turns active the first time that email signs in. Someone in several organizations picks the active one from the account menu. Who can create a new one is a server setting (`RESOLVE_ORGANIZATIONS_CREATION`, below): by default only someone who administers a workspace; with `open`, any verified identity, including a person with no workspace yet, who gets a typed `401` that says so and may call `POST /api/organizations` and nothing else (see the [API guide](../api/README.md)).

| Variable | Meaning |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `oidc` turns sign-in on (`dev,oidc` locally, `prod,oidc` deployed); without it, `dev` uses the demo login and any other profile answers `401` |
| `RESOLVE_OIDC_ISSUER` | Issuer URL of the realm; the default is the local Keycloak (`http://localhost:8180/realms/resolve`) |
| `RESOLVE_OIDC_CLIENT_ID` / `RESOLVE_OIDC_CLIENT_SECRET` | The confidential client of the API (`resolve-api`; in the local realm the secret is a development value) |
| `RESOLVE_PUBLIC_URL` | Where the browser lands after signing in and out: the address people use. Serving the app from the jar, it is the API's own address |
| `RESOLVE_ORGANIZATIONS_CREATION` | Optional. `admins` (default) or `open`: who can create a workspace. Anything else stops the start. Locally, try `open` with `X-Demo-User: nueva.persona@demo.example`, a demo account with no workspace |
| `RESOLVE_SESSION_COOKIE_SECURE` | `true` by default; only lower it for a browser that does not treat `localhost` as secure |

**Demo mode.** With the `dev` profile alone there is no identity provider: the API loads the demo data and accepts the `X-Demo-User` header (the demo admin by default), and the dev server shows a demo-user picker. Adding `oidc` turns that login off even next to `dev`, and a `production` build of the frontend has no picker or header at all; the `prod` profile has no demo login either. The [local Keycloak](#sign-in-locally) is the realm for trying the real flow with the demo data.

**Tests.** `npm run test:auth` (in `frontend/`, with `--workers=1`) runs `frontend/e2e-auth/auth.spec.ts` against a real Keycloak and the app served from the jar on one origin, the way a deployment serves it. It checks that Laura signs in with the realm password and sees her name, that `JSESSIONID` changes after signing in, that someone in two organizations can switch, that a write carries the CSRF token without a retry, that signing out ends the API and Keycloak sessions (`/api/me` is `401`, the cookie is gone and the next «Entrar» asks for the password) and that a deactivated account sees the reason on `/entrar` and can sign out. It is separate from `npm run test:e2e`, which mocks the API. To run it, start `postgres` and `keycloak` with `docker compose`, build the frontend, copy `dist` into `backend/target/classes/static`, package the jar and start it with `SPRING_PROFILES_ACTIVE=dev,oidc` and `RESOLVE_PUBLIC_URL` set to the API's own URL (`http://localhost:8080` by default); `SERVER_PORT` and `KEYCLOAK_PORT` tell the tests where to look, and `KC_BOOTSTRAP_ADMIN_PASSWORD` (default `admin`, the development value of `docker-compose.yml`) must be exported to them too if you changed it there. CI does the same in the optional `Authentication e2e (Keycloak)` job, which is not a required check; in a Herdr slot see [docs/development/herdr.md](herdr.md#authentication-e2e-in-a-slot). The scenario that deactivates an account creates its Keycloak user through the admin API and deletes it afterwards, and the organization one invites a demo agent to a second organization and removes the membership at the end, so neither changes the realm file or the demo data.

**The development realm never reaches a deployment.** Its `demo` passwords, the `resolve-dev-secret` client secret and the Keycloak `admin` account are values of a local realm, not credentials of anything real. The public demo uses its own realm ([`resolve-realm.prod.json`](../../deploy/keycloak/resolve-realm.prod.json)), a client secret that only exists as a platform secret, no administrator at all, and a demo-user password chosen by the owner (`RESOLVE_DEMO_USER_PASSWORD`), public on purpose and published under [Full deployment](../deploy/README.md#the-public-demo-prepared-not-published) once there is a deployment.

**What a deployment needs, and what is not promised:**

- **HTTPS and a domain.** The `prod` profile marks the cookies `Secure` and trusts the proxy's `X-Forwarded-*` headers, so the app must sit behind TLS on its final address, and that address must be `RESOLVE_PUBLIC_URL` and a redirect and post-logout URI of the client.
- **An identity provider that is not the local one.** The local Keycloak runs in `start-dev` mode with a throwaway database. The demo has its own production-mode Keycloak image with the demo realm; real users would need a managed provider (or a hardened Keycloak) with real accounts.
- **Rotating the client secret.** It has to be changed at the provider and in `RESOLVE_OIDC_CLIENT_SECRET` together; the runbook is in [docs/deploy/runbooks.md](../deploy/runbooks.md).
- **Not covered for real users:** an own domain, a personal-data retention and deletion policy, support and an SLA, and alerting.

Variables, headers and health checks of a deployment are in [docs/deploy/README.md](../deploy/README.md); the API side of sign-in is in the [API contract](../api/README.md#authentication).
## Static demo

The [static demo](https://yelison.github.io/resolve/) is the complete frontend built with `npm run build:showcase` (`vite build --mode showcase`, base `/resolve/`) and published to GitHub Pages by [`pages.yml`](../../.github/workflows/pages.yml) on every push to `main`. `/api` is answered inside the browser by an adapter (`frontend/src/showcase`) that runs the same handlers and data as the e2e tests (`frontend/e2e/mocks`), so there is no second copy to keep in sync. It starts at `/entrar` with the demo-user picker; a deep link such as `/resolve/tickets/1048` goes there first and returns to it after you choose a user. State lives in memory and is reset on reload, and a permanent notice says so on every page.

- **Not in it:** the Spring Boot API, PostgreSQL, Keycloak and any real sign-in, email or persistence.
- **Not in production builds:** the mocks and the adapter only exist in the `showcase` mode; `frontend/e2e/production-bundle.spec.ts` fails if a fixture name reaches the production `dist/`.
- **Run it:** `cd frontend && npm run build:showcase && npm run preview -- --mode showcase`, then open `http://localhost:4173/resolve/`. `npm run test:showcase` serves the build and checks it under `/resolve/`.
- **Enable it (owner):** Settings > Pages > Source: «GitHub Actions».

## Forma UI

Forma UI is the component library of this project. Sixteen of its components (Button, IconButton, Icon, Badge, Field, Input, Tooltip, Modal (the package's Dialog), Tabs, Radio, Avatar, SearchField, Select, FilterChip, Menu and Alert) are published as [`@yelison/forma-ui`](https://www.npmjs.com/package/@yelison/forma-ui) and re-exported from `frontend/src/components/ui`; the rest live there, one folder per component, with CSS Modules, design tokens, tests and JSDoc on every prop. The living catalog at `/catalogo` (development server only, not in production or the static demo) shows each one with demo data, and a test fails if an exported component is missing from it. The criteria for extracting it into its own package are in [ADR 0001](../decisions/0001-forma-ui-extraction.md), and the adoption of the published package in [ADR 0002](../decisions/0002-adopt-forma-ui.md).

- **Actions and feedback:** Alert, Button (and IconButton), Toast, Tooltip, Modal, Menu
- **Forms:** Input, Textarea, Select, Combobox, SearchField, Checkbox, Radio, Switch, Upload, Editor (ticket and article), Field (shared label, hint and error)
- **Navigation:** Breadcrumb, NavItem, Pagination, Tabs, Sidebar, Topbar
- **Data and content:** Avatar, Badge, Attachment, BarChart, EmptyState, FilterChip, Message, Metric, ProgressBar, Skeleton, Table, TicketRow (TicketTable), Timeline
- **Icons:** Icon, a single family of 20–24 px icons

## Project structure

```
docs/api/           # API decisions and the OpenAPI 3.1 contract
docs/decisions/     # Architecture decision records (Forma UI extraction criteria)
docs/deploy/        # Deployment guide and operations runbooks: backups, restore, rollback, secret rotation, health
docs/development/   # How to work on several tasks in parallel with Herdr
frontend/
  src/
    api/            # Types generated from the contract and the typed client
    app/            # Shell, routes, pages, theme and the /catalogo route (development only)
    components/ui/  # Forma UI: one folder per component (tsx, module.css, tests)
    features/       # Product features (tickets, customers, team, session…): pages, queries and their tests
    domain/         # Domain types, re-exported from the generated contract types
    lib/            # Small helpers (positioning, formatting, scroll lock, mutation errors, focus…)
    styles/         # Design tokens (from Figma, a few adjusted in code) and global styles
  e2e/              # Playwright specs with a contract-typed mock API
backend/
  src/main/java/com/resolve/api/
    common/         # Shared infrastructure only: errors, security, paging, persistence, time
    organizations/ memberships/ customers/ tickets/   # One package per feature
  src/main/resources/db/migration  # Flyway schema; db/demo holds dev-only demo data
deploy/             # Fly.io config, Keycloak (realms, login theme, image) and the production compose to test the image
Dockerfile          # One image: API + web app
docker-compose.yml  # PostgreSQL and Keycloak for local development
```

## Engineering highlights in detail

The short version is in the [README](../../README.md#engineering-highlights); this is the full text it summarizes.

- **Contract-first API.** [`docs/api/openapi.yaml`](../api/openapi.yaml) is the single source of truth: the backend integration tests validate every response against it (extra fields fail, so entities or internal notes cannot leak) and the frontend generates its TypeScript types and typed client from it. The decisions behind it are in [`docs/api/README.md`](../api/README.md).
- **Multi-organization by construction.** The organization always comes from the authenticated principal; composite foreign keys keep every reference inside one organization, foreign ids look exactly like missing ones, and customers only see their own tickets and public messages.
- **Safe concurrent edits.** Tickets carry an `ETag`; updates are merge-patches with `If-Match`, so a stale edit gets `412` and the UI reloads instead of overwriting someone else's change. Each change and its activity entry are written in the same transaction.
- **Design tokens that start in Figma.** Colors (light and dark), spacing and type styles come from the Figma variables, by an export tool that runs inside Figma (kept outside this repository), and are published in `@yelison/forma-ui`; [`tokens.css`](../../frontend/src/styles/tokens.css) is generated from that package (`npm run sync:forma-tokens`). A few values were adjusted in the code on purpose (contrast, hover and link colors, the progress track: issues #14, #65 and #75), are marked in the file and are protected by a contrast test. Dark mode is a pure token swap that follows `prefers-color-scheme` unless the user picks a theme, and an inline script applies the choice before the first paint.
- **Accessible by construction.** Components follow the WAI-ARIA Authoring Practices: menu button, tabs, toolbar, dialogs on native `<dialog>` (focus trap, Escape, focus return), tooltips that also appear on focus and can be dismissed (WCAG 1.4.13), labelled fields with announced errors, 44 px touch targets on small screens, a skip link and `prefers-reduced-motion`.
- **Responsive by content, not by device.** Two breakpoints (768 and 1200 px) drive the shell: a drawer on mobile, an icon sidebar on tablets and a collapsible sidebar on desktop. The customer and team tables share one layout built on container queries: cards in narrow containers, priority columns from 768 to 1199 px and the full table from 1200 px. The ticket table has its own container-query layout and is not guaranteed to behave the same at every width (at 1024 px it already shows all its columns).
- **Honest UI.** No fake success states: actions without a backend say they are not connected yet, and demo data is labelled as such.
- **Tested** (counts as of 2026-10-12). 1704 unit and component tests (`npm test`) with coverage thresholds; 884 backend tests (the `Backend - build and tests` job of CI on `main`, run 38296875283), most of them integration tests on PostgreSQL (Testcontainers), covering organization isolation, permissions, internal notes, filters, pagination, validation, update conflicts, metrics, transactional rollback and concurrency with real threads (ticket numbering, racing edits and replies), with a check that fails the build when an operation of the contract has no validated response; and 1060 Playwright tests (1040 with the mocked API plus 20 of the component catalog; `npx playwright test --list`) for every area, from the ticket flow to the article editor and the settings tabs, with layout checks at 320–1440 px (no layout shift when data arrives), table layouts at 390, 1024, 1200 and 1440 px, drawer focus, the persisted sidebar and horizontal overflow at 320–1440 px (including the 767/768 and 1199/1200 edges) in both themes, plus 6 full-stack smoke scenarios against the real API (`SMOKE=1 npx playwright test --list`).
