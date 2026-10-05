# 0001 · Forma UI stays in the application until a second consumer exists

- **Status:** accepted, 2026-10-05
- **Plan reference:** [T7.2](../plans/2026-10-04-resolve-implementation-plan.md) (Fixed stack: "no package called `forma-ui`")

## Context

Forma UI is the internal name of the component catalog in `frontend/src/components/ui` (one folder per component with
`.tsx`, CSS Module and tests; public surface in `index.ts`; living catalog at `/catalogo`). It is not a published
package and nothing outside this repository imports it.

Extracting it into its own package has a real cost: a second `package.json`, an npm workspace, a library build, a
versioning story and tokens that live outside the application. That cost only pays off when somebody else needs the
components. Today there is one consumer, so the question is not "can we extract it?" but "when would extracting stop
being speculative?".

## Decision

1. **Do not create `packages/forma-ui` now.** Components stay in `frontend/src/components/ui`.
2. **Extraction criteria.** A component is ready to move only when all of these hold:
   1. It is used in **three or more product areas** (`frontend/src/features/*`; the shell and `/catalogo` do not
      count) and its code did **not change during one whole phase** of the plan.
   2. Its **public API is stable**: exported props are documented and nothing in it is a pending decision.
   3. It has **no dependency on `domain/tickets`** (or any other domain or generated API type).
   4. Its visual values come from **tokens as CSS custom properties**, with no literal colours or sizes.
   5. It has **tests of its own and an entry in `/catalogo`**.
3. **Trigger.** Extract into `packages/forma-ui` (npm workspace, Vite library mode, tokens as their own package)
   **when a second real consumer exists**: another application, or a second frontend in this repository, that needs the
   components. A wish to "reuse" or a single prospective project does not count. Until then no package is created, and
   the criteria above are the checklist to run on that day.
4. The package would also need `frontend/src/lib` helpers that Forma UI already imports (`cx`, `format`, `position`,
   `scrollLock`) and `src/styles/tokens.css`; they move with it or are duplicated deliberately.

## Current state (measured 2026-10-05, base `aa9b11e`)

Measured from the code: _Areas_ are the `features/*` folders that import the component's exports (the shell,
`app/pages` and `/catalogo` are excluded); _Tests_ means a `*.test.tsx` file in the component's own folder; _Catalog_
means `CatalogPage.tsx` renders it; _Domain_ means the component imports from `src/domain`. _Commits_ is the number of
commits that touched the folder; the whole history spans 2026-10-04 to 2026-10-05, so **criterion 1's "a phase without
changes" cannot be met by any component yet**, and the last column is "ready apart from stability".

