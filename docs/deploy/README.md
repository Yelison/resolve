# Deployment

How the application is packaged and configured to run outside a developer's machine. The operations side (backups,
restore, rollback, secret rotation, what to look at when `health` is `DOWN`) is in the [runbooks](runbooks.md); the
pipeline that publishes the image is T9.3 and does not exist yet.

## The image

One image holds the API and the web app: the API serves the Vite build from the same origin (no CORS, and the session
cookie needs no `SameSite=None`), under `/`, and itself under `/api`.

```sh
docker build -t resolve:local .   # from the repository root
```

- **Three stages.** `node:22-alpine` builds the web app, `maven:3.10-eclipse-temurin-25` packages the jar with the
  build in `static/` (tests are skipped there: CI runs them), and `eclipse-temurin:25-jre` runs it.
- **Not root.** It runs as the user `resolve` (UID 10001), with no home directory and no login shell.
- **No secrets in layers.** Nothing is configured at build time. [`.dockerignore`](../../.dockerignore) is an allow
  list, so an `.env`, git history or another agent's worktree cannot enter the build context.
- **`SPRING_PROFILES_ACTIVE=prod,oidc` is the only default in the image,** so an unconfigured container cannot start
  with the demo login.
- **`HEALTHCHECK`** calls `GET /api/actuator/health/readiness` with a bash socket (the image has neither `curl` nor
  `wget`) and reports `healthy` once it answers `UP`.

## Variables

With the `prod` profile **none of these has a default**. If one is missing or empty the application refuses to start
and the message lists every missing variable (`Missing required configuration for the 'prod' profile, which has no
defaults: DATABASE_URL, …`). Without that check Spring would keep a literal `${DATABASE_URL}` as the value and fail
later with an unrelated error.

| Variable                     | Meaning                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `SPRING_PROFILES_ACTIVE`     | `prod,oidc` (set in the image). `oidc` is what turns on sign-in; without it every call is a `401` |
| `DATABASE_URL`               | JDBC URL, for example `jdbc:postgresql://<host>:5432/<database>`                       |
| `DATABASE_USERNAME`          | Database role used by the API                                                          |
| `DATABASE_PASSWORD`          | Password of that role                                                                  |
| `RESOLVE_OIDC_ISSUER`        | Issuer URL of the realm. It must be **identical** to the `issuer` its discovery document announces, and reachable from the container |
| `RESOLVE_OIDC_CLIENT_ID`     | OIDC client of the API (a confidential client with PKCE, as in the demo realm)         |
| `RESOLVE_OIDC_CLIENT_SECRET` | Secret of that client                                                                  |
| `RESOLVE_PUBLIC_URL`         | Public URL of the application, with `https`. Where the browser lands after signing in and out; it must be in the client's `post.logout.redirect.uris` |
| `SERVER_PORT`                | Optional. The port the API listens on; `8080` in the image                             |

`SPRING_FLYWAY_LOCATIONS` is also honoured. `prod` applies only `classpath:db/migration`, so a database starts empty:
nobody has a membership until the invitation flow or a seed creates one. A public demo that wants the demo data adds
`classpath:db/demo` (T9.3).

## Behind HTTPS

`prod` sets `server.forward-headers-strategy=framework`: the platform terminates TLS and the API trusts
`X-Forwarded-Proto` and `X-Forwarded-Host` to build the OIDC redirect URI and to know a request was secure. The proxy
must set them and must not let a client override them.

- **Cookies.** The session cookie (`JSESSIONID`, `HttpOnly`, `SameSite=Lax`, path `/api`) and `XSRF-TOKEN` (readable by
  JavaScript, `SameSite=Lax`, path `/`) are `Secure` in `prod`, and no Resolve variable lowers it. Spring's own
  `SERVER_SERVLET_SESSION_COOKIE_SECURE=false` does (the environment outweighs the profile file), so never define it
  in `prod`. Browsers
  accept `Secure` cookies on `http://localhost`, which is what makes the local test below work.
- **`XSRF-TOKEN` only under `/api`.** The files under `/assets` are served with `Cache-Control: public,
  max-age=31536000, immutable`; a `Set-Cookie` on them would let a shared cache give everyone the same token. No
  response outside `/api` carries a cookie, `index.html` included (it is `no-cache`, with an ETag by content).

## Response headers

On every response, the API and the web app:

| Header                      | Value                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `Content-Security-Policy`   | `default-src 'self'; script-src 'self' 'sha256-…'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' <issuer origin>; frame-ancestors 'none'` |
| `Strict-Transport-Security` | `max-age=31536000 ; includeSubDomains`, only on secure requests (HTTPS, or `X-Forwarded-Proto: https`) |
| `X-Content-Type-Options`    | `nosniff`                                                                                |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                        |
| `X-Frame-Options`           | `DENY`                                                                                   |

