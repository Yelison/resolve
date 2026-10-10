# 0002 · Adopt Forma UI for the shared components

- **Status:** accepted, 2026-10-10. It lands in the same pull request as the adoption.
- **Supersedes:** [0001](0001-forma-ui-extraction.md), in part: for Button, IconButton, Badge, Field, Input, Icon, Tooltip and Modal. 0001 still applies to every other component in `frontend/src/components/ui`.

## Context

0001 keeps Forma UI in this application until «a second real consumer exists: another application … that needs the components», and it excludes a prospective project.

**That trigger is not met literally.**

- Forma UI's documentation site documents the library itself; it is not another application.
- Draftroom is still a future project.

The owner decided to build Forma UI as a product of its own (`github.com/Yelison/forma-ui`, part of a portfolio) and to adopt it here. This ADR records that decision and how each of 0001's criteria is handled. It does not claim that 0001's trigger fired.

Forma UI extracted the components listed above. It kept their public API and behaviour, ported their tests, and added real-browser accessibility tests and axe checks. It publishes them on npm as `@yelison/forma-ui`, with provenance, through a release workflow. Resolve adopts the published version.

## The readiness criteria of 0001, measured at the adoption commit

The table below is measured on the code of the adoption pull request (this PR), with 0001's method; the commit that
squash-merges it carries its number. The pull request changes nothing the columns look at after the measurement
(documentation, tests and the CSS of the field controls only). The script is `measure-adr.mjs` in the task evidence;
what each column means:

- **Areas:** the folders of `frontend/src/features/*` with a non-test file that imports the component from
  `components/ui` (the shell, `app/pages` and `/catalogo` do not count).
- **Stability:** 0001's «a whole phase without changes». The components are now a published package at `0.1.0`: there is
  no earlier release, so no history to measure.
- **API documented:** members with JSDoc over members declared in the exported props types (`@yelison/forma-ui`'s `.d.ts`;
  `Button` counts `ButtonProps` and `ButtonStyleOptions`, `Field` counts `FieldProps` and `FieldControlProps`, `Tooltip`
  counts `TooltipProps` and `TooltipTriggerProps`).
- **No domain types:** the package's published modules import only `react` and their own modules.
- **Token-only values:** `px` literals in the published `styles.css`, with 0001's exclusions (borders, outlines,
  offsets of 1–2 px, breakpoints) and the distances of animations (see criterion 4 below).
- **Test and catalog:** a test file of its own in the package at the `@yelison/forma-ui@0.1.0` tag, and a `<Component>` in
  Resolve's catalog (`/catalogo`, development build).

| Component | 1 · areas (of 3 needed) | 1 · stable for a phase | 2 · API documented (JSDoc) | 3 · no domain types | 4 · token-only values | 5 · own test and catalog entry |
| --- | --- | --- | --- | --- | --- | --- |
| Button | 8 | no (package 0.1.0, no earlier release) | 6/6 | yes (imports only react and its own modules) | yes (no `px` literals) | test: yes; catalog: yes |
| IconButton | 2 | no (package 0.1.0, no earlier release) | 3/3 | yes (imports only react and its own modules) | yes (the one `px` literal is `--icon-size: 20px`, local to the component) | test: yes; catalog: yes |
| Badge | 5 | no (package 0.1.0, no earlier release) | 1/1 | yes (imports only react and its own modules) | yes (no `px` literals) | test: yes; catalog: yes |
| Field | 0 | no (package 0.1.0, no earlier release) | 11/11 | yes (imports only react and its own modules) | yes (no `px` literals) | test: yes; catalog: **no entry of its own** (rendered inside the Input, Select and Textarea entries) |
| Input | 5 | no (package 0.1.0, no earlier release) | 5/5 | yes (imports only react and its own modules) | yes (no `px` literals) | test: yes; catalog: yes |
| Icon | 4 | no (package 0.1.0, no earlier release) | 3/3 | yes (imports only react and its own modules) | yes (no CSS of its own: size by prop, 20 px by default) | test: yes; catalog: yes |
| Tooltip | 1 | no (package 0.1.0, no earlier release) | 11/11 | yes (imports only react and its own modules) | yes (no `px` literals) | test: yes; catalog: yes |
| Modal (Dialog) | 5 | no (package 0.1.0, no earlier release) | 8/8 | yes (imports only react and its own modules) | yes (no size literals; one 8 px animation offset, a motion exception) | test: yes; catalog: yes |

