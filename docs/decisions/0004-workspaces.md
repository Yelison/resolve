# 0004 · Workspaces: switching, leaving, creating and telling them apart

- **Status:** accepted, 2026-10-11. The owner picked the options on the planning page (`1-D, 2-A, 3-A, 4-A, 5-A, 6-A`) and approved the full-size previews (`resolve-espacios-previews.html`, 15 boards in both themes) together with the four rules under [Rules](#rules).
- **Supersedes:** the «Cambiar de organización» dialog of the account menu, and the plan's «deleting a workspace is out of v1» stays as it is (decision 5-A).

The API and the database keep the word **organization**; this ADR uses *workspace* for the concept and quotes the UI text, which is **«espacio»** (decision 6-A).

## What already exists

Several memberships per person with one role each, choosing the session's organization (`POST /session/organization`), per-organization isolation on every query, the Empresa settings, invitations, and `MemberService.remove`: it serializes the team per organization (`lockTeam`), refuses to remove the last active admin (`LAST_ADMIN`, `409`) and releases the member's open tickets (`AssignedTicketReleaser`). Leaving reuses all of that.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Who can create a workspace | **D.** One server setting, `resolve.organizations.creation`: `admins` (default) lets a person with an active **admin** membership anywhere create more; `open` also lets any verified identity create one, including someone with no membership at all. Customers never see «Crear espacio» in either mode |
| 2 | Who is in charge | **A.** Every admin is equal. A workspace always keeps at least one active admin; no owner role |
| 3 | Where you switch and manage | **A + the list of B.** The workspace card of the sidebar opens the switcher; «Configuración › Tus espacios» lists them and is where you leave one |
| 4 | How you tell them apart | **A.** Initials plus one of 8 colors, chosen in Empresa |
| 5 | When a workspace is no longer used | **A.** You can leave; nothing is archived or deleted |
| 6 | Word in the UI | **A.** «espacio» everywhere: «Cambiar de espacio», «Crear espacio», «Tus espacios», «Salir del espacio» |

## Rules

1. **Leaving releases your work.** Leaving marks your membership `removed` (with `removed_at`, as `MemberService.remove` does) and releases your unresolved tickets in that workspace: they become unassigned. Your messages and notes stay in the history with your name.
2. **Customers do not leave on their own.** Their access belongs to the company that supports them (archiving the customer, as today). A customer gets `403` from the leave endpoint and the UI never offers it.
3. **The limit is three workspaces created by you**, counted by `organizations.created_by`. Workspaces you were invited to do not count, and leaving one you created gives the slot back (it counts workspaces you created and are still an active member of).
4. **«Primeros pasos»** shows on Inicio, to admins, until its three steps are done once. After that it never comes back.
5. **You cannot leave your only usable workspace** (`409` `last-organization`); the UI disables «Salir» with «Es tu único espacio». Phase 4a left this rule as it is. If the `open` mode ever should let a person leave their last workspace (they can create another from the «Crea tu espacio» page), it needs `memberships.removed_by` (a migration of its own, not V10) so that `no-membership` can replace `access-deactivated` for someone who left; proposed, not implemented.

## Contract

Additions are backward compatible; `npm run api:types` regenerates the client and `check-query-keys` keeps passing.

### Reading

- `OrganizationRef` (in `GET /session/organizations` and `Me.organizations`) gains **`role`** (`admin | agent | customer`), **`color`** and **`memberCount`** (active staff, `null` for a `customer` ref, which shows «Soporte de {name}» instead).
- `Me.organization` and `OrganizationSettings` gain **`color`**.
- `Me` gains **`organizationCreation`**: `{ allowed: boolean, created: number, limit: number }`. `allowed` already folds in the mode, the caller's roles and the limit; the UI never recomputes it. «Has creado 2 de 3 espacios» reads `created` and `limit`.
- The Inicio data gains **`gettingStarted`**: `null` when it should not show (an agent, a customer, or already completed), otherwise `{ invitedTeam, addedCustomer, publishedArticle }`. Inicio has no response of its own (it is composed from `GET /tickets/metrics`, the attention list, the report summary and the activity feed), so the field is `TicketMetrics.gettingStarted`, on the response of the first block of the page. The step is *someone else has ever been in the team* (removed memberships count), *the workspace has ever had a customer* and *it has ever had a published article*; the last one reads `articles.first_published_at` (V10; written once by the first publication and kept when unpublishing, which clears `published_at`), so the three steps only turn `true`, and completion is remembered in `getting_started_done_at`, which the read that sees the three steps writes once (an idempotent `UPDATE … SKIP LOCKED` that never waits and never touches `version`). `Me.organizationCreation` is required, like `color`.

### Writing

- **`POST /organizations`** `{ name, timeZone }`. The creator gets an `active` `admin` membership (`customer_id` null), `created_by` is set, the color comes from the id (below), and the session switches to it (`SessionOrganization.write`). Answers `201` with `Me`. Errors, checked in this order: `400` per field (`name` 1–120 characters after trimming, `timeZone` a valid IANA zone; before the permission, because the permission does not depend on the role of the session); `403` when the mode and the caller's roles do not allow it (in `admins` mode, an active admin membership *anywhere*, not the session's role); `409` with type `https://resolve.example/problems/organization-limit` at the limit. Like `POST /session/organization`, it **ignores `X-Organization-Id`**, because it is what changes the organization.
- **`DELETE /me/organizations/{organizationId}`**: leave. `204`. It runs under that organization's `lockTeam`, applies the `LAST_ADMIN` rule (`409`, new type `https://resolve.example/problems/last-admin` so the UI can tell it from other conflicts) and releases the tickets in the same transaction. Unknown, foreign or already-left organizations answer the same `404`; a `customer` membership answers `403`; leaving the person's only usable workspace answers `409` with type `https://resolve.example/problems/last-organization` (checked before the last-admin rule, and exact under simultaneous leaves of two workspaces thanks to a per-person advisory lock taken before `lockTeam`). Leaving the session's own organization is allowed: the next request resolves into the first usable membership (the existing rule); there is one unless an admin removed the person from the others, since rule 5 only forbids *leaving* the last. The header check applies as for any write.
- **`PATCH /organization`** accepts **`color`** (admin only, `If-Match` as today).

