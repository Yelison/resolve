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
4. **«Primeros pasos»** shows on Inicio, to admins, until its four steps are done once. After that it never comes back.
5. **You cannot leave your only usable workspace** (`409` `last-organization`); the UI disables «Salir» with «Es tu único espacio». Revisit in phase 4, when a person without workspace can create one; then `memberships.removed_by` (V10) lets `no-membership` replace `access-deactivated` for someone who left.

## Contract

Additions are backward compatible; `npm run api:types` regenerates the client and `check-query-keys` keeps passing.

### Reading

- `OrganizationRef` (in `GET /session/organizations` and `Me.organizations`) gains **`role`** (`admin | agent | customer`), **`color`** and **`memberCount`** (active staff, `null` for a `customer` ref, which shows «Soporte de {name}» instead).
- `Me.organization` and `OrganizationSettings` gain **`color`**.
- `Me` gains **`organizationCreation`**: `{ allowed: boolean, created: number, limit: number }`. `allowed` already folds in the mode, the caller's roles and the limit; the UI never recomputes it. «Has creado 2 de 3 espacios» reads `created` and `limit`.
- The Inicio overview gains **`gettingStarted`**: `null` when it should not show (an agent, a customer, or already completed), otherwise `{ invitedTeam, addedCustomer, publishedArticle }`.

### Writing

- **`POST /organizations`** `{ name, timeZone }`. The creator gets an `active` `admin` membership (`customer_id` null), `created_by` is set, the color comes from the id (below), and the session switches to it (`SessionOrganization.write`). Answers `201` with `Me`. Errors: `400` per field (`name` 1–120 characters after trimming, `timeZone` a valid IANA zone); `403` when the mode and the caller's roles do not allow it; `409` with type `https://resolve.example/problems/organization-limit` at the limit. Like `POST /session/organization`, it **ignores `X-Organization-Id`**, because it is what changes the organization.
- **`DELETE /me/organizations/{organizationId}`**: leave. `204`. It runs under that organization's `lockTeam`, applies the `LAST_ADMIN` rule (`409`, new type `https://resolve.example/problems/last-admin` so the UI can tell it from other conflicts) and releases the tickets in the same transaction. Unknown, foreign or already-left organizations answer the same `404`; a `customer` membership answers `403`; leaving the person's only usable workspace answers `409` with type `https://resolve.example/problems/last-organization` (checked before the last-admin rule, and exact under simultaneous leaves of two workspaces thanks to a per-person advisory lock taken before `lockTeam`). Leaving the session's own organization is allowed: the next request resolves into the first usable membership (the existing rule); there is one unless an admin removed the person from the others, since rule 5 only forbids *leaving* the last. The header check applies as for any write.
- **`PATCH /organization`** accepts **`color`** (admin only, `If-Match` as today).

### Color

`color` is a key, not a hex value: `blue, green, magenta, orange, violet, teal, brick, slate`. Each key maps to a light and a dark token, so both themes keep contrast with white initials. A new workspace gets `keys[hash(id) mod 8]`, so new workspaces spread across the palette; existing ones get the same in the migration. Colors may repeat. The color is never the only cue: initials and, everywhere except the collapsed bar, the name go with it, and in the collapsed bar the square has an `aria-label` and a tooltip with the name.

## Database

`V10__organization_workspace.sql`:

- `organizations.color varchar(16) NOT NULL` with a `CHECK` on the 8 keys, filled from the id for existing rows.
- `organizations.created_by uuid NULL REFERENCES users (id)`, plus an index for the count. Existing rows stay `NULL` and count for nobody.
- `organizations.getting_started_done_at timestamptz NULL`. Existing rows are set to `now()`, so the established demo workspaces do not show «Primeros pasos». It is set the first time the three conditions hold.

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
| **2 · Create** | `resolve.organizations.creation` (only `admins` is reachable in this phase), `created_by`, the limit, `POST /organizations`, `Me.organizationCreation`; the create dialog, the toast, «Primeros pasos» and `gettingStarted` | 1 |
| **3 · Color** | `color` in the migration, the DTOs and `PATCH /organization`; the colored square in sidebar, switcher, list and Empresa | 1 (it can run in parallel with 2) |
| **4 · Open sign-up** | `open` mode: the `no-membership` `401` carries `canCreateOrganization`, a verified identity without membership may call `POST /organizations` and nothing else; the «Crea tu espacio» page; Google and GitHub identity providers in the Keycloak realms (`trustEmail`) | 2, and OAuth apps the owner creates (their secrets go in deployment variables, never in the repository) |

## Demo

- The GitHub Pages demo runs on `frontend/e2e/mocks/**`. Switching, leaving, creating (with the limit) and the color work in the browser's memory like the rest of the demo, and nothing says the data is saved.
- The demo users get a second and third workspace (the demo administrator is an agent in «Lumen Diseño»), so the switcher has something to show. The public demo enables `open` only in phase 4; its periodic reset already removes the workspaces visitors create.
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
