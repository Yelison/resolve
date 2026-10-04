# Resolve

A customer-support platform (tickets, customers, team, reports and a knowledge base) built from a complete Figma design, with a focus on accessibility, responsive behaviour and a shared component library. The interface is in Spanish.

[![CI](https://github.com/Yelison/resolve/actions/workflows/ci.yml/badge.svg)](https://github.com/Yelison/resolve/actions/workflows/ci.yml)

> **Status:** work in progress. The design system, the shared components (internally called **Forma UI**) and the application shell are done. Product views (tickets, customers, reports…) and the Spring Boot API come next; until then each section says so instead of showing fake screens.

| Desktop shell | Mobile drawer (dark) |
| --- | --- |
| ![Desktop shell with the expanded sidebar](docs/screenshots/shell-desktop.png) | ![Mobile navigation drawer in dark mode](docs/screenshots/drawer-mobile.png) |

| Component catalog (`/catalogo`) | Ticket table adapting to its container, from the catalog (dark) |
| --- | --- |
| ![Forma UI catalog](docs/screenshots/catalog-light.png) | ![Ticket table as cards, priority columns and full table](docs/screenshots/tickets-dark.png) |

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

- **Design tokens from Figma, not by hand.** Colors (light and dark), spacing and type styles are generated from the Figma variables into [`tokens.css`](frontend/src/styles/tokens.css), and the 23 icons into typed path data, by an export tool that runs inside Figma (kept outside this repository). Dark mode is a pure token swap that follows `prefers-color-scheme` unless the user picks a theme, and an inline script applies the choice before the first paint.
- **Accessible by construction.** Components follow the WAI-ARIA Authoring Practices: menu button, tabs, toolbar, dialogs on native `<dialog>` (focus trap, Escape, focus return), tooltips that also appear on focus and can be dismissed (WCAG 1.4.13), labelled fields with announced errors, 44 px touch targets on small screens, a skip link and `prefers-reduced-motion`.
- **Responsive by content, not by device.** Two breakpoints (768 and 1200 px) drive the shell: a drawer on mobile, an icon sidebar on tablets and a collapsible sidebar on desktop. The ticket table uses container queries, so the same component renders as cards, priority columns or a full table depending on the space it gets.
- **Honest UI.** No fake success states: actions without a backend say they are not connected yet, and demo data is labelled as such.
- **Tested.** About 130 unit and component tests with coverage thresholds, plus Playwright checks for horizontal overflow at 320–1440 px (including the 767/768 and 1199/1200 edges) in both themes, drawer focus handling and the persisted sidebar state.

## Project structure

```
frontend/
  src/
    app/            # Shell, routes, pages, theme and the /catalogo route
    components/ui/  # Forma UI: one folder per component (tsx, module.css, tests)
    domain/         # Pure domain types shared with the future API
    lib/            # Framework-free helpers (positioning, formatting, scroll lock…)
    styles/         # Generated tokens and global styles
  e2e/              # Playwright specs
backend/            # Spring Boot API (scaffold, migrations in db/migration)
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
docker compose up -d   # from the repository root
cd backend
./mvnw spring-boot:run # http://localhost:8080/api, proxied by Vite at /api
```

The API reads `DATABASE_URL`, `DATABASE_USERNAME` and `DATABASE_PASSWORD`, with defaults that match `docker-compose.yml` (development only).

### Frontend scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `preview` | Develop, build and serve the production build |
| `npm test` / `test:watch` / `coverage` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Playwright against a production build |
| `npm run lint` / `typecheck` / `format:check` | oxlint, `tsc -b` and Prettier |

## Design decisions

The Figma frames are the visual reference. Where they conflict with the written responsive and accessibility rules, the rules win:

- **Touch targets:** buttons and fields keep the 42/40 px Figma height on desktop and grow to 44 px below 768 px; icon buttons are always 44 px.
- **Focus:** a shared 2 px outside focus ring replaces the 2 px inside stroke of the Figma focus variants, so focusing never shifts layout.
- **Navigation:** nav items fill the sidebar width (Figma hugs the label); the mobile header is 56 px (64 in the frame); the drawer can be up to 280 px wide and has *Cerrar menú* (close) instead of *Colapsar menú* (collapse).
- **Panels:** dialogs use the 12 px panel radius; the large avatar is 48 × 48 (21 × 48 in the frame).
- **Editor:** the toolbar applies Markdown, so underline is left out.
- **Text-only placeholders** in Figma (pagination, breadcrumb, editor toolbar, search) are implemented as real, keyboard-operable controls.

## Roadmap

- [x] Design tokens, icons and theming
- [x] Forma UI components with tests and a living catalog
- [x] Application shell: sidebar, topbar, mobile drawer
- [ ] Ticket inbox, ticket detail and new ticket views
- [ ] Customers, team, reports, knowledge base and settings views
- [ ] Spring Boot API (tickets, customers, auth) with Flyway migrations
- [ ] Wire the views to the API with TanStack Query

## License

The code written for this project is released under the [MIT License](LICENSE), © 2026 Yelison Ortiz.

Third-party software keeps its own license and attribution:

- npm and Maven dependencies are distributed under their respective licenses, listed in each package.
- The Inter typeface is bundled through [Fontsource](https://fontsource.org/fonts/inter) under the [SIL Open Font License 1.1](https://github.com/rsms/inter/blob/master/LICENSE.txt), © The Inter Project Authors.
- The Maven Wrapper scripts (`backend/mvnw`, `backend/mvnw.cmd`) are licensed under the Apache License 2.0, as stated in their headers.
