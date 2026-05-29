# Production Deployment Flow

This repo now uses one production deployment path. UAT and HRMS-UAT deployment workflows have been retired so production does not drift from a parallel release process.

## Branches

- `main` is the deploy branch.
- Feature branches merge into `main` after CI passes.

## CI Gates

Pushes to `main` run the CI workflow before deployment. The production deploy workflow only runs after a successful CI result.

## Production Deploy

Pushes to `main` trigger `.github/workflows/main-deploy.yml` after CI passes. The workflow:

1. Resolves the source SHA from the successful CI run.
2. Builds the `main-with-hrms` image by default.
3. Publishes `sha-<shortsha>` and `latest` tags to GHCR.
4. Copies `scripts/deploy-image.sh` to the production host through Cloudflare Access SSH.
5. Swaps the live container only after the new container passes health checks.
6. Runs `npm run verify:production` against the public production URL.
7. Runs `npm run smoke:production` when `PROD_LOGIN_EMAIL` and `PROD_LOGIN_PASSWORD` are configured.

Manual redeploys are available from the Production Deploy workflow:

- leave `image_tag` empty to rebuild from `main`
- set `image_tag` to deploy an existing published image tag
- use `build_target=main-with-hrms` for the current production architecture

## Apply Database Migrations (required when migrations land on `main`)

**The container deploy in `main-deploy.yml` does NOT apply Supabase migrations.**
If the PR being deployed adds files under `supabase/migrations/`, an operator
**must** apply them to the production host-local Supabase stack before the
new web app talks to users:

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

If a production deploy misbehaves:

1. Re-deploy the previous image tag from `main-deploy.yml` with `image_tag`.
2. If needed, revert the offending commit on `main` and let CI/deploy run.
3. If database changes caused the issue, restore the host-local Supabase data from backup before re-enabling traffic.