For reference, the measurement at `c3f02f8` found the following failures:
- **Stability:** every component failed criterion 1's stability clause.
- **Areas:** Field and Tooltip had 0 direct areas, and IconButton had 2, all against criterion 1's minimum of 3.
- **Literal sizes:** Button, Badge, Tooltip and Modal had literal sizes, against criterion 4.
- **Tests and catalog:** Input had no test file of its own and Field had no catalog entry, against criterion 5.

## How each failing criterion is handled

- **Criterion 1, stability.** No component could meet this clause, because the history was too short. It existed to stop extracting code that was still moving. Here the extraction is the change itself, and from now on Forma UI owns the code: its reviews, tests and semantic versioning replace the clause.
- **Criterion 1, areas.**
  - Field is used by no area directly, only inside Input, Select, Textarea and Combobox (0 areas). Tooltip is used
    directly by 1 area (`features/session`, the account menu of the sidebar profile) and otherwise inside NavItem, Sidebar and the charts.
  - IconButton is used in 2 areas (Customers and Team), but it lives in Button's file and shares its tokens and styles.

  The three travel as dependencies of components that qualify. None of them is adopted on its own merit.
- **Criterion 4.** Every literal size became a token in Forma UI with the same value: `--spinner-size`, `--badge-min-height`, `--tooltip-max-width`, `--dialog-width`, `--dialog-width-wide` and the `--z-*` scale. Nothing shifts visually. The `px` literals left in the published CSS are `--icon-size: 20px`, a custom property local to `IconButton` (the size of its icons, the default of `Icon`), and the `translateY(8px)` of the `@keyframes forma-dialog__enter`, the entrance of the dialog. That 8 px is a motion exception, like the borders and the 1–2 px offsets: a distance travelled by an animation, not a size of a box, and 0001's measurement did not count it either (`Modal.module.css` already had it).
- **Criterion 5.**
  - **Tests:** every component has its own test file in Forma UI, plus browser tests.
  - **Catalog:** the catalog requirement becomes «an entry in `/catalogo` (development build)». The `ui-copy` work keeps `/catalogo` only in development builds, and the parity test still applies there. Field still has no entry of its own: it is a dependency of Input and of Resolve's Select, Textarea and Combobox, and its label, hint and error show in every specimen of those.

## Decision

1. **Dependency.** Resolve depends on `@yelison/forma-ui` from npm, pinned to an exact version.
2. **Compatible barrel.** The extracted folders in `frontend/src/components/ui` become one-line re-exports from the package (`Button/Button.ts`, `Badge/Badge.ts`…): the sibling components that import `../Tooltip/Tooltip` or `../Button/Button` do not change, and neither does `components/ui/index.ts`, which keeps the same names and props, so feature code does not change either. `Modal` stays available as the package's alias of `Dialog`, with the same props, one to one (`open`, `onClose`, `title`, `description`, `footer`, `size`, `className`, `children`): no adapter is needed.
   - A diff of the resolved types of the barrel (134 exports before and after, each pull request against its own base) finds only additions: `flip` and a list for `icon` on `IconButton` (the first adoption pull request) and `announce` on `Field` and `Input` (this one), plus the parameter of `Modal` being named `DialogProps`, the same type as `ModalProps`.
   - The one DOM difference is the `<span>` that wraps the icons in `IconButton`, which changes neither the accessible name nor the layout. Comparing the computed style and the attributes of every element of the views listed under «Deliberate visual changes» finds no other.
