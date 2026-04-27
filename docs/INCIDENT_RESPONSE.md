# Incident Response Runbook

Scope: production and UAT incidents for the FLC BI web app, Supabase backend, database, auth, and deployment pipeline.

## Severity Levels

| Severity | Definition | Initial response | Update cadence |
| -------- | ---------- | ---------------- | -------------- |
| SEV-1 | Production unavailable, data loss risk, auth outage, or cross-tenant exposure suspected | 15 minutes | Every 30 minutes |
| SEV-2 | Major workflow degraded for many users, failed deploy, or sustained error spike | 30 minutes | Every 60 minutes |
| SEV-3 | Limited feature issue, single module degraded, or low-volume alert | 1 business day | Daily until resolved |

## Roles

- Incident Commander: owns severity, timeline, decisions, and handoff.
- Technical Lead: coordinates diagnosis and mitigation.
- Communications Lead: posts user/internal updates and keeps stakeholders aligned.
- Scribe: records timeline, commands, links, and follow-up actions.

One person can hold multiple roles in a small incident, but every active incident must explicitly name an Incident Commander.

## First 15 Minutes

1. Acknowledge the alert in the on-call channel.
2. Declare severity and open an incident thread.
3. Capture the user-visible symptom, start time, affected environment, and suspected blast radius.
4. Check:
   - UAT/production synthetic workflow result
   - `/healthz` endpoint
   - Sentry issue/event trend
   - Supabase dashboard health and auth/API status
   - latest GitHub Actions deploy/release run
5. Decide whether to roll back, freeze deploys, or put the app in maintenance mode.

## Mitigation Paths

### Bad Frontend Release

1. Stop further deploys.
2. Re-deploy the previous known-good image tag with `deploy-image.yml`.
3. Run `npm run verify:uat` or the equivalent production verifier.
4. Confirm Sentry error rate returns to baseline.
5. Open a fix-forward PR after service is stable.

### Database Regression

1. Stop writes if data integrity is at risk.
2. Identify the last known good migration and timestamp.
3. Follow `docs/BACKUP_DR.md` for point-in-time restore or logical dump restore.
4. Verify critical table counts and tenant isolation before re-enabling writes.

### Auth Or Access-Control Incident

1. Disable affected accounts or sign-up paths if needed.
2. Preserve logs and audit entries.
3. Review RLS policy, `profiles`, module access, and recent permission changes.
4. Treat any possible cross-tenant exposure as SEV-1 until disproven.

### Supabase Or Infrastructure Outage

1. Check Supabase project status, host health, DNS/TLS, and nginx logs.
2. Confirm browser bundle is using the expected public Supabase origin.
3. If self-hosted Supabase is down, decide whether to restore the local stack or fail over to a prepared cloud/staging project.

## Communication Template

```text
Status: investigating | mitigating | monitoring | resolved
Severity: SEV-1 | SEV-2 | SEV-3
Environment: production | UAT | staging
Impact: <who is affected and what is broken>
Current action: <what we are doing now>
Next update: <time>
```

## Resolution Criteria

- User-facing symptoms are gone.
- Synthetic checks and manual smoke checks pass.
- Error rate returns to baseline.
- No unresolved data-integrity or access-control concern remains.
- Incident Commander declares monitoring or resolved.

## Postmortem

For SEV-1 and SEV-2, file a postmortem within 48 hours with:

- timeline
- customer/user impact
- root cause
- contributing factors
- what worked
- what did not work
- corrective actions with owners and due dates

Store postmortems in the project tracker or internal knowledge base; keep this repository free of customer-identifying incident details.
