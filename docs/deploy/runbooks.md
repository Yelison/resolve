# Operations runbooks

Backups, restore, rollback, secret rotation and a health checklist for the planned deployment: **Fly.io** for the API
and Keycloak, **PostgreSQL managed by Neon** (decision Q-05 in the [plan](../plans/2026-10-04-resolve-implementation-plan.md)).

## How to read this document

- **Rehearsed** means it was run, and the result is written down here.
- **To verify after the first deployment** means it depends on T9.3 (the deployment pipeline and the owner's Fly.io,
  Neon and storage accounts), which does not exist yet. Those steps are written from the providers' documented
  behaviour and have **not** been run. Do not treat them as tested.
- Nothing here contains real values. `<angle brackets>` are placeholders; secrets come from the secret store
  (`fly secrets`), never from the command line history or the repository.
- Commands marked **destructive** overwrite or delete data. Read the target twice before running them.

Variables used (names from the plan; `prod` has no defaults for them):

| Variable                     | Meaning                                       |
| ---------------------------- | --------------------------------------------- |
| `DATABASE_URL`               | JDBC URL of the Neon database                 |
| `DATABASE_USERNAME`          | Database role used by the API                 |
| `DATABASE_PASSWORD`          | Password of that role                         |
| `SPRING_PROFILES_ACTIVE`     | `prod,oidc`                                   |
| `RESOLVE_OIDC_ISSUER`        | Issuer URL of the Keycloak realm              |
| `RESOLVE_OIDC_CLIENT_ID`     | OIDC client id of the API in Keycloak         |
| `RESOLVE_OIDC_CLIENT_SECRET` | OIDC client secret of the API (rotated below) |
| `RESOLVE_PUBLIC_URL`         | Public URL of the application                 |

## 1. Backups

Two independent layers, because a provider snapshot does not protect against losing the provider account.

### 1.1 Provider recovery (Neon) — to verify after the first deployment

1. In the Neon project, note the **history retention** of the plan in use (it bounds how far back a restore can go).
2. To recover from a bad change inside that window, create a **branch from a past point in time** of the production
   branch. This does not touch production. Point a throwaway API (or `psql`) at the branch and check the data.
3. If the branch is right, either switch `DATABASE_URL` to the branch (see section 5) or copy what is missing back.

### 1.2 Weekly `pg_dump -Fc` to external storage — to verify after the first deployment

Run weekly from a machine or scheduled job that is **not** part of Fly.io or Neon, and keep the files in storage owned
by a different account (`<external-bucket>`), with a retention of at least `<n>` weeks.

Use `pg_dump` and `pg_restore` **version 17 or newer** (the same major as the server; check the Neon project's
PostgreSQL version): `pg_dump` refuses to dump a server newer than itself. If the machine has an older client, run it from a container, for example
`docker run --rm --network host -e PGPASSWORD postgres:17-alpine pg_dump …` (mount a volume to keep the file).

```sh
# Use the direct (non-pooled) connection string of Neon, not the pooler endpoint.
# The password comes from ~/.pgpass or PGPASSWORD, not from the command line.
pg_dump -Fc --no-owner --no-privileges \
  -h <neon-direct-host> -U <db-role> -d <db-name> \
  -f "resolve-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_restore --list resolve-<timestamp>.dump > /dev/null   # the file must be readable
```

**Keycloak data — to verify after the first deployment.** The realm export in the repository does not contain users
created afterwards or settings changed in the admin console. Decide how Keycloak's own database is backed up
(a separate dump, or a realm export on a schedule, unless it lives in the database covered by the dump above) and add
it here.

A backup that was never restored is not a backup: the restore in section 2 is repeated after the first real dump and
then at least once per quarter.

## 2. Restore into an empty database

Rule: **restore into a new, empty database or Neon branch, check it, and only then point the application at it.**
Never restore over the live database.

### 2.1 Rehearsal on the local PostgreSQL (done)

Rehearsed on 2026-10-05 with the `postgres:17-alpine` image from `docker-compose.yml`, in a disposable project on a
random free port, with the schema (Flyway migrations V1–V8) and demo data (V1000–V1006) loaded with `psql`. The
steps below were run exactly as written (only the project name differed) to produce the result table.

