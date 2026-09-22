# Production Deployment Flow

This repo now uses one production deployment path. UAT and HRMS-UAT deployment workflows have been retired so production does not drift from a parallel release process.

## Branches

- `main` is the deploy branch.
- Feature branches merge into `main` after CI passes.

## CI Gates

Pushes to `main` run CI, but **CI success does not deploy production**. Production promotion is a separate explicit operator action through the `Production Deploy` workflow.

## Production Deploy

`.github/workflows/main-deploy.yml` is **manual-only** (`workflow_dispatch`). A production operator chooses when to promote after reviewing the CI/staging/operational evidence.

The workflow:

1. Resolves the explicitly dispatched source SHA.
2. Builds a `sha-<shortsha>` image unless an existing `image_tag` was supplied.
3. Publishes the candidate to GHCR when building.
4. Builds a release migration manifest and requires every release migration to exist in the production migration ledger **before touching the current app container**.
5. Starts the candidate on a staging port and requires `/healthz` to pass.
6. Preserves the current production container as `<container>-rollback` before promotion.
7. Promotes the candidate and verifies the canonical local endpoint.
8. Installs Playwright Chromium unconditionally and runs `npm run verify:production` against the public production URL.
9. Runs RPC canaries and credentialed module smoke when the configured smoke login is valid.
10. Restores the preserved previous container automatically when post-promotion verification fails; the preserved rollback container is removed only after the complete workflow succeeds.

Dispatch options:

- leave `image_tag` empty to build from the dispatched source SHA
- set `image_tag` to deploy an already-published image tag

This separation is deliberate: merging to `main` is not production permission.

## Apply Database Migrations (required when migrations land on `main`)

**The container deploy in `main-deploy.yml` does NOT apply Supabase migrations.**
If the release adds files under `supabase/migrations/`, an operator
**must** apply them to the production host-local Supabase stack before
dispatching the application promotion. The deploy then verifies the release
manifest against `supabase_migrations.schema_migrations` and refuses to
promote the image if any required migration is absent:

```bash
# On the production host (after `git pull` lands the new migrations):
cd /srv/flc-bi
supabase db push --local --dry-run   # list pending migrations — sanity check
supabase db push --local --yes       # apply them

# Force a PostgREST schema-cache reload (idempotent; auto on hosted Supabase,
# explicit on the self-hosted stack we run in production):
psql "$(supabase status -o env | awk -F= '/^DB_URL=/{print $2}' | tr -d \"'\\\"\")" \
     -c "NOTIFY pgrst, 'reload schema';"
```

If you skip this step, the new web container will surface "Platform
configuration mismatch" via the global banner (and `PageErrorState`'s
schema-cache-miss branch) on every page that depends on a new RPC or table.
Past incidents of this shape: `get_role_home_kpis` on 2026-05-28 — see
`AUDIT.md` Re-audit section for the full root-cause writeup.

The Phase 7+ migration `20260528100000_schema_qualify_and_reload.sql`
verifies the ledger state and refuses to apply unless the prior Phase 3+
migrations have been applied first — this is a deliberate safety net, not
a workaround.

## Production Image Layout

The current `main-with-hrms` image serves:

- main UBS app at `/`
- compatibility HRMS workspace at `/hrms/`
- root HRMS workspace when the request Host is `hrms.protonfookloi.com`

The production app is expected to build with `VITE_HRMS_APP_URL=https://hrms.protonfookloi.com` so the HRMS module launcher opens the HRMS workspace hostname.

## Required Production Secrets

The `production` GitHub environment must define:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL`
- `VITE_HRMS_APP_URL`
- `SUPABASE_INTERNAL_URL`
- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_KNOWN_HOSTS`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`
- `DEPLOY_CONTAINER_NAME`
- `DEPLOY_HOST_PORT`
- `GHCR_READ_USERNAME`
- `GHCR_READ_TOKEN`

Optional production verification secrets:

- `PROD_LOGIN_EMAIL`
- `PROD_LOGIN_PASSWORD`

## Verification

Run the production verifier locally with:

```bash
PROD_URL=https://ubs.protonfookloi.com \
PROD_EXPECTED_SUPABASE_URL=https://ubs.protonfookloi.com \
PROD_EXPECTED_HRMS_APP_URL=https://hrms.protonfookloi.com \
npm run verify:production
```

The verifier checks the health endpoint, confirms the production bundle uses the expected browser-facing Supabase URL, confirms the main app bundle contains the expected HRMS workspace URL, and runs optional browser login verification only when `PROD_LOGIN_REQUIRED=1` is set alongside production login credentials.

To include the real browser login check in the verifier, run:

```bash
PROD_URL=https://ubs.protonfookloi.com \
PROD_EXPECTED_SUPABASE_URL=https://ubs.protonfookloi.com \
PROD_EXPECTED_HRMS_APP_URL=https://hrms.protonfookloi.com \
PROD_LOGIN_EMAIL=<admin-email> \
PROD_LOGIN_PASSWORD=<admin-password> \
PROD_LOGIN_REQUIRED=1 \
npm run verify:production
```

Run the credentialed module smoke locally with:

```bash
PROD_URL=https://ubs.protonfookloi.com \
PROD_HRMS_URL=https://hrms.protonfookloi.com \
PROD_LOGIN_EMAIL=<admin-email> \
PROD_LOGIN_PASSWORD=<admin-password> \
npm run smoke:production
```

The module smoke logs into the main app, checks the active platform modules, verifies the HRMS module card redirects to `hrms.protonfookloi.com`, logs into HRMS, and checks the standalone HRMS routes.

## Rollback

During a deployment, `scripts/deploy-image.sh` preserves the current production
container as `<container>-rollback`. If canonical health verification or any
subsequent workflow verification fails, `scripts/rollback-image.sh` restores
that preserved container. The workflow removes it only after successful
verification.

For a later rollback after a completed release:

1. Manually dispatch `main-deploy.yml` with the previous known-good `image_tag`.
2. Verify production with `npm run verify:production` and the configured smoke checks.
3. Revert/fix-forward source separately; a source revert does not deploy by itself.
4. If database state itself is damaged, follow `docs/BACKUP_DR.md`; do not assume an older application image can reverse destructive database changes.

The migration-ledger preflight permits the database to be ahead of an older image so rollback images remain deployable when schema changes are backward compatible.
