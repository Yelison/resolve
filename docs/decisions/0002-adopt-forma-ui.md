# 0002 · Adopt Forma UI for the shared components

- **Status:** accepted, 2026-10-10. It landed with the adoption, in #120 (Button, IconButton, Icon) and #121 (the rest); the tokens came in #114.
- **Supersedes:** [0001](0001-forma-ui-extraction.md), in part: for Button, IconButton, Badge, Field, Input, Icon, Tooltip and Modal. [Amendment 1](#amendment-1--020-tabs-and-radio) adds Tabs and Radio, [Amendment 3](#amendment-3--040-avatar-searchfield-and-select) adds Avatar, SearchField and Select, [Amendment 4](#amendment-4--050-filterchip-initialsof-and-the-reset-layer) adds FilterChip, and [Amendment 5](#amendment-5--060-menu-and-alert) adds Menu and Alert (Amendment 2 moves literal sizes into tokens and adds no component). 0001 still applies to every component in `frontend/src/components/ui` that none of the amendments lists.

## Context

0001 keeps Forma UI in this application until «a second real consumer exists: another application … that needs the components», and it excludes a prospective project.

**That trigger is not met literally.**

- Forma UI's documentation site documents the library itself; it is not another application.
- Draftroom is still a future project.

The owner decided to build Forma UI as a product of its own (`github.com/Yelison/forma-ui`, part of a portfolio) and to adopt it here. This ADR records that decision and how each of 0001's criteria is handled. It does not claim that 0001's trigger fired.

Forma UI extracted the components listed above. It kept their public API and behaviour, ported their tests, and added real-browser accessibility tests and axe checks. It publishes them on npm as `@yelison/forma-ui`, with provenance, through a release workflow. Resolve adopts the published version.

## The readiness criteria of 0001, measured at the adoption commit

The table below is measured on the code of the adoption pull request (#121), with 0001's method; the commit that
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

| Component      | 1 · areas (of 3 needed) | 1 · stable for a phase                 | 2 · API documented (JSDoc) | 3 · no domain types                          | 4 · token-only values                                                     | 5 · own test and catalog entry                                                                       |
| -------------- | ----------------------- | -------------------------------------- | -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Button         | 8                       | no (package 0.1.0, no earlier release) | 6/6                        | yes (imports only react and its own modules) | yes (no `px` literals)                                                    | test: yes; catalog: yes                                                                              |
| IconButton     | 2                       | no (package 0.1.0, no earlier release) | 3/3                        | yes (imports only react and its own modules) | yes (the one `px` literal is `--icon-size: 20px`, local to the component) | test: yes; catalog: yes                                                                              |
| Badge          | 5                       | no (package 0.1.0, no earlier release) | 1/1                        | yes (imports only react and its own modules) | yes (no `px` literals)                                                    | test: yes; catalog: yes                                                                              |
| Field          | 0                       | no (package 0.1.0, no earlier release) | 11/11                      | yes (imports only react and its own modules) | yes (no `px` literals)                                                    | test: yes; catalog: **no entry of its own** (rendered inside the Input, Select and Textarea entries) |
| Input          | 5                       | no (package 0.1.0, no earlier release) | 5/5                        | yes (imports only react and its own modules) | yes (no `px` literals)                                                    | test: yes; catalog: yes                                                                              |
| Icon           | 4                       | no (package 0.1.0, no earlier release) | 3/3                        | yes (imports only react and its own modules) | yes (no CSS of its own: size by prop, 20 px by default)                   | test: yes; catalog: yes                                                                              |
| Tooltip        | 1                       | no (package 0.1.0, no earlier release) | 11/11                      | yes (imports only react and its own modules) | yes (no `px` literals)                                                    | test: yes; catalog: yes                                                                              |
| Modal (Dialog) | 5                       | no (package 0.1.0, no earlier release) | 8/8                        | yes (imports only react and its own modules) | yes (no size literals; one 8 px animation offset, a motion exception)     | test: yes; catalog: yes                                                                              |

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

   | Token or group                                                                                            | In the package    | Note                                                                                                        |
   | --------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------- |
   | The 26 colour tokens per theme, including `--color-nav*`, `--color-link` and `--color-progress-track`     | yes, exact values |                                                                                                             |
   | The AA values adjusted in code: #14 muted, #65 brand, brand-hover and link, #75 progress-track            | yes, exact values | They stay as Resolve has them, not as in Figma                                                              |
   | Typography and spacing                                                                                    | yes               | `--font-family` becomes `'Inter Variable', Inter, …`, the value `global.css` already sets today             |
   | Library sizing, radius, motion, focus ring, overlay and shadow tokens (now in `global.css`)               | yes, same values  |                                                                                                             |
   | New tokens (component sizes and the `--z-*` scale)                                                        | yes, added        |                                                                                                             |
   | App layout tokens: `--sidebar-*`, `--header-height`, `--page-gutter`, `--drawer-width`, `--reading-width` | no                | They stay in Resolve's `global.css`, as Resolve's own layer on top                                          |
   | Chart tokens: `--color-chart-1…4` (#109) and the sequential ramp `--color-chart-seq-1…4`                  | no                | They stay in Resolve's own layer until Forma UI has charts; they are not part of the generated `tokens.css` |
   - `frontend/src/styles/tokens.css` and the identity-provider copy are generated from the package's file in the same commit, so `tokens.keycloak.test.ts` keeps its byte comparison.
   - `tokens.contrast.test.ts` keeps the same pairs, thresholds and parity; it now also reads Resolve's `chart-tokens.css`, because the chart tokens moved out of `tokens.css` into Resolve's own layer.
   - Resolve's public CSS variable names do not change.

4. **Base and app CSS.** `global.css` keeps Resolve's reset and app layout tokens and imports the package's `base.css`. The package's `styles.css` is imported first in the module that loads the components (`components/ui/index.ts`), because bundlers order CSS by chunk: imported only from `global.css`, it would reach the page after the CSS of Resolve's own components (the package README's order is the order inside one stylesheet; Vite links the CSS of a shared chunk before the entry point's). In the build `styles.css` opens `ui-*.css`, so a Resolve class passed as `className` has the same specificity as the package's rule and wins by order; where it matters the selector is also made more specific as a defence. Tests on the build pin both (see `docs/development/dependencies.md`).
   - **Resolve's control box.** `Input` is the package's, but `Select`, `Textarea` and `Combobox` stay Resolve's and share a control box in `components/ui/shared/control.module.css`. It was Field's `.control` and keeps the same rules, now with the package's focus ring (next point). It is the only visual rule of Field that Resolve keeps.
5. **Copy.** The package ships no copy in one language: its built-in strings default to English. Resolve installs `FormaProvider` with every built-in string in Spanish, and a Resolve test pins each one:

   | Key             | Used by                                                        | Resolve's value                                                                  |
   | --------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
   | `buttonLoading` | Button while `loading`                                         | `Enviando…`                                                                      |
   | `dialogClose`   | `useFormaStrings()`, for a close button put in a Dialog footer | `Cerrar` (Resolve's dialogs carry their own «Cancelar» and do not read it today) |

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
- **Domain and shell components stay here, under 0001.** That covers TicketRow, Message, Editor, Timeline, Sidebar, Topbar and the rest of the catalog. Tabs and Radio were measured and recorded in Amendment 1; the next families to extract (Checkbox, Switch, NavItem) will be measured against 0001's criteria and recorded by amending this ADR in the same way.
- **0001 is marked «Superseded in part by 0002»** for the eight components above, in the same pull request.
- **One scroll lock.** The drawer of the shell (`shared/useModalDialog.ts`) locks the page scroll with the package's public `useScrollLock`, the same counter and the same class (`forma-scroll-locked`, from `base.css`) as the package's `Dialog`. A dialog opened over the open drawer (the account menu lives in the drawer on mobile) and closed again leaves the lock and the scrollbar compensation as the drawer needs them; an e2e with classic scrollbars checks it. Resolve's own `lib/scrollLock` and `html.scroll-locked` are gone.
- **Copies of helpers the package does not export.** Until the drawer and `Menu` have a counterpart in the package, Resolve keeps its own `useModalDialog` (the drawer's, which also uses the package's `useScrollLock`) and its own `useFloating` and `position` (for `Menu`), next to the copies inside the package's `Dialog` and `Tooltip`. They are part of the initial JavaScript and the reason it does not shrink with the extraction.

## Amendment 1 · 0.2.0: Tabs and Radio

- **Status:** accepted, 2026-10-10. It landed in #128, which adopts `@yelison/forma-ui` 0.2.0.
- **Scope:** it adds Tabs and Radio to the components that 0001 no longer covers, and the catalog's icon list (`iconNames`). Every other component stays under 0001. Checkbox and Switch are not part of it: they keep `shared/choice.module.css`, which Radio no longer uses.

This is the amendment this ADR announced: the next families are measured with 0001's criteria and recorded here. The method is the same as for the adoption; the measured code is the one of this pull request.

### The readiness criteria of 0001, measured

Same columns and rules as the table above (areas, JSDoc over the members declared in the props types, imports of the published modules, `px` literals in the published `styles.css`, tests of the package at the `@yelison/forma-ui@0.2.0` tag, entry in `/catalogo`). The only change to the script is that `outline-offset` is counted unless it is 1–2 px, under the strict reading of 0001 (it excludes «outlines and 1–2 px offsets», and this reading counts a larger offset); the first adoption excluded every `outline*` property, which would have hidden the 4 px below. For Radio the literals of `.forma-shared-choice`, the base it is built on, are counted too, and Tabs counts `TabsProps` and `TabItem`.

| Component | 1 · areas (of 3 needed)                     | 1 · stable for a phase                | 2 · API documented (JSDoc) | 3 · no domain types                          | 4 · token-only values                                                                                                             | 5 · own test and catalog entry |
| --------- | ------------------------------------------- | ------------------------------------- | -------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Tabs      | 4 (customers, knowledge, settings, tickets) | no (new in 0.2.0, no earlier release) | 9/9                        | yes (imports only react and its own modules) | **no:** `outline-offset: 4px` on the focused panel (`.forma-tabs__panel:focus-visible`)                                           | test: yes; catalog: yes        |
| Radio     | 3 (knowledge, session, settings)            | no (new in 0.2.0, no earlier release) | 1/1                        | yes (imports only react and its own modules) | **no:** `min-height: 36px` in the shared base `.forma-shared-choice`; the dot (`--space-8`) and the box (`--space-20`) are tokens | test: yes; catalog: yes        |

- **Areas.** Both reach 3 or more areas by themselves, so the justification used for Field and Tooltip (they travel as dependencies of components that qualify) does not apply, and none is needed. Radio is the narrow one, with exactly 3: Settings (the theme), the article's publication panel and the organisation switcher of the session.
- **Stability.** As for the first eight, the clause cannot be met: the package has no earlier release of these components. Resolve's own copies were ported with the same logic (the sources of `Tabs` and `Radio` match the package's compiled modules); the CSS of Radio differs only in the `:indeterminate` correction and in `prefers-reduced-motion`, both described below, and from now on Forma UI's reviews, tests and versioning replace the clause.
- **Criterion 4, two failures.** Both literals already existed in Resolve (`Tabs.module.css` had the 4 px offset; `choice.module.css` has the 36 px, still used by Checkbox and Switch). They are not a visual change, and they do not block the adoption. The owner decided: Forma UI turns both into tokens in `@yelison/forma-ui@0.2.1`, a patch release with no visual change (the 36 px as a choice-height token, the 4 px as a panel focus-offset token), following the precedent of `--badge-min-height` and the other literal sizes. Until it is published they stay in the package as they were here, so the table says «no» for 0.2.0, which is what was measured. Resolve receives the tokens when it bumps the pin to 0.2.1 and runs `npm run sync:forma-tokens`, which will show whether `tokens.css` changes.
- **`iconNames`.** The list of the 23 icon names that `app/catalog/catalogData.ts` kept by hand, with a `satisfies Record<IconName, true>` to fail `tsc` when it drifted, is replaced by the package's `iconNames`, which is generated with the icon table and cannot drift. It has the same names in the same order, so `/catalogo` shows the same icons. The catalog imports it from `@yelison/forma-ui` and not from `components/ui`: the barrel only re-exports what the features use, and the catalog is a development tool. Besides the re-exporting folders of `components/ui`, the entry points (`AppProviders`, the theme modules, `formaStrings`, `useModalDialog`) and the stylesheets, that file is the only module that imports the package directly.

### Decision

Resolve adopts Tabs and Radio from `@yelison/forma-ui@0.2.0`, with the same decisions as the first eight:

1. **Dependency and tokens.** Exact version `0.2.0`. The tokens of 0.2.0 are those of 0.1.0: after `npm run sync:forma-tokens` the only change in the two generated copies is the version in their header (an empty diff once the header is removed, and `tokens.sync.test.ts` passes), so there is no visual change to decide.
2. **Compatible barrel.** `Tabs/Tabs.ts` and `Radio/Radio.ts` are one-line re-exports; their `.tsx`, CSS Modules and tests are gone. A diff of the resolved types of the barrel, before and after (134 exports each, against the base of this pull request) is empty: the same names, props and types. No import of `features/**` changes. `shared/choice.module.css` stays, and nothing but Checkbox and Switch imports it.
3. **Copy.** Neither component has built-in strings, so `FormaProvider` needs no new key.

### Visual and behavioural differences

Measured as for the adoption, on computed styles, box, attributes and pseudo-elements of every node, with the base (`bb36b8e`, 0.1.0) and the tip served side by side, in both themes at 1440 and 390 px:

- **`/catalogo`** (development server in `showcase` mode, because the route only exists there): the whole page, and the states of Tabs (at rest, hover on an unselected tab, keyboard focus on the selected one, an arrow key, `Tab` to the panel, a click) and of Radio (at rest, hover, keyboard focus, checked), with a Checkbox as a control. 64 scenes.
- **The build** (`vite build --mode showcase` of both, served with `vite preview`): Settings (company, appearance and permissions, with the states of its tabs and its radios), a ticket and a customer (their tabs), the new article (tabs and the visibility radios) and the mobile drawer. 166 scenes.

**No computed property, box, attribute or pseudo-element differs, in any of the 230 scenes** (the only noise discarded is the milliseconds of `datetime` in `<time>`, the clock). The focus ring of the radio that the package now draws itself (`outline: var(--focus-ring)` with a 2 px offset, border included) is the one Resolve's global `:focus-visible` rule already gave it, and the tabs' ring is the same global rule too, so nothing changes. Three things the dump cannot see, declared here:

- **`prefers-reduced-motion` on Radio.** The package removes the colour transition of the radio's input for users who ask for it, as it does for Button and Dialog. Radio now respects it; Checkbox and Switch, which keep Resolve's `choice.module.css`, do not yet.
- **State selectors with `:where()`.** The package writes the hover and selected state of a tab, and the checked and disabled state of a radio, with `:where()`, so they have a specificity of one class instead of two. A Resolve class passed to either component that sets the same property now wins over those states, where before it lost. The cascade rules above apply (see `docs/development/dependencies.md`), and today two Resolve rules reach them (the row height of the theme options and the panel's inward focus ring), and neither sets a state property.
- **A group of radios with no option checked.** Resolve's shared base styled `:indeterminate` like `:checked`, and a radio matches `:indeterminate` while no option of its group is checked, so a group without a selection used to look fully checked, with every dot visible. The package styles only `:checked`, so that group now looks empty. It is a correction in the package, and Resolve cannot show it today: the theme options, the article's visibility and the organisation switcher always start with one option checked. Checkbox keeps `:indeterminate`, which is correct for a checkbox.

Not covered by the dump: the organisation switcher's radios (the `Cambiar de organización` dialog). The demo user of the static build belongs to a single organisation and the menu does not offer the change, so the dialog cannot be opened there. It uses the same `Radio` as the three contexts above; `e2e/session.spec.ts` and `e2e/scroll-lock.spec.ts` open it against a mock with two organisations and pass.

### Inherited behaviour of Tabs

When a controlled parent refuses a tab (`onChange` does not change `value`), the focus still moves to that tab, but the next arrow key starts from the **selected** tab, not from the focused one: from `Conversation`, with `Activity` refused, `ArrowRight` focuses `Activity` again instead of moving on to `Files`. It is the behaviour Resolve's Tabs had and the package keeps, it is not changed here, and it is pinned in `Tabs/Tabs.test.tsx` (the package's own test checks only the first arrow after a refusal). Settings, where the parent navigates on every change, is not affected.

### Weight

Initial JavaScript and CSS (`index-*` and the preloaded `ui-*` of `npm run build`), before and after: JavaScript 578 456 → 578 626 bytes (+170; gzip 176 792 → 176 953, +161) and CSS 83 934 → 85 361 bytes (+1 427; gzip 15 498 → 15 610, +112). The CSS grows because the package's rules for Tabs and Radio are longer than the ones that left (explicit `box-sizing`, focus rings, the reduced-motion rule) and the shared choice base now exists twice: the package's, for Radio, and Resolve's, for Checkbox and Switch.

### Pending

- **Criterion 4** (above): resolved in 0.2.1, see Amendment 2.
- **Checkbox and Switch** are the next family of the same base. Moving them removes `shared/choice.module.css` and the duplicate of the base, and gives them the reduced-motion rule.

## Amendment 2 · 0.2.1: the last literal sizes become tokens

- **Status:** accepted, 2026-10-10. Resolve pins `@yelison/forma-ui` 0.2.1 (Forma UI #62 and #64) and runs `npm run sync:forma-tokens`.
- **What changes.** The package turns its four remaining `px` literals into tokens with the same values. Two are the criterion 4 failures of Amendment 1: `--choice-min-height: 36px` (the shared base of the choice controls) and `--tabs-panel-focus-offset: 4px` (the focused tab panel). The other two were accepted in the first adoption: `--icon-button-glyph-size: 20px` (the icons inside `IconButton`, formerly the local `--icon-size`) and `--dialog-enter-offset: 8px` (the distance of the dialog's entrance animation, formerly the motion exception). With them, Tabs and Radio meet criterion 4, and the published CSS has no literal sizes left.
- **No visual change.** Every value is the one it replaces; Forma UI's browser tests check the computed values. In Resolve, `tokens.css` and its Keycloak copy gain the four declarations and nothing else, and none of the names clashes with Resolve's own layer (`tokens.sync.test.ts`).
- **Why it does not merge by itself.** A patch that adds or changes tokens fails `tokens.sync.test.ts` on purpose, so it goes through `sync:forma-tokens` and a review. Patches that only touch component code or CSS still auto-merge (see `docs/development/dependencies.md`).

## Amendment 3 · 0.4.0: Avatar, SearchField and Select

- **Status:** accepted, 2026-10-13. It lands in #159, which adopts `@yelison/forma-ui` 0.4.0 (Forma UI #67, #68 and #69).
- **Scope:** it adds Avatar, SearchField and Select to the components that 0001 no longer covers, and the eight icons of 0.4.0. Every other component stays under 0001. Checkbox and Switch still keep `shared/choice.module.css`. `shared/control.module.css` stays too: `Textarea` and `Combobox` import it, and nothing that left does.

The three components left `components/ui`; the method is the one of Amendments 1 and 2, and the measured code is the one of this pull request.

### The readiness criteria of 0001, measured

Same columns and rules as Amendment 1 (areas, JSDoc over the members declared in the props types, imports of the published modules, `px` literals in the published `styles.css`, tests of the package at the `@yelison/forma-ui@0.4.0` tag, entry in `/catalogo`). For SearchField and Select the literals of `.forma-field-control`, the box they are built on, are counted too, and Avatar counts `AvatarProps`.

| Component   | 1 · areas (of 3 needed)                                             | 1 · stable for a phase                | 2 · API documented (JSDoc) | 3 · no domain types                          | 4 · token-only values                                                | 5 · own test and catalog entry |
| ----------- | ------------------------------------------------------------------- | ------------------------------------- | -------------------------- | -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------ |
| Avatar      | 4 (customers, reports, settings, team)                              | no (new in 0.4.0, no earlier release) | 6/6                        | yes (imports only react and its own modules) | yes (no `px` literals: the three sizes are `--avatar-size-*` tokens) | test: yes; catalog: yes        |
| SearchField | 6 (customers, knowledge, search, session, team, tickets)            | no (new in 0.4.0, no earlier release) | 4/4                        | yes (imports only react and its own modules) | yes (no `px` literals; the icon is `--control-icon-size`)            | test: yes; catalog: yes        |
| Select      | 7 (customers, knowledge, reports, session, settings, team, tickets) | no (new in 0.4.0, no earlier release) | 5/5                        | yes (imports only react and its own modules) | yes (no `px` literals)                                               | test: yes; catalog: yes        |

- **Areas.** All three reach 3 or more by themselves; none needs the dependency argument. Avatar is also used inside Sidebar, Message and the team and customer tables, which are not counted.
- **Stability.** As in the earlier amendments, the clause cannot be met: the package has no earlier release of these components, and Forma UI's reviews, tests and versioning replace it.
- **Criterion 4.** None fails. The sizes that were literals in Resolve (`28px`, `36px` and `48px` of Avatar; the 20 px of the icon in a field) are tokens now, with the same values.

### Decision

Resolve adopts Avatar, SearchField and Select from `@yelison/forma-ui@0.4.0`, with the decisions of the first adoption:

1. **Dependency and tokens.** Exact version `0.4.0`. `npm run sync:forma-tokens` adds four tokens, all additive: `--control-icon-size` (20px) and `--avatar-size-small`, `--avatar-size-medium` and `--avatar-size-large` (28px, 36px and 48px). No token that existed changes its value, and `tokens.sync.test.ts` passes.
2. **Compatible barrel.** `Avatar/Avatar.ts`, `SearchField/SearchField.ts` and `Select/Select.ts` are one-line re-exports; their `.tsx`, CSS Modules and tests are gone. A diff of the resolved types of the barrel before and after (135 exports each, against the base of this pull request) finds:
   - **Additions:** `tone` on Avatar; `announce` on Select; `hideLabel` on Input, Field and, through them, the components that extend them; and the eight new names in the unions of `IconName`.
   - **A deliberate narrowing.** `SearchFieldProps` no longer has `defaultValue` or `children`: the package omits them, because the field is always controlled (`value` and `onValueChange`). Nothing in Resolve uses them, so no import or call site changes, and it is not a break for the application. The `ref` that `Menu` passes to `SearchField` still reaches the `<input>`.
   - No import of `features/**` changes.
3. **Copy.** `FormaStrings` gets no new key in 0.4.0 (it still has `buttonLoading` and `dialogClose`), so `app/formaStrings.ts` does not change.
4. **Initials.** The package exports no helper for them, only `Avatar`. `components/ui/Avatar/initials.ts` stays in Resolve, with the package's logic, because `WorkspaceMark` cuts the initials of a workspace with it and a workspace and an avatar must cut them the same way. `initials.test.tsx` compares `initialsOf(name)` with the text the package's `<Avatar>` draws, for ten names, so a change in the package shows up as a failing test. Pending for Forma UI: export the helper, and Resolve deletes the file.

### Visual and behavioural differences

Measured as in Amendment 1, on computed styles, box, attributes and pseudo-elements of every node, with the base (`da3945d`, 0.3.0) and the tip served side by side, in both themes at 1440 and 390 px:

- **The build** (`vite build --mode showcase`, 252 scenes): Team (members, load and invitations), Customers (directory and a customer), Reports (agents), Settings (general, company, workspaces and permissions), a ticket with its messages, the global search, the collapsed sidebar and the mobile drawer; each SearchField and Select at rest, with hover, with keyboard focus, with text and after Escape.
- **`/catalogo`** (development server in `showcase` mode, 36 scenes).
- **Loading skeletons**, with the request held in the production build: the `avatarGhost` of the customers directory and the `placeholderAvatar` of the team load panel, and the search of the workspace switcher in the drawer and in the menu with 9 workspaces.

**Avatar and Select: no computed property, box, attribute or pseudo-element differs**, apart from the four new custom properties, which the dump of computed styles lists on every node. The `.avatarGhost.avatarGhost` rule keeps winning (its two classes beat the one of `.forma-avatar__blue` by specificity, not by order), and `.placeholderAvatar` still wins by order: `e2e/production-bundle.spec.ts`, which pins it, passes.

**SearchField.** These differences are decided:

- **It takes the box of `Input`** (decided by the owner, in the name of the shared design system). The background goes from `--color-bg` to `--color-surface` (`rgb(245, 247, 251)` to `rgb(255, 255, 255)` in light, `rgb(11, 18, 32)` to `rgb(20, 31, 50)` in dark), with the hover and focus states of `Input`. It shows in the hero of the knowledge base, the global search, the workspace switcher, the filter bars of tickets, customers and team, and `Menu`. The border is the same token as before (`--color-line`), so the field is as visible as an `Input`. Against a white panel that border is about 1.2:1, the same as every `Input`: a fact of the design system, not a regression of this change. What does go is the faint tinted fill.
- **The DOM.** The box moves from the `<label>` to the `<input>`, so the padding and the border go down to the input, the cursor over the field is the text one, and there is one more node (the package's `Field` container). `fieldClassName` now reaches that container and `className` the input.
- **No height changes**, except where a screen drew the box itself (next point), and the example field of `/catalogo` (development server only): its box no longer stretches to the 89 px of its row and measures 40 px at 1440.

Two screens did draw the box themselves, and the first measurement found them broken:

- **The hero of the knowledge base** (`KnowledgeHero.module.css`) painted the height, the border and the background on `fieldClassName`, which was the box. With 0.4.0 those rules fell on the container: a white strip under a 40 px field, the border `--hero-field-border` lost and, in the light theme, the typed text white on white. The hero now puts the flex on the container and the box rules on the input (`className`), with a text colour of its own.
- **The workspace search in the mobile drawer** (8 workspaces or more) inherited the drawer's light text over its `--color-surface` background, about 2:1 in the light theme. `WorkspaceMenu.module.css` sets the colour on the input.

The cause is the same: the package's rule for the control's colour is written in `:where()`, with specificity 0, so a parent's colour reaches it (the reset's `input { color: inherit }` wins). Each case has an e2e that measures the contrast of the typed text (at least 4.5), with its mutation. Both are reported to Forma UI, which can fix them once for every consumer; the local rules can then go.

**Escape.** What a person sees does not change in any of the three places:

- **Global search:** Escape always closes the dialog, with or without text (the capture phase wins, and `GlobalSearch.test.tsx` pins it).
- **The workspace switcher and `Menu`:** the first Escape empties the field and the second closes. The package's SearchField now also stops the event when it empties the field, so nothing above sees that first Escape; neither `Menu` nor the switcher needed it (their handlers closed only with the field empty).
- **The switcher inside the mobile drawer** (the case no test covered): a new e2e checks that the first Escape empties the field and keeps the drawer open, and the second closes it and returns the focus to the menu button. It passes on the base too. A `type="search"` field empties itself with Escape in the browser, but it is the package's `preventDefault` that keeps the drawer's `<dialog>` open on that first Escape, so the test depends on it and fails without it (checked by mutation).

**Initials.** The package cuts them by user-perceived character, so an accent written as a combining mark or an emoji stays whole, and `toUpperCase()` takes no language, with `ß` left as `ß`; an empty `name` now hides the avatar from assistive technology, and a new `src` is tried after one that failed. Resolve's avatars were already decorative wherever a name sits beside them, so no screen changes; `WorkspaceMark` follows the same logic through `initials.ts`.

### Weight

Initial JavaScript and CSS (`index-*` and the preloaded `ui-*` of `npm run build`), before and after: JavaScript 668 610 → 670 219 bytes (+1 609; gzip 202 810 → 203 418, +608) and CSS 125 695 → 126 451 bytes (+756; gzip 22 281 → 22 381, +100). The package's `SearchField` and `Select` carry the table of icon paths with them, and it grew by eight icons.

### Pending

- **Forma UI:** export the initials helper; let `:where()` rules not lose to an inherited colour; say in the changelog that `fieldClassName` of SearchField moved from the box to its container. *Done in 0.5.0 (Amendment 4): `initialsOf` is exported, the colour of a control has the specificity of a class, and the changelog and README say where each class goes.*
- **Checkbox and Switch** are still the next family of the same base.
- **Resolve, when it adopts Forma UI 0.5.0:** *all three done in Amendment 4.*
  - Remove `color: var(--color-ink)` from `.search .input` in `KnowledgeHero.module.css`, and the `.panel .searchInput` rule with its `className` in `WorkspaceMenu`: the package will give the control a colour of its own. The contrast e2e tests of both stay.
  - Move the element reset of `styles/global.css` into `@layer base`.
  - Delete `Avatar/initials.ts` and its guardian, because the package will export `initialsOf`; `WorkspaceMark` imports it from there.

## Amendment 4 · 0.5.0: FilterChip, `initialsOf` and the reset layer

- **Status:** accepted, 2026-10-13. It lands in #160, which adopts `@yelison/forma-ui` 0.5.0 (Forma UI #71, #72, #73 and #74).
- **Scope:** it adds FilterChip to the components that 0001 no longer covers, and it pays the commitments that Amendment 3 left in «Pending». Every other component stays under 0001. `shared/control.module.css` stays: `Textarea` and `Combobox` still import it.

### The readiness criteria of 0001, measured

Same columns and rules as Amendments 1 and 3, measured on the code of this pull request (script `measure-adr-050.mjs` in the task evidence): areas, JSDoc over the members declared in the props type, imports of the published modules, `px` literals in the published `styles.css`, tests of the package at the `@yelison/forma-ui@0.5.0` tag, entry in `/catalogo`.

| Component  | 1 · areas (of 3 needed)        | 1 · stable for a phase                | 2 · API documented (JSDoc) | 3 · no domain types                          | 4 · token-only values                                                              | 5 · own test and catalog entry |
| ---------- | ------------------------------ | ------------------------------------- | -------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------ |
| FilterChip | 3 (customers, team, tickets)   | no (new in 0.5.0, no earlier release) | 1/1                        | yes (imports only react and its own modules) | yes (no `px` literals: the height is `--choice-min-height`, then `--touch-target`) | test: yes; catalog: yes        |

- **Areas.** It reaches 3 by itself, with five uses: one in tickets, one in customers, two in team (role and status) and one in `/catalogo`, which does not count.
- **Stability.** As in the earlier amendments the clause cannot be met: the package has no earlier release of the component.
- **Criterion 4.** None fails. The literal `36px` of Resolve's chip is a token now, with the same value.

### Decision

Resolve adopts FilterChip from `@yelison/forma-ui@0.5.0`, with the decisions of the first adoption:

1. **Dependency and tokens.** Exact version `0.5.0` (integrity `sha512-74wlu/hxo0DfkLIiRkPySKxBvS3MG6Ftbqq9g2sIcb0P6nn5FBJDRmCsMvgg0jKA8QR/VclSxl2+rbBaOWVIDg==`, checked against the registry; `npm audit signatures` verifies the registry signature and the SLSA provenance). `npm run sync:forma-tokens` adds tokens, all additive: `--color-purple-bg` and `--color-purple-ink` (`#efe7ff` and `#7751b8` in light, `#31244a` and `#cfb1ff` in dark, so four values; each is declared in the light block, in the dark block and in the system-dark block) and `--button-height-compact` (36px, and `--touch-target` below 768px). **No token that existed changes its value**, and `tokens.sync.test.ts` passes.
2. **Compatible barrel.** `FilterChip/FilterChip.ts` is a one-line re-export; its `.tsx`, CSS Module and test are gone. A diff of the resolved types of the barrel before and after (135 exports each, against the base of this pull request) finds:
   - **Additions:** `shape` on Badge, `purple` in `BadgeTone`, and `size` on Button (see «Additions Resolve does not use yet»).
   - **A deliberate narrowing.** `FilterChipProps` no longer has `aria-pressed`: the chip owns it, and it comes from `selected`. Nothing in Resolve passes it, so no call site changes (`tsc` is clean).
   - No import of `features/**` changes.
3. **Mode derived from `aria-haspopup`.** The chip is a trigger when `aria-haspopup` is anything but `undefined`, `false` or `"false"`: it draws the chevron and adds no `aria-pressed`, and `selected` only changes how it looks. Without it, it is a toggle with `aria-pressed` taken from `selected` and no chevron. Resolve's five uses spread the trigger of `Menu`, which carries `aria-haspopup: 'menu'` (`MenuTriggerProps` types it as the literal), so all five stay triggers. Two tests pin it: `FilterChip.test.tsx` (inside a `Menu`, with `selected` on and off, plus the toggle mode) and `e2e/filter-chips.spec.ts` (the real Tickets and Customers screens, with and without an applied filter; Team, whose chips give way to a «Quitar el filtro» pill once a filter is applied, only without one; and Tickets at 390 px with the 44 px height), with `e2e/catalog/filter-chip.spec.ts` for `/catalogo`. A chip that lost `aria-haspopup` would silently become a toggle with `aria-pressed` and no chevron; the e2e fails on it (mutation checked).
4. **`initialsOf` from the package.** `Avatar/initials.ts` and its tests are deleted. `Avatar/Avatar.ts` re-exports `initialsOf` with `Avatar`, and `WorkspaceMark` imports it from there (not from the barrel, which `Sidebar` is part of). `Avatar/initials.test.tsx` keeps only what is Resolve's: for the four demo workspaces (Acme Studio, Kora Fitness, Lumen Diseño and Norte Viajes) and for ten other names (`ß`, `ǆ`, an `É` precomposed and the same letter written as E plus a combining accent, an emoji, Chinese, extra spaces and a single word), the `WorkspaceMark` square and the `<Avatar>` draw the same letters. Replacing the helper in `WorkspaceMark` with a plain `toUpperCase()` makes four of them fail, `ß` among them (`SSR` instead of `ßR`).
5. **The reset is in `@layer base`.** `button, input, select, textarea { font: inherit; color: inherit }` moved from the top level of `styles/global.css` into `@layer base { … }`, as the README of the package asks. Without a layer it has the specificity of an element and beats the box of a package control, which is written in `:where()`. In a layer, any rule without one wins, whatever the order of the stylesheets, and the layer still beats the browser's own sheet, so native buttons and fields keep inheriting the font and the colour.
   - **Nothing changes on screen** (see the measurements below). The reset could only have been beating rules of specificity 0: `:where(.forma-field-control)` (Input, Select, SearchField) and Resolve's own `:where(.control)` (Textarea, Combobox). Their font is `--font-body`, the body's, so they paint the same wherever no ancestor sets another font.
   - **No other rule moved.** The other element rules of `global.css` (`img, svg { display: block }`, `a`, `:focus-visible`, `h1…p { margin: 0 }`) already lost nothing to a `:where()` rule, and the `prefers-reduced-motion` block uses `!important`, whose order inverts inside a layer (an `!important` in a layer beats one outside), so moving it would change behaviour for no gain.
   - **The order of the sheets still holds.** `global.order.test.ts` pins that the reset sits inside `@layer base` and that no unlayered copy remains (mutation: take it out of the layer, or add a copy). `e2e/production-bundle.spec.ts` checks in the production build that the minified CSS keeps the layer and measures it: a native control with no class inherits the font and colour of a container, and an `Input` with the package's class takes `--font-body` and `--color-ink` instead (it fails with the reset outside the layer). The existing tests for the order of `styles.css` pass.
6. **The two text-colour fixes of Amendment 3 are gone.** `color: var(--color-ink)` left `.search .input` in `KnowledgeHero.module.css` (the 52 px height and the border of the hero stay), and `.panel .searchInput` left `WorkspaceMenu.module.css` with its `className`. The package now gives a control the specificity of a class for its text colour. The contrast e2e tests of both (`knowledge.spec.ts`, four cases; `workspaces.spec.ts`, two) **stay and pass**, and they pass for the right reason: with the package's `.forma-field-control { color: var(--color-ink) }` rule deleted from `node_modules`, the three light-theme cases fail (contrast 1, 1 and 2.03 against the 4.5 required) and the dark ones keep passing, as before. The package was restored with `npm ci` and compared byte by byte.
7. **Textarea and Combobox get the same colour fix.** `shared/control.module.css`, their copy of the package's control box, moved `color: var(--color-ink)` out of `:where(.control)` into a `.control` rule of one class, as the package did. `control.parity.test.ts`, which compares the copy with the package rule by rule, failed on the 0.5.0 until it did (the test did not change). A parent's colour can no longer reach them, as it no longer reaches `Input`, `Select` and `SearchField`. Nothing on screen changes: neither sits on a dark band today, and the dump of both (below) finds no difference.

### Visual and behavioural differences

Measured as in Amendments 1 and 3, on computed styles, box, attributes and pseudo-elements of every node, with the base (`26a6a89`, 0.4.0) and the tip served side by side, in both themes at 1440 and 390 px:

- **The build** (`vite build --mode showcase`; 408 scenes, counting each theme and width): Home, Tickets, Customers (directory and a customer), Team, Reports, Knowledge (home, an article and the new-article editor), New ticket, a ticket, the four Settings pages, the global search, the sidebar with its workspace mark and profile, collapsed and as the drawer. On Tickets, Customers and Team, each filter chip at rest, with hover, with keyboard focus, with its menu open and with a filter applied; each search field with hover, focus and text; and the focused native controls (`select`, `textarea`, `input`) of every page.
- **`/catalogo`** (development server; 148 scenes), with the same chip states, search fields and controls.
- **Textarea and Combobox** (New ticket, the reply composer of a ticket, the article editor and the examples of `/catalogo`): at rest, with keyboard focus, with typed text (and the list of the Combobox open) and with hover.
- **The mobile drawer's «Buscar espacio»** needs 8 workspaces or more and the demo admin has four, so it is not in the dump. It was measured on its own, in the production build with 9 workspaces (the mock of `workspaces.spec.ts`), base and tip, in both themes at 390 px: the same text colour (`rgb(23, 36, 61)` on white in light, `rgb(231, 237, 248)` on `rgb(20, 31, 50)` in dark), background, font and 44 px height.

**Result: no computed property, box, attribute or pseudo-element differs**, apart from the new custom properties, which the dump lists on every node, and the clock of the `datetime` attributes. That includes the native buttons, fields, selects and textareas of every page (the reset), the hero of Knowledge and the sidebar (the workspace mark with `initialsOf` from the package).

**FilterChip.** The differences the package announced, measured:

- **The box.** `min-height` is `--choice-min-height` (36px) instead of a literal `36px`, and below 768px `--touch-target` (44px), as before. Both draw `box-sizing: border-box` (Resolve's global rule; the package's chip sets none), so the 36px includes the border in both. Measured height: 36px at 1440 and 44px at 390, on the base and on the tip, for every chip.
- **The focus ring.** The chip has its own `:focus-visible { outline: var(--focus-ring); outline-offset: 2px }`. The base chip took the same two values from the global `:focus-visible` rule, so the computed outline is identical (checked on every chip with keyboard focus).
- **`:disabled`.** The package's chip has a disabled look (background `--color-disabled`, text `--color-muted`, transparent border, `cursor: not-allowed`) that the base chip did not have. **No screen of Resolve disables a chip**, so nothing a person sees changes; to measure it the dump forces `disabled` by hand on each chip: `rgb(255, 255, 255)` to `rgb(210, 218, 231)` for the background and `rgb(23, 36, 61)` to `rgb(97, 109, 129)` for the text in light, `rgb(20, 31, 50)` to `rgb(52, 68, 92)` and `rgb(231, 237, 248)` to `rgb(160, 175, 197)` in dark. Screenshots of before and after are in the task evidence. A screen that disables a chip in the future gets this look.
- **Hover** (`--color-surface-hover`) and the applied look (`--color-blue-*`) are the same. With a filter applied, the Tickets and Customers chip stays and only changes colour; in Team the chip gives way to the «Quitar el filtro» pill, as before.

### Additions Resolve does not use yet

`Badge` takes `tone="purple"` and `shape="pill"`, and `Button` takes `size="compact"` (36px, `--button-height-compact`). Nothing in Resolve passes them: a `Badge` or `Button` without the props renders the same markup and styles (the dump finds no difference), so there is nothing to adopt now.

### Weight

Initial JavaScript and CSS (`index-*` and the preloaded `ui-*` of `npm run build`), before and after: JavaScript 670 219 → 670 091 bytes (−128; gzip 203 417 → 203 239, −178) and CSS 126 451 → 127 305 bytes (+854; gzip 22 381 → 22 499, +118). The chip's code and styles now come from the package, with the purple tone and the compact button in `styles.css`.

### Pending

- **Resolve, when it adopts Forma UI 0.6.0** (Menu and Alert): the same method, with `Menu` as the component that all five chips and the global search depend on.
- **Forma UI:** nothing from this pull request. A disabled chip, and `Badge purple`, `Badge pill` and `Button compact`, wait for a screen that needs them.
- **Checkbox and Switch** are still the next family of the same base (`shared/choice.module.css`).