```sh
# Run from the repository root.
# 1. Disposable PostgreSQL on a free port (a project name keeps it apart from the development database)
export POSTGRES_PORT=<free-port> P=resolve-restore-rehearsal
docker compose -p "$P" up -d --wait
C=$(docker compose -p "$P" ps -q postgres)
pg() { docker exec -i -e PGPASSWORD=resolve "$C" "$@"; }   # local development credentials only

# 2. Load the schema and the demo data, in version order (sort -V: V10 goes after V9, V1000+ last)
for dir in migration demo; do
  for f in $(ls backend/src/main/resources/db/$dir/V*.sql | sort -V); do
    pg psql -q -v ON_ERROR_STOP=1 -U resolve -d resolve < "$f" > /dev/null || { echo "FAILED: $f"; break 2; }
  done
done

# 3. Dump (custom format), create an empty target database and restore
pg pg_dump -Fc -U resolve -d resolve -f /tmp/resolve.dump
pg createdb -U resolve resolve_restore
pg pg_restore --exit-on-error --no-owner --no-privileges -U resolve -d resolve_restore /tmp/resolve.dump

# 4. Compare source and restored databases. If the tables line below is empty or "0", the schema was never loaded
#    and the rehearsal proves nothing: stop and fix step 2.
for db in resolve resolve_restore; do
  echo "== $db"
  pg psql -U resolve -d "$db" -Atc "select count(*) || ' tables' from pg_tables where schemaname = 'public'"
  for t in $(pg psql -U resolve -d "$db" -Atc "select tablename from pg_tables where schemaname = 'public' order by 1"); do
    echo "$t=$(pg psql -U resolve -d "$db" -Atc "select count(*) from $t")"          # rows per table
  done
  pg psql -U resolve -d "$db" -Atc "select count(*) || ' indexes' from pg_indexes where schemaname = 'public'"
  pg psql -U resolve -d "$db" -Atc "select count(*) || ' constraints' from pg_constraint where connamespace = 'public'::regnamespace"
done

# 5. Remove everything (destructive: deletes the disposable database and its volume)
docker compose -p "$P" down --volumes
```

Result:

| Check                         | Source `resolve`                                                                                                                              | Restored `resolve_restore`       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Rows per table (9 tables)     | articles 4, customers 6, knowledge_categories 3, memberships 8, organizations 2, ticket_activities 21, ticket_messages 12, tickets 9, users 8 | identical                        |
| Indexes in `public`           | 35                                                                                                                                            | 35                               |
| Constraints in `public`       | 50                                                                                                                                            | 50                               |
| Dump size / `pg_restore` time | 37 KB                                                                                                                                         | `pg_restore` exit 0, about 0.6 s |

Also observed:

- Restoring a second time into the same, now non-empty database stops at the first object with
  `ERROR: relation "articles" already exists` and exit code 1 (because of `--exit-on-error`). That is why the target
  must be empty; the failure is safe, not a way to "refresh" a database.
- The rehearsal loads the SQL files with `psql`, so `flyway_schema_history` does not exist. A real dump includes it,
  and Flyway then sees the restored database as up to date: after a restore, start the API and check that it does not
  try to migrate (see section 6).
- `--no-owner --no-privileges` are used because the restoring role is not the role that created the objects. With
  Neon, create the target with the role the API uses.
- Not rehearsed: the API running against the restored database, and a dump from Neon (different roles and
  extensions may need `--no-owner` and a check of `pg_restore` warnings).

### 2.2 Restore of a production dump — to verify after the first deployment

1. Create an empty target: a new Neon branch or database (`<restore-target>`), not the live one.
2. `pg_restore --exit-on-error --no-owner --no-privileges -h <neon-direct-host> -U <db-role> -d <restore-target> <file.dump>`
3. Check row counts of the main tables against the last known figures, then run the API against the target with a
   temporary `DATABASE_URL` (a staging Fly machine or locally) and call `GET /api/actuator/health`.
4. Switch production (section 5) only after those checks. Keep the previous database for at least `<n>` days.

## 3. Rolling back a deployment

### 3.1 Rule: expand / contract

Every migration must work with **both the new and the previous version of the application**, because a rollback
leaves the new schema under the old code. So, in one release:

- Allowed: add a nullable column or one with a default, add a table or an index, add a constraint that old code
  already satisfies.
- Not allowed in the same release that stops using it: dropping or renaming a column or table, making a nullable
  column `NOT NULL`, changing a type. Do it in three steps, each one safe to roll back from:
  1. **Expand** (release N): add the new column or table next to the old one, and write to both.
  2. **Migrate** (release N+1): the code reads and writes only the new one; backfill existing rows.
  3. **Contract** (release N+2 or later): drop the old one, once the version that still used it can no longer be a
     rollback target.