3. **Tokens.** `@yelison/forma-ui/tokens.css` contains every token of Resolve's current `tokens.css` with its exact value, a semantic parity test in Forma UI guards this, and each case below differs from today only as described:

   | Token or group | In the package | Note |
   | --- | --- | --- |
   | The 26 colour tokens per theme, including `--color-nav*`, `--color-link` and `--color-progress-track` | yes, exact values | |
   | The AA values adjusted in code: #14 muted, #65 brand, brand-hover and link, #75 progress-track | yes, exact values | They stay as Resolve has them, not as in Figma |
   | Typography and spacing | yes | `--font-family` becomes `'Inter Variable', Inter, …`, the value `global.css` already sets today |
   | Library sizing, radius, motion, focus ring, overlay and shadow tokens (now in `global.css`) | yes, same values | |
   | New tokens (component sizes and the `--z-*` scale) | yes, added | |
   | App layout tokens: `--sidebar-*`, `--header-height`, `--page-gutter`, `--drawer-width`, `--reading-width` | no | They stay in Resolve's `global.css`, as Resolve's own layer on top |
   | Chart tokens: `--color-chart-1…4` (#109) and the sequential ramp `--color-chart-seq-1…4` | no | They stay in Resolve's own layer until Forma UI has charts; they are not part of the generated `tokens.css` |

   - `frontend/src/styles/tokens.css` and the identity-provider copy are generated from the package's file in the same commit, so `tokens.keycloak.test.ts` keeps its byte comparison.
   - `tokens.contrast.test.ts` keeps the same pairs, thresholds and parity; it now also reads Resolve's `chart-tokens.css`, because the chart tokens moved out of `tokens.css` into Resolve's own layer.
   - Resolve's public CSS variable names do not change.
4. **Base and app CSS.** `global.css` keeps Resolve's reset and app layout tokens and imports the package's `base.css`. The package's `styles.css` is imported first in the module that loads the components (`components/ui/index.ts`), because bundlers order CSS by chunk: imported only from `global.css`, it would reach the page after the CSS of Resolve's own components (the package README's order is the order inside one stylesheet; Vite links the CSS of a shared chunk before the entry point's). In the build `styles.css` opens `ui-*.css`, so a Resolve class passed as `className` has the same specificity as the package's rule and wins by order; where it matters the selector is also made more specific as a defence. Tests on the build pin both (see `docs/development/dependencies.md`).
   - **Resolve's control box.** `Input` is the package's, but `Select`, `Textarea` and `Combobox` stay Resolve's and share a control box in `components/ui/shared/control.module.css`. It was Field's `.control` and keeps the same rules, now with the package's focus ring (next point). It is the only visual rule of Field that Resolve keeps.
5. **Copy.** The package ships no copy in one language: its built-in strings default to English. Resolve installs `FormaProvider` with every built-in string in Spanish, and a Resolve test pins each one:

   | Key | Used by | Resolve's value |
   | --- | --- | --- |
   | `buttonLoading` | Button while `loading` | `Enviando…` |
   | `dialogClose` | `useFormaStrings()`, for a close button put in a Dialog footer | `Cerrar` (Resolve's dialogs carry their own «Cancelar» and do not read it today) |

   Tooltip, Badge, Field, Input and Icon have no built-in strings: all their text comes from props. If a later version of the package adds a key, the Dependabot pull request must add its Spanish value, and the test fails until it does.
6. **Theme.**
   - `useTheme` delegates to the package's `createThemeStore({ storageKey: 'resolve-theme' })`, a single store for the application, which keeps existing users' stored preferences (the key is the one Resolve always used). «System» still removes the key and follows the operating system live.
   - The first-paint script of `index.html` is now the output of `themeScript({ storageKey: 'resolve-theme' })`, byte for byte (not the equivalent code Resolve had: that one left a global variable behind; this one is block-scoped). A test pins it.
   - **CSP.** The backend admits the inline script by the SHA-256 hash of its content, which `ContentSecurityPolicy.java` computes when it starts from the `index.html` it serves, so no hash is written in code or documentation and nothing has to be updated; the script must stay the only inline script and reach `dist/` unchanged, and tests check both (including a run of the build under a hash-only policy). `index.html` is not reformatted (`<!-- prettier-ignore -->`).
7. **Updates.**
   - Dependabot opens a pull request for each new version, and Resolve's five required checks decide.
   - Patch releases merge automatically once the required checks pass (owner decision). Minor and major releases always get the owner's review, because a visual change needs one even when the checks pass.
8. **Changes to these components.** Behavioural or visual changes are made in Forma UI first and reach Resolve through a new version.
   - **Urgent fixes** ship as a Forma UI patch release.
   - **Only if that would block a Resolve release,** a temporary local override is allowed in `components/ui`. It carries a linked issue and is removed with the next Forma UI version.

## Deliberate visual changes

Comparing the computed style of the whole page, before and after, in both themes at 1440 and 390 px (`/catalogo`, tickets, a ticket, customers, team with the invite dialog open, settings and the global search, with hover and focus states and the sidebar tooltips), the package introduces these differences, decided by the owner:

- **The focus ring of the fields goes from 1 px to 2 px.** Resolve drew `outline: 1px solid var(--color-focus)`; the package's control draws `outline: var(--focus-ring)` (`2px solid`, the token the buttons use). So that no form mixes both, Resolve's own `Select`, `Textarea` and `Combobox` use the same token in this pull request (`shared/control.module.css`): the focus of every field is 2 px, like the buttons'. `SearchField`, which shares the filter bars of tickets, customers and the knowledge base with `Select`, moves to the same token too (owner decision: «2 px en todos»), so no field control keeps a 1 px ring: `Input`, `Select`, `Textarea`, `Combobox` and `SearchField` focus with `--focus-ring`, and a test measures them side by side in the build. `Combobox`'s list option rows keep their own rule (already 2 px). The editor's frame (`.editor:has(textarea:focus-visible)` in `Editor.module.css`) is not a field control and still draws 1 px; it is left for a later decision. The border colour and the offset (0) do not change.
- **Read-only fields** get a dashed border and the `--color-bg` background (`.forma-field-control[readonly]`), by Forma UI's rule that loading, disabled and read-only are different states. It will be the look of read-only fields the day they exist; Resolve uses no `readOnly` today. Resolve's own control box (`Select`, `Textarea`, `Combobox`) adopts the same rule, so it does not depend on the component: `shared/control.parity.test.ts` compares the declarations of every control rule of the package with Resolve's copy.
- **`prefers-reduced-motion` is respected:** the control's colour transition is removed for users who ask for it, as `Button` and `Dialog` already do; Resolve's control box has the same rule.

Nothing else differs, measured twice: on the development server with all the properties the first round chose, and on the production build (a showcase build of the base and of the branch, side by side) with every computed property, the box, the attributes and the pseudo-elements of each node, in both themes at 1440 and 390 px. The only changes besides the above are the clock and animated elements (spinners and skeletons) and the name of the dialog's `@keyframes` (`forma-dialog__enter`), with the same duration and frames.

## Consequences

- **The components are maintained in one place.** Resolve receives the accessibility and quality improvements made in Forma UI, for example the composable state selectors in Button. Some fixes, such as Tooltip's server-rendering one, do not affect Resolve, which renders only in the browser.
- **The version Resolve runs is explicit.** A change Resolve needs waits for a Forma UI release, or takes the urgent path above. Exact pinning keeps the running version visible.
- **Domain and shell components stay here, under 0001.** That covers TicketRow, Message, Editor, Timeline, Sidebar, Topbar and the rest of the catalog. The next families to extract (Checkbox, Switch, Tabs, NavItem) will be measured against 0001's criteria and recorded by amending this ADR.
- **0001 is marked «Superseded in part by 0002»** for the eight components above, in the same pull request.
- **One scroll lock.** The drawer of the shell (`shared/useModalDialog.ts`) locks the page scroll with the package's public `useScrollLock`, the same counter and the same class (`forma-scroll-locked`, from `base.css`) as the package's `Dialog`. A dialog opened over the open drawer (the account menu lives in the drawer on mobile) and closed again leaves the lock and the scrollbar compensation as the drawer needs them; an e2e with classic scrollbars checks it. Resolve's own `lib/scrollLock` and `html.scroll-locked` are gone.
- **Copies of helpers the package does not export.** Until the drawer and `Menu` have a counterpart in the package, Resolve keeps its own `useModalDialog` (the drawer's, which also uses the package's `useScrollLock`) and its own `useFloating` and `position` (for `Menu`), next to the copies inside the package's `Dialog` and `Tooltip`. They are part of the initial JavaScript and the reason it does not shrink with the extraction.
