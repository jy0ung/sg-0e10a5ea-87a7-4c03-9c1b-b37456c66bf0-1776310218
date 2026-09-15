# Staging Validation And Release Qualification

Status: **BLOCKED — NOT READY FOR PRODUCTION**

Qualification date: 2026-09-15

Source base revision: `d45023d` on `hardening/production-readiness-2026-08-03`

Candidate: the complete reviewed tree frozen by the release-candidate commit containing this document.

## Current staging environment result

The repository has a GitHub `uat` environment and historical deployment evidence for `https://uat.protonfookloi.com`. The environment currently has no Actions secrets or variables. This checkout has no Supabase project link, staging database URL, staging service credentials, deployment credentials, SMTP configuration, Sentry configuration, or credentialed UAT test account.

Public read-only checks on 2026-09-15 returned Cloudflare HTTP 530 / tunnel error 1033 for `/`, `/healthz`, and `/hrms/`. The UAT runtime is therefore unavailable and the exact release candidate has not been deployed there. These conditions block credible staging qualification.

No production endpoint, database, migration, deployment, or customer communication was touched.

## UAT recovery diagnosis

Read-only infrastructure inspection on 2026-09-15 identified the failure boundary:

- Cloudflare DNS for `uat.protonfookloi.com` resolves through the Cloudflare proxy.
- The dedicated `flc-bi-uat` tunnel (`86fb1fab-fae6-44a2-b001-ac2a275c1256`) exists but reports zero active connectors. This accounts for Cloudflare error 1033.
- The available host is the active production host. It runs the production application and production tunnel; it has no UAT application container or UAT origin port. It must not be repurposed as UAT.
- The historical UAT Supabase project reference in the provisioning example no longer resolves in public DNS. It cannot be treated as a live project without provider-side verification.
- The former scheduled UAT synthetic workflow was retired when deployment was consolidated into the production workflow. The current repository has no UAT deployment workflow.

UAT therefore needs an isolated deployment host or runtime, a connector for the existing UAT tunnel, and a separately identifiable Supabase project before application deployment can begin. Do not point the UAT hostname or qualification runner at the running production host or database.

## UAT infrastructure inventory

### Cloudflare and deployment host

- Dedicated tunnel: `flc-bi-uat`; install its connector credentials only on the isolated UAT host.
- Public hostname: `https://uat.protonfookloi.com`.
- Ingress: route the hostname to the UAT application origin, then validate `/healthz` returns the application-specific `ok` response.
- Deployment host: isolated from the running production workload, with Docker, a read-only runtime filesystem, and sufficient storage for immutable images.
- Deployment access: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`, `CF_ACCESS_CLIENT_ID`, and `CF_ACCESS_CLIENT_SECRET` as GitHub environment secrets.
- Runtime selection: `DEPLOY_CONTAINER_NAME` and `DEPLOY_HOST_PORT`. The current deploy workflow reads these as environment secrets.

### Application artifacts

- Build the main application with `VITE_APP_URL=https://uat.protonfookloi.com`, the isolated `VITE_SUPABASE_URL`, its browser-safe `VITE_SUPABASE_ANON_KEY`, `VITE_APP_VERSION` set to the frozen commit, and the UAT `VITE_SENTRY_DSN`.
- Set `SUPABASE_INTERNAL_URL` only in the trusted build/runtime path; never expose it through a `VITE_*` name.
- Build HRMS into the same UAT image at `/hrms/` with `BUILD_HRMS_WEB=true`, or provision a separate isolated HRMS host and set `STAGING_HRMS_APP_URL` accordingly.
- Keep the image digest and the frozen commit SHA together in the deployment record.

### Isolated Supabase

- Create or positively verify a non-production project and record its project reference and environment label.
- Required trusted values: database connection URL, service-role key, project access token, and database password.
- Required browser-safe values: project URL and anon/publishable key.
- Configure auth site URL and allowed redirects for the UAT main and HRMS routes.
- Configure `ALLOWED_ORIGINS`, edge-function secrets, storage buckets, and storage policies.
- Establish a backup/restore target before migration. Run the guarded migration only after confirming the project identity is not production.

### Email and observability

- Configure a staging SMTP or test-mail provider, staging sender identity, and an allow-list of test recipients.
- Configure a dedicated Sentry or equivalent UAT project with DSN, environment, and release set to the frozen commit.
- Verify browser, server, and edge failures can be correlated without logging credentials.

### GitHub `uat` environment

The environment currently has no secrets, variables, protection rules, or deployment branch policy. Populate values only after the isolated resources above exist.