- A migration is never edited after it has been applied (Flyway checksum); fix forward with a new one.

The pull request that adds a migration states how it was checked against the previous application version (for
example, by running the previous version's integration tests against the new schema). **Reviewers reject a migration
without that line.**

### 3.2 Procedure — to verify after the first deployment

The pipeline (T9.3) publishes an image tagged with the commit SHA and `latest`. Rolling back is redeploying an older
tag, not rebuilding.

```sh
fly releases -a <api-app>                       # find the last good release (the image tag may need `--image`: to verify)
fly deploy -a <api-app> --image ghcr.io/<owner>/<repo>:<previous-sha>
fly status -a <api-app>                         # machines healthy
curl -fsS https://<public-host>/api/actuator/health   # {"status":"UP"}
```

If the failed release applied a migration, check it against the rule above before deploying the old image. If the
migration is not compatible with the previous version, do **not** roll back the code: fix forward, or restore the
database (section 2) as a last resort and accept the loss of data written since.

## 4. Rotating the OIDC secret (`RESOLVE_OIDC_CLIENT_SECRET`)

Applies once authentication with Keycloak exists (F8) — **to verify after the first deployment**. Rotate on a schedule
(`<n>` months), when somebody who had access leaves, or immediately if it may have leaked.

> **Warning.** Regenerating the secret in Keycloak invalidates the old one at once, and the API keeps using the old
> value until step 2 finishes, so **sign-ins fail between steps 1 and 2**. Do it at a quiet time and keep the window
> short. If your Keycloak version supports a second (rotated) secret for the client, enable it to remove the gap.
> Restarting the API in step 2 should also **sign every user out**, because the BFF keeps sessions in memory (D-13)
> — to verify after the first deployment.

1. In the Keycloak admin console: realm `<realm>` → Clients → `<client-id>` → Credentials → **Regenerate** (destructive:
   the old secret stops working). Copy the new value straight into the next step; do not paste it in chat, tickets or
   the repository.
2. `fly secrets set RESOLVE_OIDC_CLIENT_SECRET=<new-secret> -a <api-app>` (this restarts the API). Set it from a
   terminal where the value is not echoed or stored in history.
3. Check: `GET /api/actuator/health` is `UP`, then sign in through the browser with a test account and sign out.
4. Record the date of the rotation in `<ops log>`. The old secret is not kept anywhere.

## 5. Switching the database

Changing `DATABASE_URL`, `DATABASE_USERNAME` and `DATABASE_PASSWORD` is also a `fly secrets set` and restarts the API.
Do it only after the restored database was checked, and keep the previous values until the new one has served traffic
for a while.

## 6. When `health` is `DOWN`

`management.endpoints.web.exposure.include=health` exposes the endpoint, and the application's context path is
`/api`, so locally it is `GET /api/actuator/health`. The `prod` profile (T9.3) adds readiness and liveness probes
(`/api/actuator/health/readiness`); on the deployment, the exact paths are **to verify after the first deployment**.
`OUT_OF_SERVICE` during the nightly demo reset is expected, not an incident.

Check in this order:

1. **Which component?** Read the logs: `fly logs -a <api-app>`. The health detail only appears if
   `management.endpoint.health.show-details` is configured, which is not set today (T9.2/T9.3 decide it — to verify);
   until then `health` answers just `UP` or `DOWN`.
2. **Database.** Is Neon reachable and not paused/over its limits (Neon console)? Wrong or rotated
   `DATABASE_PASSWORD`? Connection from the Fly region blocked? Try `psql` with the direct connection string.
3. **Migrations.** A Flyway failure at startup (checksum mismatch, a failed migration) keeps the app down. Read the
   first `FlywayException` in the logs; do not edit applied migrations — roll back (section 3) or fix forward.
4. **Configuration.** A missing variable fails the start in `prod` because there are no defaults. Compare
   `fly secrets list -a <api-app>` (names only) with the variable table above.
5. **Keycloak / OIDC.** If the API fails resolving `RESOLVE_OIDC_ISSUER`, check the Keycloak app is running
   (`fly status -a <keycloak-app>`) and the issuer URL is reachable from the API.
6. **Memory or crash loop.** `fly status` shows restarts; look for `OutOfMemoryError`. Scale the machine only after
   confirming that is the cause.
7. **Recent change?** If it started right after a deployment, roll back (section 3) first and investigate afterwards.

Then record what it was and what fixed it in `<ops log>`.
