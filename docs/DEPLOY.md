# Production Deploy

This repository supports an all-in-one production host:

- the web app is built as a static image and served by nginx
- the host runs the Supabase stack locally
- GitHub Actions pushes app updates through `main-deploy.yml`
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

1. Push code to `main`.
2. CI runs on the branch.
3. `main-deploy.yml` builds the image, stages it on the host, health-checks it,
   and swaps the live container only if the new container is healthy.
4. Optional login verification runs when `PROD_LOGIN_EMAIL` and
  `PROD_LOGIN_PASSWORD` are present.
5. Optional module smoke testing runs with those same credentials and checks the
  production main app, HRMS launcher, and standalone HRMS workspace.

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

Credentialed module smoke test:

```bash
PROD_URL=https://ubs.protonfookloi.com \
PROD_HRMS_URL=https://hrms.protonfookloi.com \
PROD_LOGIN_EMAIL=<admin-email> \
PROD_LOGIN_PASSWORD=<admin-password> \
npm run smoke:production
```

## Rollback

If a main-branch deploy misbehaves, redeploy the previous image tag or restore
the previous container version on the host. If the database changes caused the
issue, restore the local Supabase data from backup before re-enabling traffic.