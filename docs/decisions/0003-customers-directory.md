# 0003 · Customers as a directory grouped by company

- **Status:** accepted, 2026-10-11 (owner decision after reviewing the approved mockups `Clientes`, `ClientesC` and `ClientesEmpresa`).
- **Changes:** the «Clientes» row of `CLAUDE.md` says «table on desktop, essentials in the intermediate range, cards on mobile». The owner replaces it with the directory below **at every width**; the table (`CustomersTable`) is gone.

## Decision

- **No metrics row.** A summary line under the title carries the same data: «3 clientes de 3 empresas · 3 con tickets abiertos · 1 nuevo este mes» (plurals checked, «ninguno» instead of «0», «sin empresa» when no one has one).
- **One card per company**, with its mark (two initials), its name, «N clientes · N tickets abiertos» and its customers. Each row has the avatar, name and email, **Última conversación** (`#number subject`, linked to the ticket, and how long ago) and an open-tickets badge. The customers without a company come last, as «Sin empresa».
- **Only the first three customers of each company** are shown. If it has more, a link at the foot of the card, «Ver los N clientes de {empresa}», **filters the same page** by that company (`?company=…`, or `?withoutCompany=true` for «Sin empresa»). The filter shows as a chip «Empresa del cliente: {empresa} ✕» and a «← Volver a todas las empresas» link; the state lives in the URL.
- **Pagination counts companies** (8 per page). `Pagination` says «1–8 de 38 empresas».
- **«Agrupar: Empresa / Sin agrupar»** switches to a flat list of customers (20 per page), each row naming its company. The company filter was renamed **«Empresa del cliente»** so it is not read as the workspace.
- Responsive: from 1200 px a customer fits in one line (person, last conversation, badge); below, the row stacks (person and badge, then the conversation) with `overflow-wrap` on every text and 44 px touch targets under 768 px.

## Pagination: why by company and not «(continúa)»

The API paginated customers, not companies. Grouping inside a page of customers leaves a company in two pages in the middle of the list, and a «(continúa)» header cannot even be truthful: with the name order, a company reappears in non-consecutive pages. The options were:

1. **Group inside the page.** Simple, but the totals of a company header would be those of its page only.
2. **Sort by company on the server.** Changes the contract of the list and still splits the boundary company.
3. **A listing that paginates by company** (chosen): `GET /customers/by-company` pages companies, so **a company is never split** and «(continúa)» is never needed. Each group carries the totals of *all* its customers that match the filters and a preview of its first three (in the requested `sort`), so the header is always true and the response carries at most 8 × 3 customers.

It costs a few queries per request, never one per company or per customer: (1) the keys of the page's companies with the number of customers of each and the total of companies (`count(*) OVER ()`, so no second query), without touching tickets; (2) the open tickets of *only those* companies; (3) the ids of the previewed customers (a window function); and (4) one batch for their counts and last ticket. The cost is not constant: (1) and (3) still read the organization's customers that match the filters, because there is no index on the company key, so it grows with the number of customers (not with the page number: the tickets are counted only for the companies on the page, which is what made the last page expensive in the first version). Every query starts from the organization of the principal (and repeats it in the ticket predicates so they use the index); an access-table row and a test with another organization's tickets pin it.

## `lastTicket`

`CustomerSummary.lastTicket` is the customer's most recent ticket by `updatedAt` (the highest `number` breaks a tie), `null` without tickets. It is read for the whole page with one `DISTINCT ON (customer_id)` query. `V9` adds `tickets_customer_recent_idx (organization_id, customer_id, updated_at DESC, number DESC)` and drops `tickets_customer_idx`, whose columns are its prefix. `CustomerDetail` does not carry it.

## Demo data

- The demo mocks derive each customer's open/total tickets and last ticket from the demo tickets. Carlos Ruiz showed «0 abiertos» while his ticket #1047 is «En progreso» (`openTickets` counts everything not `resolved`): the numbers in the first mockup («2 con tickets abiertos», «Sin abiertos» for Northstar) came from that fault; the demo now says 3 and «1 abierto».
- The company of two demo customers was «Acme Studio», the workspace's own name, so the workspace looked like a customer of itself. It is now **«Lumen Diseño»** in the mocks and, with a new demo migration (`V1007`, the applied ones are not edited), in the demo database (María Pérez, Ana García, her address, María's note and Ana's billing ticket).

## Differences from the mockups

- «hace 5 minutos», not «hace 5 min» (the shared `formatRelative`).
- The company mark of a single word takes its first two letters («NO» for Northstar, not «NS»).
- The «Con tickets abiertos» chip of the mockups is not drawn: the API has no such filter and it would be simulated.
- In the company view the page keeps the organization summary instead of «14 clientes de Acme Studio · 9 con tickets abiertos»: that second number is not available without another endpoint. The card header says «N clientes».

## New pieces

- `Pagination` gets `unit` (default «resultado/resultados»), the only change in `components/ui`: a list paginated by companies must not say «resultados».
- `CompanyMark` and the removable chip are local to the feature: `Avatar` is round and for people, and `FilterChip` always draws a chevron.

## Open idea (not implemented)

Folding each company to its header. Each card is already a `<section>` with its own `<header>`, so a toggle could be added there without touching the rest.