| Component                               | Areas (n)                                    | Tests  | Catalog | Domain                    | Commits | Ready apart from stability               |
| --------------------------------------- | -------------------------------------------- | ------ | ------- | ------------------------- | ------- | ---------------------------------------- |
| Alert                                   | 6                                            | yes    | yes     | no                        | 1       | yes                                      |
| Attachment                              | 0                                            | yes    | yes     | no                        | 1       | no · no product use                      |
| Avatar                                  | 3                                            | yes    | yes     | no                        | 1       | yes                                      |
| Badge                                   | 4                                            | yes    | yes     | no                        | 1       | yes                                      |
| BarChart                                | 2                                            | yes    | yes     | no                        | 5       | no · 2 areas, still changing             |
| Breadcrumb                              | 0 (shell)                                    | yes    | yes     | no                        | 1       | no · shell only                          |
| Button / IconButton                     | 6                                            | yes    | yes     | no                        | 1       | yes                                      |
| Checkbox                                | 0 (inside TicketRow, Switch)                 | yes    | yes     | no                        | 2       | no · no direct product use               |
| Combobox                                | 1                                            | yes    | **no**  | no                        | 2       | no · 1 area, not in catalog              |
| Editor                                  | 1                                            | yes    | yes     | no                        | 1       | no · 1 area                              |
| EmptyState                              | 6                                            | yes    | yes     | no                        | 1       | yes                                      |
| Field                                   | 0 (inside Input, Select, Textarea, Combobox) | yes    | **no**  | no                        | 1       | no · internal, not in catalog            |
| FilterChip                              | 4                                            | yes    | yes     | no                        | 1       | yes                                      |
| Icon                                    | 3                                            | yes    | yes     | no                        | 1       | yes                                      |
| Input                                   | 3                                            | **no** | yes     | no                        | 1       | no · no own test                         |
| Menu                                    | 4                                            | yes    | yes     | no                        | 1       | yes                                      |
| Message                                 | 1                                            | yes    | yes     | no                        | 3       | no · 1 area, still changing              |
| Metric                                  | 5                                            | yes    | yes     | no                        | 1       | yes                                      |
| Modal                                   | 2                                            | yes    | yes     | no                        | 1       | no · 2 areas                             |
| NavItem                                 | 0 (inside Sidebar)                           | yes    | yes     | no                        | 1       | no · no direct product use               |
| Pagination                              | 3                                            | yes    | yes     | no                        | 1       | yes                                      |
| ProgressBar                             | 1                                            | yes    | yes     | no                        | 1       | no · 1 area                              |
| Radio                                   | 0                                            | **no** | yes     | no                        | 1       | no · no use, no own test                 |
| SearchField                             | 3                                            | yes    | **no**  | no                        | 1       | no · not in catalog                      |
| Select                                  | 4                                            | **no** | yes     | no                        | 1       | no · no own test                         |
| Sidebar                                 | 0 (shell)                                    | yes    | **no**  | no                        | 1       | no · shell only, not in catalog          |
| Skeleton                                | 6                                            | yes    | yes     | no                        | 1       | yes                                      |
| Switch                                  | 0                                            | **no** | yes     | no                        | 1       | no · no use, no own test                 |
| Table (+ Cell, HeaderCell, Row)         | 4                                            | yes    | yes     | no                        | 2       | yes                                      |
| Tabs                                    | 2                                            | yes    | yes     | no                        | 1       | no · 2 areas                             |
| Textarea                                | 2                                            | **no** | yes     | no                        | 1       | no · 2 areas, no own test                |
| TicketRow / TicketTable / ticket labels | 3                                            | yes    | yes     | **yes** (`domain/ticket`) | 3       | no · depends on ticket types             |
| Timeline                                | 2                                            | yes    | yes     | no                        | 1       | no · 2 areas                             |
| Toast (`ToastProvider`, `useToast`)     | 3 (plus the shell)                           | yes    | yes     | no                        | 1       | yes                                      |
| Tooltip                                 | 0 (inside NavItem, Sidebar)                  | yes    | yes     | no                        | 1       | no · no direct product use               |
| Topbar                                  | 0 (shell)                                    | **no** | **no**  | no                        | 1       | no · shell only, no test, not in catalog |
| Upload                                  | 0                                            | yes    | yes     | no                        | 1       | no · no product use                      |

Summary: 37 components; 13 meet every criterion except the stability period (Alert, Avatar, Badge, Button, EmptyState,
FilterChip, Icon, Menu, Metric, Pagination, Skeleton, Table, Toast); one depends on domain types (TicketRow); six have
no test file of their own (Input, Radio, Select, Switch, Textarea, Topbar); five are missing from `/catalogo`
(Combobox, Field, SearchField, Sidebar, Topbar), which T7.1 closes. Because the numbers come from a count of
imports, re-measure on the day of the trigger instead of trusting this table.

## Consequences

- No new build, workspace or versioning to maintain; a change to a component and to its callers is one pull request.
- The criteria are written down, so extraction on the day of the trigger is a checklist, not a debate.
- Components keep a risk of coupling to the application (`lib` helpers, ticket types). `TicketRow` is the known case
  and would stay in the application when the package is cut.
- If a second consumer appears before the criteria hold, the work is to make the missing components pass (tests,
  catalog, no domain types), not to relax the criteria.

## Alternatives considered

- **Extract now into `packages/forma-ui`.** Rejected: no second consumer, no component has gone a phase unchanged, and
  tokens, `lib` helpers and the catalog would have to be split for a benefit nobody uses yet.
- **Publish to npm as a public package.** Rejected: the catalog is an internal tool of this project, not a product.
- **Adopt an existing UI library.** Rejected by the plan's fixed stack (no UI framework); the Figma kit defines the
  components.
- **Extract only the components that already meet the criteria.** Rejected: a half-extracted library forces two
  import paths and still needs the package machinery.