Deployment/build secret names already consumed by the repository are:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SENTRY_DSN
SUPABASE_INTERNAL_URL
SSH_HOST
SSH_PORT
SSH_USER
SSH_PRIVATE_KEY
SSH_KNOWN_HOSTS
CF_ACCESS_CLIENT_ID
CF_ACCESS_CLIENT_SECRET
DEPLOY_CONTAINER_NAME
DEPLOY_HOST_PORT
```

The guarded qualification command requires these operator-supplied names:

```text
STAGING_APP_URL
STAGING_HRMS_APP_URL (optional when served at /hrms/)
STAGING_SUPABASE_URL
STAGING_SUPABASE_ANON_KEY
STAGING_SUPABASE_SERVICE_ROLE_KEY
STAGING_DB_URL
STAGING_LOGIN_EMAIL
STAGING_LOGIN_PASSWORD
CONFIRM_STAGING_TARGET=isolated-staging
STAGING_APPLY_MIGRATIONS=1
```

Add an environment deployment policy restricted to the release branch or an approved tag before enabling a UAT deployment workflow. The retired workflow names are historical evidence and must not be restored with stale credentials or targets.

## Local qualification completed while staging is blocked

The disposable reconstruction now creates a unique Supabase project for every run and removes its database volumes with `supabase stop --no-backup`. This prevents a cached local database from skipping newly added migrations.

`npm run test:integration` passed from a fresh 154-migration reconstruction:

```text
database lint                                      PASS
public tables without RLS                         0
unsafe SECURITY DEFINER search paths              0
anonymous application-owned functions             0
unscoped authenticated read policies              0
live integration files                            6 passed
live integration tests                            149 passed
```

The live suite now includes the application HRMS leave service:

```text
employee creates leave request
→ leave row persists
→ canonical approval instance routes to a specific manager
→ employee self-approval is rejected
→ assigned manager approves
→ approval decision persists
→ leave and workflow become approved
→ employee retrieves the final state
→ second-company user retrieves no row
```

Finance/AP coverage records and reverses payment events, enforces invoice lifecycle rules, and verifies AP aging. Sales coverage exercises company-scoped stage transitions and dashboard aggregates. Internal request coverage persists, retrieves, isolates, and cancels a ticket.

## Defects found and repaired

### P1 — approval decisions were incompatible across the two workflow engines

The original schema required `approval_decisions.approval_request_id`, while the current HRMS and internal-request engines write `instance_id`. The integrity trigger assumed every decision had an instance, and the hardening migration removed the only insert policy while retaining read rules for the legacy path only. HRMS approvals failed with a not-null error; legacy decisions failed with `Approval instance has no current step`.

Migration `20260915100000_approval_decision_compatibility.sql`:

- makes the legacy target nullable;
- requires exactly one of `approval_request_id` and `instance_id`;
- validates the current step, pending state, step order, and self-approval rule for both engines;
- permits inserts only from the assigned specific user, direct manager, or active HRMS role assignee;
- scopes decision history to the requester, approver, assigned reviewer, or same-company management;
- removes anonymous and ordinary authenticated execution from the trigger function.

Regression evidence covers a complete HRMS leave approval and a legacy approval decision, including unauthorized and cross-tenant cases. Final status: repaired locally; staging revalidation pending.

### P1 — disposable reconstruction reused a cached database snapshot

The integration runner used a fixed project ID and stopped Supabase without `--no-backup`. A later run could restore old volumes and skip new migrations while still running tests. The runner now uses a unique project ID per invocation and deletes all run volumes during cleanup. Final status: repaired and verified by observing the full migration history apply on consecutive runs.

## Exact staging execution

Store the following outside the repository. Report only whether each value is present and valid:

- `STAGING_APP_URL`
- `STAGING_HRMS_APP_URL` when HRMS is not served at `/hrms/`
- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_SUPABASE_SERVICE_ROLE_KEY`
- `STAGING_DB_URL`
- `STAGING_LOGIN_EMAIL`
- `STAGING_LOGIN_PASSWORD`
- `ALLOWED_ORIGINS`
- SMTP provider credentials and sender identity
- edge-function secrets used by enabled integrations
- `VITE_SENTRY_DSN` and release/environment metadata
- deployment host or platform credentials

After restoring the isolated UAT runtime and deploying an image built from this release-candidate commit, run:

```bash
set -a
. /secure/path/ubs-staging.env
set +a

CONFIRM_STAGING_TARGET=isolated-staging \
STAGING_APPLY_MIGRATIONS=1 \
npm run qualify:staging
```

The command refuses known production hostnames and non-HTTPS targets. It performs a migration dry run, applies migrations only with the explicit flag, checks migration history and database catalogs, lints the remote schema, seeds unique synthetic tenants, runs 149 live tests, verifies deployed HTTPS/security headers/bundle configuration/auth reload/logout, probes anonymous and invalid-token edge requests, and cleans the synthetic tenants.

If migrations were applied separately, use `STAGING_SCHEMA_ALREADY_CURRENT=1` instead of `STAGING_APPLY_MIGRATIONS=1`; the catalog gate still requires migration `20260915100000`.

## Manual evidence still required

- Deploy the main and HRMS artifacts built from the exact candidate revision and record immutable image digests.
- Verify allowed and rejected browser origins against edge functions and credentialed browser requests.
- Verify invite/recovery URLs return only to approved staging origins.
- Send invite/recovery mail only to staging recipients and record delivery plus safe failure handling.
- Submit one harmless Sentry event and correlate browser, server, and edge request identifiers without logged credentials.
- Verify storage buckets, attachment policies, notification persistence, and protected notification links.
- Reconcile one dashboard from fixture source rows through stored rows, API result, aggregate, and UI; record expected and actual totals.
- Exercise duplicate submission, stale update, expired auth, unavailable API/edge function, rejected write, and retry behavior; confirm no false success state.
- Complete a backup and restore into a separate recovery target and record RTO/RPO in `docs/DR_DRILLS.md`.
- Install the HRMS mobile build on an emulator or device and verify secure session storage, foreground/background behavior, logout, deep links, and push delivery.

Production-data reconciliation remains a production-release prerequisite and requires separate authorization.

## Release decision

The repaired candidate is locally qualified, but UAT is unavailable and lacks the configuration needed to deploy and exercise this exact tree. Production release remains blocked until the automated staging command passes against a restored isolated environment and the manual evidence above is recorded.
