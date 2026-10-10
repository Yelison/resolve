# Dependencies: Forma UI tokens and Dependabot

Resolve depends on [`@yelison/forma-ui`](https://www.npmjs.com/package/@yelison/forma-ui), the component and token
library extracted from it. This page records how that dependency is pinned, how its tokens reach the app and how updates
are merged. The owner decided it; the adoption ADR (0002) arrives with the components, in the next task.

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
- **Order of the stylesheets** (the package README's): `tokens.css`, then `base.css`, then Resolve's own CSS.
  `global.css` imports them in that order. `styles.css`, the components' rules, joins them with the components.

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
`pull-requests: write`, and `dependabot/fetch-metadata` is pinned by commit SHA like the other actions of the repository.

Prerequisites, in the repository settings: «Allow auto-merge» and «Allow rebase merging» are on (checked on
2026-10-10), and the ruleset has required status checks. Without them `--auto` has nothing to wait for.

A merge made with the workflow's `GITHUB_TOKEN` does not start new workflow runs: GitHub does not trigger workflows from
events created with that token. Anything that must run after the merge on `main` has to be started by hand (or by a
trigger that does not depend on the push).
