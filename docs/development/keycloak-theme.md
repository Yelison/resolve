# Keycloak login theme

The sign-in screens Keycloak shows after "Entrar con tu cuenta" use the `resolve` theme in
[`deploy/keycloak/themes/resolve/login/`](../../deploy/keycloak/themes/resolve/login/). It was requested by the owner
outside the implementation plan, so it is recorded here as a decision.

## What it is

- **Parent: `keycloak.v2`**, Keycloak 26's default login theme (PatternFly 5 markup). It already gives each field a
  visible `<label for>`, `aria-invalid`, a live region for the error text and the password toggle, so the theme only
  has to restyle it. The older `keycloak` theme (PatternFly 3/4) is deprecated and has none of that.
- **No FreeMarker template is copied.** The theme is `theme.properties`, `css/resolve.css`, a small `js/resolve.js` and
  `messages/messages_es.properties`. Keycloak keeps updating the templates; the ids the e2e tests rely on
  (`#username`, `#password`, `#kc-login`, `#kc-form-login`) are the stock ones.
- Screens covered: sign in, error, page expired, logout confirmation and information (`login-login`, `login-error`,
  `login-login-page-expired`, `login-logout-confirm`, `login-info`). Others (reset password, OTP…) inherit the same
  colours and layout but are not part of the design.
- `js/resolve.js` does two things the templates do not: it adds `aria-describedby` from a field in error to the message
  Keycloak prints under it, gives page alerts `role="alert"`, and swaps in `img/favicon.svg` (Keycloak can only declare
  a `favicon.ico`).
- Inter is served from the theme (`resources/fonts/`, from `@fontsource-variable/inter`, with its OFL licence). The
  `@font-face` family is named `Inter` to match `--font-family`.
- Spanish: the realm has `internationalizationEnabled`, `supportedLocales: ["es"]`, `defaultLocale: "es"` and
  `loginTheme: "resolve"`. `messages_es.properties` overrides only the strings that do not sound like Resolve.

## One source of truth for colours

`resources/css/tokens.css` is a **literal copy** of `frontend/src/styles/tokens.css`. `resolve.css` only paints with
those variables (and sizes from the same scale: 12/14/17/30 px, radii of 8 and 12 px, 1 px borders).
`frontend/src/styles/tokens.keycloak.test.ts` fails if the copy differs from the original, if `resolve.css` uses a
hard-coded colour or an unknown variable, or if a text/background pair the page paints drops under 4.5:1. After
changing the tokens:

```sh
cp frontend/src/styles/tokens.css deploy/keycloak/themes/resolve/login/resources/css/tokens.css
```

A test was chosen over a generator because the copy needs no build step. Dark mode is `prefers-color-scheme` only
(`darkMode=false` in `theme.properties` turns off PatternFly's own switch so there is a single mechanism). The primary
button's hover and focus use `--color-brand-hover` and links use `--color-link` (both from #65), never `brand` as text
colour; the test checks their contrast pairs (`on-brand` on `brand` and on `brand-hover`, `link` on `surface`).

## Loading it

`docker-compose.yml` and `deploy/docker-compose.prod.yml` mount `deploy/keycloak/themes` read-only on
`/opt/keycloak/themes`. In development the theme and template caches are off
(`--spi-theme--cache-themes=false`, `--spi-theme--cache-templates=false`), so editing a CSS, JS or `.properties` file
shows on reload. The realm is only imported into an empty database: after changing `resolve-realm.json`, run
`docker compose down --volumes` and `up -d keycloak` (a restart is not enough).

## Trying it in a slot

```sh
set -a; . ./.env.herdr; set +a
docker compose -p "$COMPOSE_PROJECT_NAME" up -d keycloak
# Sign-in screen (the client enforces PKCE, hence code_challenge):
open "http://localhost:$KEYCLOAK_PORT/realms/resolve/protocol/openid-connect/auth?client_id=resolve-api&response_type=code&scope=openid&state=x&redirect_uri=http%3A%2F%2Flocalhost%3A$SERVER_PORT%2Fapi%2Flogin%2Foauth2%2Fcode%2Fresolve&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256"
```

Other screens: the error page with `client_id=nope`; the logout confirmation at
`/realms/resolve/protocol/openid-connect/logout`; the information page by confirming that logout while signed in; the
expired page by opening the sign-in form's `action` URL with `execution=00000000-0000-0000-0000-000000000000`.
`body[data-page-id]` names the screen. For the whole flow through the app, run the backend with `SPRING_PROFILES_ACTIVE=dev,oidc`
and Vite as described in [herdr.md](herdr.md#per-task-ports) and press "Entrar con tu cuenta".
