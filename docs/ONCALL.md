# On-Call Runbook

## Purpose

Define who owns operational response for FLC BI after launch and how alerts are triaged, escalated, and handed off.

## Coverage

- Primary coverage: business hours until a formal rotation is staffed.
- Launch week coverage: assign a named primary and backup every day.
- Production alerts must have one primary responder and one backup responder.

## Rotation Record

Keep the live rota in the team calendar or incident tool. Mirror only the role names here, not personal phone numbers.

| Role | Responsibility | Required before launch |
| ---- | -------------- | ---------------------- |
| Primary on-call | Acknowledge production alerts and start incident response | Yes |
| Backup on-call | Take over if primary is unavailable or incident escalates | Yes |
| Engineering lead | Approve rollback, hotfix, and data-recovery decisions | Yes |
| Business owner | Approve user-facing communication and launch go/no-go | Yes |

## Alert Sources

| Source | Purpose | Expected route |
| ------ | ------- | -------------- |
| UAT synthetic workflow | Early warning for UAT health, bundle config, and login flow | GitHub Actions notification |
| Production uptime monitor | Public availability and `/healthz` checks | On-call channel |
| Sentry | Frontend crash/error spikes and release regressions | On-call channel |
| Supabase dashboard | Database, auth, storage, and edge-function health | On-call channel |
| GitHub Actions | Release, deploy, backup, and security workflow failures | On-call channel |

## Triage Flow

1. Acknowledge the alert.
2. Check whether the issue affects production, UAT, staging, or only CI.
3. Classify severity using `docs/INCIDENT_RESPONSE.md`.
4. If production user impact is likely, open an incident thread and name an Incident Commander.
5. If the alert is noisy or non-actionable, record the reason and tune the threshold after service is stable.

## Escalation

Escalate immediately when:

- production login is unavailable
- cross-tenant data exposure is suspected
- data loss or corruption is suspected
- database restore or rollback may be required
- no responder acknowledges within the severity target

## Handoff Checklist

Before handing off, the current responder must provide:

- current severity and status
- timeline so far
- dashboards/logs already checked
- active mitigation
- next recommended action
- unresolved risks

## Launch Requirement

Before production cutover, fill the live rota and confirm every alert source routes to the current primary and backup responder. This document is the process contract; the actual contact list should stay in the private team system.
