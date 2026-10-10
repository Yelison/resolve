# Dependencies: Forma UI tokens and Dependabot

Resolve depends on [`@yelison/forma-ui`](https://www.npmjs.com/package/@yelison/forma-ui), the component and token
library extracted from it. This page records how that dependency is pinned, how its tokens reach the app and how updates
are merged. The owner decided it; the decision and how each of the extraction criteria was handled are in
[ADR 0002](../decisions/0002-adopt-forma-ui.md).

## Pinned to an exact version

`frontend/package.json` lists `"@yelison/forma-ui": "0.1.0"`, with no `^` or `~`. The package is below 1.0, so a minor
release may carry breaking changes (its changelog marks each one **Breaking**): the version Resolve runs stays explicit
and moves only through a pull request.

## The tokens come from the package

`frontend/src/styles/tokens.css` is generated: a Resolve header followed by the package's own `tokens.css`, unchanged.
Do not edit it by hand. The same command writes the copy of the Keycloak login theme, which must stay identical:

```sh
cd frontend
npm run sync:forma-tokens            # writes both copies
npm run sync:forma-tokens -- --check # writes nothing; fails if a copy differs from the installed package
```

- **Test.** `src/styles/tokens.sync.test.ts` fails when either copy differs from the installed package, so a version that
  changes tokens cannot merge until someone runs the command and looks at the visual change.
  `tokens.keycloak.test.ts` keeps comparing the two copies byte for byte.
- **Version in the header.** It is the version of the last synchronisation. The test compares the content, not the
  version, so a patch that leaves the tokens untouched passes without a new commit (and can merge by itself, see below).
- **Resolve's own layer** is not in the generated file and never redeclares a name the package defines, even with the
  same value:
  - layout tokens (`--header-height`, `--page-gutter`, `--sidebar-*`, `--drawer-width`, `--reading-width`) are in
    `frontend/src/styles/global.css`;
  - chart colours (`--color-chart-1…4` and the sequential ramp `--color-chart-seq-1…4`) are in
    `frontend/src/styles/chart-tokens.css`, with the same three theme blocks as `tokens.css`, until Forma UI has charts.
    `tokens.contrast.test.ts` reads both files.
- **Order of the stylesheets.** The package README asks for `tokens.css`, `styles.css`, `base.css` and then your own CSS.
  Resolve keeps that order in the page, but not with a single `@import` list, because Vite links the CSS of a shared
  chunk before the CSS of the entry point:
  - `components/ui/index.ts` imports `@yelison/forma-ui/styles.css` as its **first line**. In the build it opens
    `ui-*.css`, which the page links first, so every `.forma-*` rule comes before all of Resolve's CSS;
  - `global.css` imports `tokens.css`, `@yelison/forma-ui/base.css` and `chart-tokens.css` (custom properties and
    classes that do not depend on the order) and then holds Resolve's own layer.

  `src/styles/global.order.test.ts` pins both, and `e2e/production-bundle.spec.ts` checks the build: the first stylesheet is
  `ui-*.css` and starts with a package rule, and no other stylesheet carries `.forma-*` component rules.

## Overriding a package class

The package's classes (`forma-<module>__<class>`) are not an API: restyle through the tokens. When a Resolve class
has to change something a component sets (for example `.header .toggle` on the sidebar's `IconButton`, or the class that
`GlobalSearch` passes to `Modal`), the rule is:

1. **By order.** A `className` passed to a component has the same specificity as the component's own rule, and the
   package's CSS is first in the build (see above), so the Resolve class wins. Use a single class selector.
2. **By specificity, as a defence.** Where the property matters (colours, outlines, sizes of a control), also raise the
   specificity of Resolve's selector (`.header .toggle`, not `.toggle`). It keeps working if the order ever changes, and
   the package's state selectors use `:where()` so a class of yours can win over them.
3. **Check it in the build.** jsdom loads no CSS: a test that needs the cascade runs in Playwright against the built
   application (`e2e/shell.spec.ts` for the sidebar, `e2e/production-bundle.spec.ts` for the search dialog, which fails when a
   Resolve class sets a property that the package sets later).

Today two Resolve classes override a package property, and both follow rule 2:

- the sidebar's (`.header .toggle…`, on the `IconButton`);
- `.periodField` of Reports (`features/reports/ReportsPage.module.css`), which reaches the package's `.forma-field` through the
  `fieldClassName` of `Select` and overrides its `min-width`. It is written as `.toolbar .periodField`, so it wins by
  specificity and not only by order.

`GlobalSearch`'s `.dialog` only defines a custom property of its own, and the other classes that reach a `Select`
(`.sort`, `.select`) only set `flex`, which the package does not set.

## The theme

`useTheme` (`src/app/theme/`) delegates to `createThemeStore({ storageKey: 'resolve-theme' })`, one store for the whole
application; the key is the one Resolve always used, so stored preferences survive. `index.html` carries the output of
`themeScript({ storageKey: 'resolve-theme' })` byte for byte, between `<!-- prettier-ignore -->` and the script: the
backend admits the inline script in the Content-Security-Policy by the SHA-256 hash of its content
(`ContentSecurityPolicy.java` computes it when it starts, from the `index.html` it serves), so the script is neither
reformatted nor edited by hand. If `@yelison/forma-ui` changes `themeScript`, `src/app/theme/firstPaint.test.ts` fails until
`index.html` is updated with the new output; no hash is written anywhere. `e2e/theme.spec.ts` serves the build with a
hash-only policy computed like the backend does.

## Dependabot and auto-merge

`.github/dependabot.yml` keeps one `npm` entry for `/frontend`:

| Update | Where it goes |
| --- | --- |
| Any dependency's minor and patch, except `@yelison/forma-ui` | The `frontend` group (`exclude-patterns` takes the package out of it) |
| `@yelison/forma-ui` **patch** | Its own group, `forma-ui`, a pull request of its own |
| `@yelison/forma-ui` **minor and major** | A pull request per version, in no group |

`.github/workflows/dependabot-automerge.yml` runs `gh pr merge --auto --rebase` only when **all** of these hold:

1. the author is `dependabot[bot]`;
2. the pull request updates exactly one dependency, `@yelison/forma-ui` (compared by equality, so a mixed pull request
   never merges by itself);
3. the update type is `version-update:semver-patch`.

Minor and major releases of the package are never merged automatically: a visual change needs the owner's review even
when the checks pass.

`--auto` merges nothing by itself. GitHub merges when the required checks of the `Protect main` ruleset pass; the
workflow never skips them, and a failing check leaves the pull request open. Its permissions are `contents: write` and
`pull-requests: write`, and `dependabot/fetch-metadata` is pinned by commit SHA, like the actions of the deploy and Pages workflows (`ci.yml` still uses tags).

Prerequisites, in the repository settings: «Allow auto-merge» and «Allow rebase merging» are on (checked on
2026-10-10), and the ruleset has required status checks. Without them `--auto` has nothing to wait for.

### Synchronising inside a Dependabot pull request

A patch that changes tokens fails `tokens.sync.test.ts` and stays open, but `--auto` was already enabled when the workflow
ran. GitHub only turns auto-merge off when someone **without** write permissions pushes to the head branch, so on its own
a `npm run sync:forma-tokens` pushed by the owner would merge as soon as the checks pass, without another review.

The workflow covers it: on `opened`, `synchronize` and `reopened`, a second job runs `gh pr merge --disable-auto` when the
pull request belongs to Dependabot and the actor is **not** Dependabot. Pushing the synchronisation to the branch therefore
turns auto-merge off and the owner merges by hand after looking at the visual change; nobody has to remember anything.
One caveat: «Re-run all jobs» on a run that Dependabot started keeps `github.actor` as `dependabot[bot]` and enables
auto-merge again, so do not re-run the auto-merge job on a pull request you have synchronised.

### Known behaviour: a merge made with `GITHUB_TOKEN` starts no other workflow

GitHub does not create new workflow runs from events caused by the workflow's `GITHUB_TOKEN`
([Triggering a workflow from a workflow](https://docs.github.com/en/actions/using-workflows/triggering-a-workflow#triggering-a-workflow-from-a-workflow)).
The owner accepted this: an automatically merged patch does **not** start what runs on `push` to `main`, which is
`ci.yml` and `pages.yml` (the static demo), and so not `deploy.yml` either, which starts from the `workflow_run` of
`ci.yml`. The pull request's own checks did run before the merge (they come from Dependabot's `pull_request` event), but
possibly on a base older than `main`, because the ruleset does not require the branch to be up to date.

Checklist after an automatically merged patch:

- [ ] Run **Pages** by hand: Actions → Pages → *Run workflow*, on `main`.
- [ ] Run **Deploy** by hand if deployments are enabled: Actions → Deploy → *Run workflow*, on `main`.
- [ ] CI on `main`: `ci.yml` has no `workflow_dispatch`, so it cannot be started from Actions today. Adding the trigger is
  a change to `ci.yml`, which is reserved; until then, look at the checks of the merged pull request.

The alternative the owner did not choose is a GitHub App token or a personal access token for the merge step. It would
have to be stored as a **Dependabot** secret (Settings → Secrets and variables → Dependabot), because runs started by
Dependabot do not see the Actions secrets. Nothing in the repository settings or in the other workflows was changed.
