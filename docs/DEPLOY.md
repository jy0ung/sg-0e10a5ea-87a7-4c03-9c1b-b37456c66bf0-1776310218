# Production Deploy

This repository supports an all-in-one production host:

- the web app is built as a static image and served by nginx
- the host runs the Supabase stack locally
- production promotion is an explicit manual GitHub Actions dispatch through `main-deploy.yml`; merging to `main` does not deploy
- the app container reaches local Supabase through Docker's host gateway alias

## Host Bootstrap

Run this on the production Ubuntu host from the repo root:

```bash
bash scripts/setup-production-host.sh app.example.com
```

Recommended environment overrides:

```bash
APP_URL=https://app.example.com \
SUPABASE_INTERNAL_URL=http://host.docker.internal:54321 \
bash scripts/setup-production-host.sh app.example.com /srv/flc-bi
```

The script installs the base packages, Docker, Node 20, the Supabase CLI,
cloudflared, swap, and the workspace dependencies. It also installs a
`flc-bi-supabase.service` oneshot wrapper that can start the local Supabase
stack on boot.

## Local Supabase Stack

After bootstrap, verify the stack:

```bash
sudo systemctl status flc-bi-supabase.service
supabase status
```

For first-time admin bootstrap, use the existing repo helper once you have the
local service-role credentials available:

```bash
npx tsx scripts/bootstrap-admin.ts
```

## Cloudflare Access SSH

If you want GitHub Actions to deploy onto this host, run the SSH tunnel helper
after the Cloudflare tunnel and access application are in place:

```bash
TUNNEL_NAME=flc-bi-prod \
SSH_ACCESS_HOSTNAME=ssh.example.com \
DEPLOY_USER=deploy \
DEPLOY_PUBKEY='ssh-ed25519 AAAA... github-deploy' \
sudo bash scripts/configure-cloudflare-access-ssh.sh
```

Paste the resulting service-token and host-key values into the production GitHub
environment secrets:

- `SSH_HOST`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_KNOWN_HOSTS`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

## Deploy Flow

1. Merge code to `main`; CI runs, but **no production deployment starts automatically**.
2. Review CI, staging qualification, migration, backup, and change-window evidence.
3. Apply any required production database migrations separately.
4. Explicitly dispatch `main-deploy.yml`.
5. The deploy verifies that every release migration is already present in the production migration ledger before the live app container is touched.
6. The candidate image is staged on a temporary port and health-checked.
7. The current production container is preserved as a rollback container before the candidate is promoted.
8. Public production verification always has Playwright Chromium available.
9. Credentialed RPC/module smoke checks run when the configured production smoke credentials validate.
10. If post-promotion verification fails, the workflow restores the preserved previous container. It is deleted only after full success.

Required production secrets for the main-deploy workflow:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL`
- `VITE_HRMS_APP_URL`
- `SUPABASE_INTERNAL_URL` set to `http://host.docker.internal:54321` for the
  all-in-one host
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

Manual production verification from the host or a trusted admin machine:

```bash
PROD_URL=https://ubs.protonfookloi.com \
PROD_EXPECTED_SUPABASE_URL=https://ubs.protonfookloi.com \
PROD_EXPECTED_HRMS_APP_URL=https://hrms.protonfookloi.com \
npm run verify:production
```

Add `PROD_LOGIN_EMAIL`, `PROD_LOGIN_PASSWORD`, and `PROD_LOGIN_REQUIRED=1` only when the verifier should include a real browser login check.

Credentialed module smoke test:

```bash
PROD_URL=https://ubs.protonfookloi.com \
PROD_HRMS_URL=https://hrms.protonfookloi.com \
PROD_LOGIN_EMAIL=<admin-email> \
PROD_LOGIN_PASSWORD=<admin-password> \
npm run smoke:production
```

## Rollback

The deployment script preserves the prior live container until all
post-promotion verification succeeds. A failed candidate is automatically
replaced by that preserved container through `scripts/rollback-image.sh`.

After a completed release, manually dispatch `main-deploy.yml` with the
previous known-good `image_tag` when an application rollback is required.
Database recovery is separate: follow `docs/BACKUP_DR.md` and require restore
evidence before relying on it for a production incident.