### Color

`color` is a key, not a hex value: `blue, green, magenta, orange, violet, teal, brick, slate`. Each key maps to a light and a dark token, so both themes keep contrast with white initials. A new workspace gets `keys[hash(id) mod 8]`, where the hash is the last byte of the id (the ids are UUIDv7, whose first bytes are a timestamp), so new workspaces spread across the palette; existing ones get the same in the migration. Colors may repeat. The color is never the only cue: initials and, everywhere except the collapsed bar, the name go with it, and in the collapsed bar the square has an `aria-label` and a tooltip with the name.

## Database

`V10__organization_workspace.sql`:

- `organizations.color varchar(16) NOT NULL` with a `CHECK` on the 8 keys, filled from the id for existing rows by the SQL function `organization_color`; a `BEFORE INSERT` trigger fills it the same way for rows inserted without a color (the demo migrations already applied cannot be edited).
- `organizations.created_by uuid NULL REFERENCES users (id)`, plus an index for the count. Existing rows stay `NULL` and count for nobody.
- `organizations.getting_started_done_at timestamptz NULL`. Existing rows are set to `now()`, so the established demo workspaces do not show «Primeros pasos». It is set the first time the three conditions hold; the demo migration `V1008` marks the demo workspaces as established.

## Frontend

- **Sidebar** (local component, `components/ui/Sidebar`). The workspace card becomes the trigger of a `workspaceMenu` render prop, like `profileMenu`, with the colored initials square, the name, your role and an up/down chevron. Collapsed, the square is the trigger, with an `aria-label` and a visible tooltip on focus. In the drawer the switcher unfolds inside the menu. A customer with a single workspace gets a plain card (no trigger).
- **Switcher** (`Menu`). Each row has the colored square, the name, your role and a check on the current workspace. A search field appears from 8 workspaces. Below a separator come «Crear espacio» (only when `organizationCreation.allowed`) and «Tus espacios» (not for customers). Switching keeps today's behavior: it empties the cache and goes to Inicio. The «Cambiar de organización» entry leaves the account menu, and `OrganizationSwitcher` is deleted.
- **«Configuración › Tus espacios»** (`/configuracion/espacios`, under «Tu cuenta»; customers do not get it):
  - On desktop, each row has «Estás aquí» or «Abrir», plus «Salir»; «Crear espacio» goes in the header, and «Has creado N de 3 espacios» in the footer.
  - On mobile, the whole row opens the workspace and «⋯» opens an action sheet.
