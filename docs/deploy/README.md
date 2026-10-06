# Deployment

How the application is packaged and configured to run outside a developer's machine. The operations side (backups,
restore, rollback, secret rotation, what to look at when `health` is `DOWN`) is in the [runbooks](runbooks.md). The
pipeline and the resettable public demo are described in [the last sections](#the-pipeline-github-actions--ghcr--flyio).

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
| `RESOLVE_DEMO_ENABLED`       | `true` on the public demo, `false` otherwise. **No default in `prod`**: it turns on `organization.demo` in `/me`, `X-Robots-Tag: noindex` and the maintenance mode |
| `RESOLVE_DEMO_LIMITS`        | Optional (`false`). `true` turns on the per-organization caps and the 60-writes-per-minute limit |
| `RESOLVE_DEMO_CLIENT_IP_HEADER` | Optional. Header the platform proxy **overwrites** with the client address (`Fly-Client-IP` on Fly). Without it the limit counts the connection address (one bucket behind a proxy) |
| `SERVER_PORT`                | Optional. The port the API listens on; `8080` in the image                             |

`SPRING_FLYWAY_LOCATIONS` is also honoured. `prod` applies only `classpath:db/migration`, so a database starts empty:
nobody has a membership until the invitation flow or a seed creates one. A public demo that wants the demo data adds
`classpath:db/demo` (`deploy/fly.toml` does, with `SPRING_FLYWAY_OUT_OF_ORDER=true`: the demo database already has
`V1000+` applied, so a later real migration with a lower version would otherwise be reported as ignored and stop the
start).

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

The pipeline, `deploy/fly.toml`, the demo reset and the maintenance mode are described below.
A real deployment also needs its own realm (not the demo one: its users and secret are public) and a Keycloak that is
not in development mode.

## The pipeline: GitHub Actions → GHCR → Fly.io

> **Nothing runs until the owner switches it on.** There are no accounts yet. Every job of
> [`deploy.yml`](../../.github/workflows/deploy.yml) and [`demo-reset.yml`](../../.github/workflows/demo-reset.yml) has
> `if: vars.DEPLOY_ENABLED == 'true'`; without that repository variable they are skipped. No step publishes an image
> or calls Fly or Neon, and the repository holds no secret.

`deploy.yml` starts with `workflow_run` on the `CI` workflow, only when it was a **push to `main`** and it
**succeeded** (a pull request's CI never deploys). A `workflow_run` flow and not a job inside `ci.yml` because it leaves
`ci.yml` untouched and deploys exactly `workflow_run.head_sha`, the commit the CI checked. Two jobs:

1. **`image`** (`packages: write`, the only job with it) builds the [`Dockerfile`](../../Dockerfile) and pushes
   `ghcr.io/<owner>/<repo>` (lowercase) tagged with the SHA and `latest`.
2. **`deploy`** (environment `demo`) runs `flyctl deploy --config deploy/fly.toml --image <image>:<sha>` and waits for
   `readiness` to answer `UP`. **Rollback** is the same command with a previous tag.

Actions are pinned by commit SHA (Dependabot keeps them current); `permissions: {}` at the top and `concurrency`
without cancellation, so a deployment is never cut in half.

### What the owner has to create

| Where | Name | Kind | Value |
| --- | --- | --- | --- |
| Repository | `DEPLOY_ENABLED` | variable | `true` to switch everything on; delete it or set anything else to stop |
| GitHub environment `demo` | `FLY_API_TOKEN` | secret | `fly tokens create deploy -a resolve-demo` |
| GitHub environment `demo` | `DEMO_DB_USER`, `DEMO_DB_PASSWORD` | secrets | **The same role the application uses** (`DATABASE_USERNAME`), owner of the **demo** database |
| GitHub environment `demo` | `DEMO_DB_HOST`, `DEMO_DB_NAME` | variables | Neon **direct** endpoint (not `-pooler`) and the database name, which must contain `demo` |
| GitHub environment `demo` | `DEMO_URL` | variable | `https://resolve-demo.fly.dev` (no trailing slash) |
| Fly (`fly secrets set -a resolve-demo`) | `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | secrets | The demo database, with **the same role as `DEMO_DB_USER`/`DEMO_DB_PASSWORD`** (see below) and the direct endpoint |
| Fly | `RESOLVE_OIDC_ISSUER`, `RESOLVE_OIDC_CLIENT_ID`, `RESOLVE_OIDC_CLIENT_SECRET` | secrets | The demo realm |
| GHCR | package visibility | setting | **Public**, so Fly can pull it without registry credentials (the image holds no secret). If it must stay private, add registry credentials to `flyctl deploy` |

**Limit the `demo` environment to `main`** (Settings → Environments → `demo` → *Deployment branches and tags* →
*Selected branches* → `main`, and, if wanted, *Required reviewers*). Any workflow that declares `environment: demo`
receives `FLY_API_TOKEN` and the database credentials, and a flow on another branch could drop the guard; `workflow_dispatch`
lets anyone with write access pick any branch. `demo-reset.yml` also refuses to run when `github.ref` is not
`refs/heads/main`.

One-time database steps, run by the owner against the demo database (the sentinel is created by hand **on purpose**: if
the workflow created it, the guard would protect nothing):

```sql
CREATE SCHEMA IF NOT EXISTS resolve_ops;
CREATE TABLE resolve_ops.demo_database (marker text PRIMARY KEY);
INSERT INTO resolve_ops.demo_database VALUES ('resolve-demo-database');
```

**One role for both.** The API runs Flyway at startup and `flyway clean migrate` recreates every table owned by whoever
runs it. If the reset used another role than `DATABASE_USERNAME`, the application would lose its permissions on all
tables after the first reset, could not write `flyway_schema_history` on the next deployment, and could not read
`resolve_ops.maintenance` (a read error means "no maintenance", silently). So the application and the reset use the same
role, owner of the demo database and of `resolve_ops` (nothing to `GRANT`). As a safety net the workflow aborts before
`clean` if readiness still answers `UP` after the maintenance wait.

`app = "resolve-demo"` and `primary_region = "iad"` in `fly.toml` are decisions to confirm: change them before the first
deployment (and `RESOLVE_PUBLIC_URL`, which must match the app's URL and be one of the realm client's redirect URIs).
Create the Neon project in the region closest to `primary_region`.

## The nightly reset

[`demo-reset.yml`](../../.github/workflows/demo-reset.yml) runs at **03:00 in America/Bogota** (Acme Studio, the
organization of the demo users `…@acme.example`): UTC-5 all year, so `cron: '0 8 * * *'`, with no daylight-saving change.
Northwind is Europe/Madrid (UTC+1 / UTC+2); if it were the reference, 03:00 would be 02:00 or 01:00 UTC and the line
would move twice a year. GitHub only runs `schedule` from the default branch, can delay it under load and disables it
after 60 days without repository activity; **Run workflow** triggers it by hand.

0. **Only from `main`**, and in the same concurrency group as `deploy.yml` (`demo-deploy-and-reset`): a deployment, whose new
   machine runs Flyway at startup, never overlaps with the `clean` and `migrate` of the reset (GitHub keeps one pending run
   per group, the latest).
1. **Guard.** It aborts unless the database name contains `demo`, the connection really is that database, **and** the
   sentinel row above exists. A real database has no sentinel. `flyway clean` is also impossible from the application:
   `spring.flyway.clean-disabled=true` in `prod` (tested), and the CLI runs with `-cleanDisabled=false` only inside this
   job.
2. **Maintenance on** (below), a 15-second wait, and then it **requires an HTTP `503`** from `/api/me` (that request is what
   makes the application read the mark) and from readiness before anything is deleted. An empty `DEMO_URL`, a DNS failure or a
   timeout abort too: they are not a `503`.
3. **`flyway clean migrate`** with the Flyway CLI image (same major as `flyway-core`, pinned by digest) on
   `db/migration` and `db/demo` (rehearsed against a local PostgreSQL 17: 15 migrations, `V1006`). `clean` empties the
   `public` schema; `resolve_ops` is not managed by Flyway and survives.
4. **Maintenance off** and a **smoke**: readiness `UP`, `/` answers `200`, `/api/me` without a session `401`, two
   organizations in the database.

If `clean` or `migrate` fails the flow is red and the maintenance mark is **not** removed: it expires by itself (10
minutes), and nobody sees a half-migrated database before that. Run the workflow again.

### Maintenance mode

While the mark is on, every `/api` path except `/api/actuator/health/**` answers `503` Problem "Reinicio de la
demostración en curso" with `Retry-After`; `readiness` is `OUT_OF_SERVICE` (so Fly stops routing) and `liveness` stays
`UP`. The static web app is still served. The aggregate `/api/actuator/health` also reports `OUT_OF_SERVICE`.

- **Design.** The mark is a deadline in `resolve_ops.maintenance(until timestamptz)`, written by the workflow with
  `psql`. It is only active with `resolve.demo.enabled=true`.
- **Read lazily, so Neon can sleep.** There is no polling: the API reads the mark when a request to `/api` arrives and the
  last read is older than 5 seconds (`resolve.demo.maintenance-poll`), one read at a time, and decides with its own clock
  in between. With no traffic there are no queries and Neon can suspend its compute; the first request after a pause reads
  the mark before it is answered. **Outside maintenance, readiness does not query the database by itself** (a platform check every few seconds
  would keep Neon awake): it reflects the last read, which any request to the API refreshes; the reset workflow makes one
  before it deletes anything. **While maintenance is on, readiness does re-read the mark** (at most every 5 s), so it goes
  back to `UP` once the mark is removed even with no traffic; the reset's smoke asks `/api/me` until it answers `401`
  and then checks readiness. A failed read **keeps the previous mark** (it expires by itself), so a cut connection in the
  middle of `clean` cannot reopen the API on a half-migrated database.
- **Why a table and not an endpoint or memory.** `flyway clean` does not touch another schema, so the mark survives the
  reset it protects; it works with several machines and across an application restart; and nobody can activate it
  without the database credentials, so there is no route to protect in the security chain (an endpoint under `/api`
  would need changes in `SecurityConfiguration` and CSRF). The cost: a read of the database (at most every 5 s, only
  under traffic) and up to 5 seconds of delay.
- **It cannot stay on forever.** The mark is a deadline, not a switch, so a workflow that dies mid-way ends the mode by
  itself; and a mark that expires more than 15 minutes ahead is ignored. A missing table with no earlier mark means "no
  maintenance".
- **Risk.** Whoever has the database credentials can close the demo. If readiness is out of service Fly may route
  nothing during the window, which is the intent; the workflow does not need the HTTP route to end the mode, it deletes
  the row.

## Limits of the demo

With `RESOLVE_DEMO_LIMITS=true`:

- **Per-organization caps** (`DemoLimits`): 500 tickets, 200 customers (archived included), 50 team members (admins and
  agents not removed, invited included) and 100 articles; one more is a `409` Problem "Límite de la demostración".
  Customer portal accesses are limited by the customer cap. The cap is checked **before** the references are validated:
  at the cap, a request with an invalid `customerId` gets the `409`, not the `400`. The cap is exact under concurrency:
  the check takes a transaction-level advisory lock (`pg_advisory_xact_lock`) per resource and organization before
  counting and keeps it until the creation commits, so three simultaneous creations with two slots left give two rows and
  one `409`.
- **60 writes per minute per IP** (`POST`, `PUT`, `PATCH`, `DELETE` under `/api`), `429` with `Retry-After`, in a servlet
  filter because Fly does not limit at the edge. **The IP cannot be forged**: it is read from the header named in
  `RESOLVE_DEMO_CLIENT_IP_HEADER` (`Fly-Client-IP`), never from `X-Forwarded-For`, and with no header configured (or a
  value that is not an address) it is the socket's address. Note that with `forward-headers-strategy=framework` (`prod`)
  Spring makes `request.getRemoteAddr()` return the first `X-Forwarded-For`, which the client writes, so the filter
  unwraps the request to the original one (tested with `framework` active). An IPv6 client is counted by its **/64 prefix**, so rotating addresses inside a
  subscriber's prefix does not give a new bucket. That is safe only if the container is reachable
  **only through Fly's proxy**, which `fly.toml` guarantees by publishing just `[http_service]`. Fly's documentation
  describes `Fly-Client-IP` as the address "from the perspective of Fly Proxy" and recommends it over
  `X-Forwarded-For`, but does not state that a client-sent copy is overwritten: **check that on the first deployment**
  (send a request with a fake `Fly-Client-IP` and see which address the limit counts). Buckets are in memory (10 000
  addresses at most) and per machine; `fly.toml` runs one.
- **`X-Robots-Tag: noindex`** on every response of a demo (`RESOLVE_DEMO_ENABLED=true`).

## Notes of the T9.2 review

- **Base images** are pinned by digest in the `Dockerfile` (index digests, valid for amd64 and arm64) and Dependabot's
  `docker` ecosystem proposes new ones.
- **Temurin's `/__cacert_entrypoint.sh`** is replaced by our `ENTRYPOINT`. The script does nothing unless
  `USE_SYSTEM_CA_CERTS` is set (checked in the image) and the image never sets it, so nothing is lost. Neon uses a public
  CA that the JVM's own truststore already trusts; with `sslmode=verify-full` pgjdbc looks for `~/.postgresql/root.crt`
  (the user has no home) and may need `sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory` in `DATABASE_URL`: **check
  it on the first deployment**, `sslmode=require` (Neon's default) works without it.
- **The container port** is reachable only through Fly's proxy (`[http_service]` is the only service) and the application
  trusts `X-Forwarded-*` (`forward-headers-strategy=framework`).
- **HSTS `includeSubDomains`** has no effect on `*.fly.dev` (browsers do not apply it to a public suffix).

## Verify on the first deployment

Things that could not be checked without accounts, in the order they matter:

1. **`Fly-Client-IP` is overwritten by Fly's proxy.** Send a request with a fake `Fly-Client-IP` header and check which
   address the write limit counts. If Fly passes the client's copy through, the per-IP limit can be forged by changing
   that header: stop trusting it (leave `RESOLVE_DEMO_CLIENT_IP_HEADER` empty) until that is solved.
2. **A single machine that is out of service.** Whether Fly keeps routing to the only machine while readiness is
   `OUT_OF_SERVICE`. The reset does not depend on it to *end* the maintenance (it deletes the row), but if Fly stops
   routing, no request reaches the API and the application only notices through its own readiness check: while maintenance
   is on, readiness re-reads the mark (at most every 5 s), so Fly's checks alone are enough to bring it back to `UP`. If
   they are not (the proxy does not even run the check), the API stays closed until the mark's deadline (at most 10
   minutes). Run the reset by hand once and watch what a browser sees.
3. **`sslmode=verify-full` and the JVM truststore** with Neon (`sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory` in
   `DATABASE_URL`), and `PGSSLROOTCERT=system` in the runner's `psql`.
4. **GHCR package visibility** (public) and that `flyctl deploy --image` pulls it.
5. **Neon suspends** when nobody uses the demo. The health check does not query the database (outside maintenance), and `prod` sets `spring.datasource.hikari.minimum-idle=0` and `idle-timeout=60000`: HikariCP keeps 10 idle connections by default, which can keep a suspending database awake, so the pool now empties after a minute without traffic. If Neon still does not suspend, look at `maxLifetime` (30 minutes by default) and at the platform's own checks.
6. **IPv6:** the app is reachable over IPv6 on Fly; the write limit counts a `/64`.
