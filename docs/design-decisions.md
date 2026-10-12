# Design decisions

The Figma frames are the visual reference. Where they conflict with the written responsive and accessibility rules, the rules win:

- **Touch targets:** buttons and fields keep the 42/40 px Figma height on desktop and grow to 44 px below 768 px; icon buttons are always 44 px.
- **Focus:** a shared 2 px outside focus ring replaces the 2 px inside stroke of the Figma focus variants, so focusing never shifts layout.
- **Navigation:** nav items fill the sidebar width (Figma hugs the label); the mobile header is 56 px (64 in the frame); the drawer can be up to 280 px wide and has *Cerrar menú* (close) instead of *Colapsar menú* (collapse).
- **Panels:** dialogs use the 12 px panel radius; the large avatar is 48 × 48 (21 × 48 in the frame).
- **Editor:** the toolbar applies Markdown, so underline is left out.
- **Tickets scope:** tags, attachments, SLA, customer notifications, deleting and bulk actions are not in the API yet, so the UI leaves them out (no inert controls); the inbox has no selection checkboxes until bulk actions exist.
- **Text-only placeholders** in Figma (pagination, breadcrumb, editor toolbar, search) are implemented as real, keyboard-operable controls.
- **Cards without data (D-02).** Figma metrics that have no data or definition in the model are replaced rather than invented: Customers shows «Nuevos este mes» instead of «Satisfacción» and omits «Plan Pro»; Team omits «Disponibilidad» and shows «Primera respuesta» instead of «Respuesta media». Customers also has no «Actividad» tab yet (only «Tickets» and «Notas»). On the Overview, «Satisfacción» becomes «Sin responsable» (tickets without an assignee that are not resolved), the table column «Objetivo SLA» becomes «Actualizado», and Reports shows «Resolución» (median hours) instead of «Cumplimiento SLA». Every figure on the Overview and Reports is defined, with its window and its time zone, in [Metrics](api/README.md#metrics).
- **Markdown without HTML (D-06).** Articles are Markdown rendered with `react-markdown` to React elements: raw HTML is skipped, only headings 2–3, paragraphs, bold, italics, lists and links are allowed (anything else renders as its text) and the default URL sanitizer drops `javascript:` and `data:` links. There is no `dangerouslySetInnerHTML` and no home-made parser; the API stores the body as plain text and never renders it.
- **No Notifications tab (D-07).** Figma's Settings has a «Notificaciones» tab, but nothing sends or consumes notifications yet, so it is not shown rather than offering switches without effect. Settings has Company, Profile, Appearance and Permissions; the permissions matrix is read-only because roles are fixed and the server decides (the table says so).
- **Charts as in-house SVG (D-09).** `BarChart` and `ProgressBar` are plain SVG and CSS inside Forma UI, with no chart library: two simple charts do not justify around 100 kB. Every chart has an accessible alternative table (a toggle you reach with Tab) and a text summary, and the chart scales with its container.
- **One request per report (D-10).** `GET /api/reports/summary?period=7d|30d|90d` returns every section of the report (figures, previous period, days, channels and agents) in one response read in a single transaction, so all the numbers describe the same moment and the page makes one request instead of five. Metric definitions are in [Metrics](api/README.md#metrics).
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
  | Knowledge base: read | ✓ | ✓ | published and public articles only |
  | Knowledge base: write, publish, unpublish | ✓ | ✓ | 403 |
  | Organization settings | edit | read only | 403 |
  | Your own display name | ✓ | ✓ | ✓ |

- **Tables stay feature-local, except for their shared layout (D-05).** `CustomersTable` and `TeamTable` were compared with each other (`TicketTable` was not measured against them): the container grid, the hidden header, the card with hover, the actions cell, the «Mostrando N resultados» caption, the mid-range rules and the ARIA scaffolding were duplicated line by line (123 identical non-blank lines of CSS between the two files, well over the 40-line threshold, plus the table markup), so they moved to `components/ui/Table`, shown in the catalog. Columns, cells and the grid areas of each range stay in each feature; no sorting, selection or virtualization was added. `TicketTable` is left as it is: it also owns row selection and its own container, and migrating it is outside this change.
- **Full table from 1200 px.** The table container measures about 894 px at a 1200 px viewport (240 px sidebar) and about 898 px at 1024 px (76 px sidebar), so no container threshold alone can show the full table from 1200 px and still keep priority columns below it. The customer and team tables therefore show the full table only when the viewport is at least 1200 px (the project's own breakpoint) and their container is at least 860 px, with the sidebar expanded or collapsed; from 768 to 1199 px they keep priority columns.
- **Focus after a dialog.** If a `403` hides the actions that opened a dialog, closing it moves focus to the page title instead of letting it fall to the page body. After a member is removed successfully, the row leaves the active filter a moment after the dialog closes, so focus goes to the page title unconditionally.
- **Where the rest is written down.** The criteria for extracting Forma UI into its own package, with the measured state of each component, are in [ADR 0001](decisions/0001-forma-ui-extraction.md), and how the extracted components were adopted in [ADR 0002](decisions/0002-adopt-forma-ui.md); the image, its variables and the local production test are in the [deployment guide](deploy/README.md); backups, the rehearsed restore, rollback, secret rotation and the `health` checklist are in the [operations runbooks](deploy/runbooks.md).