- **Leaving.** The confirmation dialog says how many of your tickets will be released. The last-admin `409` turns into «No puedes salir de {name}» with «Ir a Equipo». In Equipo, the only admin's role menu disables «Agente» and «Retirar del equipo» and explains why: the server rule exists, but the UI now says it before you try.
- **Creating.** A dialog asks for the name and the time zone, defaulting to `Intl.DateTimeFormat().resolvedOptions().timeZone`. Errors appear under their field, and reaching the limit shows its own state. On success the cache empties, the app goes to Inicio of the new workspace and a toast says «Ya estás en {name}».
- **Empresa** gains the «Color» radio group (8 swatches, 44 px, keyboard operable), with a preview of the sidebar card.
- **Inicio** shows «Primeros pasos» from `gettingStarted`: invite your team, add your first customer, publish a help article, each with its own button.
- **Mobile sheets.** Below 768 px the action and confirmation dialogs open as bottom sheets. `Modal` is Forma UI's `Dialog`, which has no sheet presentation today, so this needs a Forma UI release (below).

## Phases

Each phase ships as its own PR (or two, backend and frontend, when the contract lands first) and leaves something usable.

| Phase | Content | Depends on |
|---|---|---|
| **1 · Switch and leave** | `OrganizationRef.role/memberCount`, `DELETE /me/organizations/{id}`, the `last-admin` type; sidebar trigger and switcher, «Tus espacios», leave dialog, Equipo's last-admin hint, «espacio» wording everywhere | Forma UI `Dialog` sheet (or the centered dialog until it is published) |
| **2 · Create** | `created_by`, the limit (`resolve.organizations.per-person-limit`), `POST /organizations`, `Me.organizationCreation`; the create dialog, the toast, «Primeros pasos» and `gettingStarted`. The `resolve.organizations.creation` setting is not added until phase 4a: in this phase only the `admins` behavior exists | 1 |
| **3 · Color** | `color` in the migration, the DTOs and `PATCH /organization`; the colored square in sidebar, switcher, list and Empresa | 1 (it can run in parallel with 2) |
| **4a · Open sign-up** | **API, done:** `resolve.organizations.creation` (`admins` / `open`); in `open` the `no-membership` `401` carries `canCreateOrganization`, `email` and `name`, and a verified identity without membership may call `POST /organizations` and nothing else (see [Phase 4a](#phase-4a-the-open-mode-in-the-api)). **The page, pending (its own task):** «Crea tu espacio» and «Aún no estás en ningún espacio» (board 13) and the mocks of the static demo | 2 |
| **4b · Google and GitHub in Keycloak** | **Dropped** (owner, 2026-10-12): it asked for OAuth apps and secrets in a deployed identity provider, and the backend is not published (the portfolio shows a static demo plus a video and «Run it yourself»), so there would be nothing for the realms to serve. The `open` mode works with whatever the identity provider already offers; a self-hosted installation can add social providers in its own realm | |

## Phase 4a: the open mode in the API

Decision 1-D, made concrete (owner, 2026-10-12; only 4a, see the table above).

- **The setting.** `resolve.organizations.creation`, from `RESOLVE_ORGANIZATIONS_CREATION`, in `application.properties` with the default `admins`, so it is optional in `prod` as well. `admins` behaves exactly as before. An empty value counts as not set (the closed mode, so nothing opens by accident); anything that is neither `admins` nor `open` (case and spaces aside) stops the start with a message that names the property, the variable and both values. It is read once into `OrganizationCreationPolicy`, which the security rule, the service and the `401` consult, because those three have to agree.
- **What `open` changes.** `allowed` stops asking for an admin membership: any verified identity may create while it has fewer than `limit` workspaces created and still active (rule 3, unchanged: the limit is 3, per person, behind the same per-person lock). That includes an agent, a customer and a person with no workspace. The UI keeps hiding «Crear espacio» in a customer session (decided earlier); the server does not forbid it.
- **The identity without a workspace.** A person the provider authenticated with a verified email and who has no membership at all (not even a removed one: that is `access-deactivated`, which stays a refusal) is not a member, so there is no `CurrentMember` to give them. They stay outside the security context and the resolver leaves a `VerifiedIdentity` (`email`, `name`) as a **request attribute**. The rule of `POST /organizations` is the single place that admits it, and only in `open` mode; the controller reads the attribute when there is no principal, and the service checks the mode again before it writes.
  - **Why an attribute and not an authentication.** An authenticated «identity without a workspace» principal would pass every `authenticated()` rule: `GET /me`, `PATCH /me`, `POST /session/organization`… would reach controllers that expect a `CurrentMember` (a `500`, or worse, a half-checked path). As an attribute, every rule treats the person as it did before (the typed `401`), no rule added later can let them in by oversight, and the only exception is written, with its reason, in one place. `ApiAccess.identityWithoutMembershipViolations` proves it for every operation of the contract, in both modes and on both security chains (demo header and OIDC session with CSRF).
  - **The `401` tells the screen who they are.** The `no-membership` Problem gains `canCreateOrganization` (`true` in `open`, `false` in `admins`), `email` and `name` (the provider's name, else the stored one, else the part of the email before the `@`; never empty), in both modes: board 13 shows the email on the closed screen too. They are the person's own data, from a verified email; an unverified one is not an identity and still gets the plain `401`. No other Problem carries them.
  - **The user is created by the creation, not by asking.** `GET /me` still creates nothing. `POST /organizations` finds or creates the account (`INSERT … ON CONFLICT DO NOTHING`, an existing name is kept) in the same transaction as the organization and the membership, then takes the per-person lock and counts. With a brand-new email two simultaneous requests also queue on the unique index; with an existing account, the lock alone serializes them, and a test holds the lock from outside to prove it.
  - **CSRF and the header.** A write like any other: the CSRF filter runs before the rule, so a session without the token gets the `403` `csrf`. `X-Organization-Id` is ignored, as ever, for this route.
  - **Answer.** `201` with `Me` and the session in the new workspace; the provider's session does not change, because the principal is resolved on every request from the verified email.
- **Order of errors** for this person: `401` (admins mode: always, before the body), `400`, `409`. There is no `403` in `open`.
- **Demo data.** `V1009` adds `nueva.persona@demo.example` with no membership, for `X-Demo-User`.
- **Phase 4b is dropped**, for the reason in the table.

## Demo

- The GitHub Pages demo runs on `frontend/e2e/mocks/**`. Switching, leaving, creating (with the limit) and the color work in the browser's memory like the rest of the demo, and nothing says the data is saved.
- The demo users get a second and third workspace (the demo administrator is an agent in «Lumen Diseño»), so the switcher has something to show. The static demo has no server: the «Crea tu espacio» page and the visitors' workspaces live in the mocks. A deployed instance that turned `open` on would have its nightly reset remove the workspaces (and the accounts created with them) that visitors create; `docs/deploy/README.md` says so.
- `DemoLimits` already applies per organization, so a new workspace inherits the caps.

## Tests

- **Backend:**
  - Access-table rows for the two new endpoints.
  - Leaving: the last admin under concurrency (the same lock as `remove`), released tickets, a customer's `403`, and the same `404` for a foreign or unknown id.
  - Creating: each mode with each role, the limit under two concurrent requests, the session switching and the default color.
  - The migration on a copy of the demo data.
- **Frontend:**
  - Unit tests of the switcher, «Tus espacios», the dialogs, Empresa's color and «Primeros pasos».
  - e2e of switching, leaving and creating, at 390, 768 and 1440 px and in both themes, with the keyboard (menu, sheet and dialog focus, Escape).
  - The smoke and showcase suites updated for the new wording.

## Out of scope

Archiving or deleting a workspace (5-B and 5-C stay noted for later, together with an owner role), an uploaded logo (4-B), joining by email domain (1-B), and transferring workspaces.