The fonts are bundled (`@fontsource-variable/inter`), so nothing is loaded from a CDN. The one exception to
`script-src 'self'` is not an `unsafe-inline`: `index.html` has a small inline script that applies the saved theme
before the first paint, and the API computes its SHA-256 hash **at startup** from the `index.html` it serves
(`ContentSecurityPolicy`). Changing that script needs no change on the server, and an injected inline script matches no
hash. `style-src 'self'` allows no inline styles; the app does not use any. `form-action` also lists the origin of
`RESOLVE_OIDC_ISSUER`: Chrome checks the redirect that follows a form submission, so a sign-in form that the API
redirects to the identity provider would otherwise be blocked (a link or `location.assign` is not affected).

## Errors, logs and health

- **Errors.** Everything under `/api` answers errors as `application/problem+json`, also what Spring redirects to
  `/api/error` (a route without a handler, a rejected URL, an exception in a filter), whatever `Accept` says. The body
  never carries the original message or a stack trace (`spring.web.error.include-stacktrace=never`).
  The exception: a URL Tomcat rejects while parsing it (invalid percent-encoding such as `/api/%zz`, an encoded slash
  such as `/api/a%2fb`) never reaches Spring and gets Tomcat's minimal `400` page, not Problem Details. Changing
  Tomcat's error valve would not make up for these cases.
- <a id="logs"></a>**Logs.** JSON in Elastic Common Schema on standard output. The application writes no request bodies
  and no email addresses at `INFO`. A 5xx is logged with the URI the client sees as the problem's `instance`, which is
  the way to find it.
- **Health.** `GET /api/actuator/health` (`UP` or `DOWN`, no details), and the probes
  `GET /api/actuator/health/liveness` and `/readiness`. All three are public. Nothing else of actuator is exposed.

## Trying the image locally

[`deploy/docker-compose.prod.yml`](../../deploy/docker-compose.prod.yml) runs the image with PostgreSQL and Keycloak
(the demo realm, in development mode). It is a way to test the image, not a deployment.

```sh
cp deploy/env.prod.example deploy/.env.prod.local   # every value is fictitious; ignored by git
# Optional: SERVER_PORT, POSTGRES_PORT, KEYCLOAK_PORT, and SPRING_FLYWAY_LOCATIONS with classpath:db/demo for data
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod.local -p resolve-prod up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod.local -p resolve-prod ps   # api: healthy
```

Open `http://localhost:8080` (`SERVER_PORT`), choose to sign in and use `laura.mendez@acme.example` / `demo` (with the
demo data). When finished: `docker compose … down -v`.

Why Keycloak is `http://keycloak.localhost:<KEYCLOAK_PORT>`: the issuer the API discovers from inside its container
must be exactly the one the browser is sent to. Browsers resolve any `*.localhost` to `127.0.0.1` with no change to
`/etc/hosts`; inside the compose network the alias on the `keycloak` service takes the same name to its container; and
Keycloak listens inside on the same port that is published, so the URL is identical on both sides.

The realm file lists the origin of the application in `redirectUris` and `post.logout.redirect.uris` as
`${RESOLVE_PUBLIC_URL:http://localhost:8080}`: Keycloak replaces it from its environment when it imports the realm (the
compose sets it from `SERVER_PORT`), and the development setup, which does not set it, keeps `http://localhost:8080`.
The values used with the Vite dev server are untouched. `post.logout.redirect.uris` also lists `http://localhost:8080`
to `8089` (with and without the final `/`), the ports of the API serving the app from the jar: without them Keycloak
answers "Invalid redirect uri" after signing out and the SSO session stays alive. `KeycloakRealmTest` requires every
sign-in redirect URI to have its sign-out counterpart.

### The Keycloak login theme

Keycloak shows its sign-in screens with the `resolve` theme (`deploy/keycloak/themes/resolve/login/`, see
[Keycloak login theme](../development/keycloak-theme.md)), selected by `loginTheme` in the realm file. The compose file
mounts `deploy/keycloak/themes` read-only on `/opt/keycloak/themes`. That compose also runs `start-dev`, which does not
cache themes; a real `start` does, so after changing a theme a real deployment has to restart (or roll) Keycloak.

For a real deployment the theme must reach Keycloak's `/opt/keycloak/themes` in one of two ways. **Mount** the folder
(a volume, or a ConfigMap-like mount on the platform): simplest, but the theme version is not tied to the Keycloak
version. **Derived image**: `FROM quay.io/keycloak/keycloak:26.7.5` plus `COPY deploy/keycloak/themes /opt/keycloak/themes`,
built and tagged with the release, so the theme and Keycloak travel and roll back together; preferred once there is a
pipeline (T9.3). Nothing is deployed from here.

## Not covered yet

The deployment pipeline, the platform configuration (`fly.toml`), the demo reset and the maintenance mode are T9.3.
A real deployment also needs its own realm (not the demo one: its users and secret are public) and a Keycloak that is
not in development mode.
