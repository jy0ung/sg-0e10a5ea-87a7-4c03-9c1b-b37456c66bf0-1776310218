# Phase 5 — observability & launch-readiness evidence

Single page operators use to gather the evidence required by the
[launch checklist](./LAUNCH_CHECKLIST.md) Phase 5 line items. Everything in
this document is **operator-side** — none of it can be produced from this
repo alone because the artefacts depend on a running production stack or
an external scanner.

Treat the file as a punch-list. When you produce an artefact, add a link
in the relevant section and tick the box in
[`docs/LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md).

---

## 1. Sentry / RUM evidence

Phase 5b shipped the in-code wiring:

- `Sentry.browserTracingIntegration()` is registered when `VITE_SENTRY_DSN`
  is set (see [errorTrackingService.ts](../src/services/errorTrackingService.ts)).
- All five Core Web Vitals (CLS, FCP, INP, LCP, TTFB) are reported via
  [webVitalsService.ts](../src/services/webVitalsService.ts).
- `performanceService.endQueryTimer` and `logComponentRender` forward to
  `Sentry.setMeasurement` through
  [performanceService.ts](../src/services/performanceService.ts).

Operator tasks:

1. Set `VITE_SENTRY_DSN` in the production deploy.
2. After the next deploy, open Sentry → Performance and confirm a
   `pageload` transaction is present with `measurements.lcp` populated.
3. Trigger a synthetic error from the running app (e.g. via the dev
   tools) and confirm it appears in Sentry within 60s.
4. Attach a screenshot of the Performance transaction view (including
   the LCP, INP, CLS measurements) to this section as `sentry-rum.png`.

## 2. Edge-function structured logs

Phase 5c migrated every edge function to
[`supabase/functions/_shared/logger.ts`](../supabase/functions/_shared/logger.ts).
Each request now emits `request.start` / `request.end` JSON lines with
the canonical fields `ts`, `level`, `fn`, `request_id`, `msg`. Inbound
`x-request-id` headers are honoured; otherwise the wrapper mints a UUID.
The id is reflected on every response so clients can correlate.

Operator tasks:

1. From the Supabase Functions log explorer, filter on
   `fn:"invite-user"` and run an invite. Confirm you see the matching
   `request.start` and `request.end` records and that they share a
   `request_id`.
2. Confirm the response header `x-request-id` returned to the client
   matches the value in the logs.
3. Configure an alert rule on `level:"error"` to route to your on-call
   channel (Slack / email). Attach a screenshot of the rule configuration
   as `edge-log-alert.png` and link from this section.

## 3. WCAG 2.0 AA evidence (axe)

Phase 5a extended [`e2e/accessibility.spec.ts`](../e2e/accessibility.spec.ts)
to cover the three Phase 4 surfaces (`/inbox`, `/home`,
`/admin/kpi-studio`) alongside the existing public + critical
authenticated routes.

To capture the evidence:

```bash
# From the repo root
npx playwright test e2e/accessibility.spec.ts --reporter=html

# Generated report at playwright-report/index.html
```

Attach the generated HTML report to a release tag as `wcag-axe.zip` or
host it behind your internal evidence URL.

Acceptance threshold: **zero `serious` or `critical` violations** on any
of the scanned routes. The spec already enforces this — if it passes,
the threshold is met.

## 4. Lighthouse evidence

There is no in-tree Lighthouse CI runner. Lighthouse runs depend on a
headless Chrome instance and a live host, so this is captured manually
during release validation.

Routes to score (these are the canonical first-paint surfaces):

```
/welcome
/login
/dashboard          (post-login)
/auto-aging/vehicles
/sales
/sales/orders
/inbox
/home
```

Procedure:

1. From a clean Chrome profile, open DevTools → Lighthouse against
   `https://ubs.protonfookloi.com`.
2. Run each route in turn (Performance + Accessibility + Best Practices,
   mobile preset).
3. Save the JSON reports under your evidence store, named
   `lighthouse-<route-slug>.json`.
4. Record the scores in the table below for the release tag:

| Route                  | Perf | A11y | Best-Practices | Notes |
|------------------------|------|------|----------------|-------|
| `/welcome`             |      |      |                |       |
| `/login`               |      |      |                |       |
| `/dashboard`           |      |      |                |       |
| `/auto-aging/vehicles` |      |      |                |       |
| `/sales`               |      |      |                |       |
| `/sales/orders`        |      |      |                |       |
| `/inbox`               |      |      |                |       |
| `/home`                |      |      |                |       |

Target: Performance ≥ 80, Accessibility = 100, Best Practices ≥ 90 on
the mobile preset. Anything below 80 perf needs a regression issue
opened against that route before launch.

## 5. PITR + restore-drill evidence

See [`docs/DR_DRILLS.md`](./DR_DRILLS.md) for the existing runbook. The
launch-checklist line items that close from drill execution:

- Production Supabase PITR enabled (screenshot of the Supabase Database
  → Backups page).
- Most recent restore-to-staging drill recorded — include drill date,
  RTO, RPO, and the staging URL that received the restored snapshot.
- DR runbook tabletop exercise minutes signed by at least one director.

Attach the artefacts in the DR drill log and link them here when ready.

## 6. Supply-chain scan evidence

Both scans run outside this repo:

- **OSV-Scanner**: `osv-scanner --recursive .` from a clean checkout of
  the release tag. Attach the JSON output as
  `osv-scanner-<tag>.json`.
- **CodeQL**: enable the default JavaScript / TypeScript suite on the
  GitHub repo. Attach the Security tab summary screenshot for the
  release SHA.

Both must show zero `critical` and zero unreviewed `high` findings.

---

## 7. Operator vs. code-side split

| Item                              | Code  | Operator |
|-----------------------------------|-------|----------|
| Sentry browserTracing integration | ✅ 5b |          |
| Web Vitals subscription           | ✅ 5b |          |
| performanceService → Sentry       | ✅ 5b |          |
| Edge structured logs              | ✅ 5c |          |
| request_id correlation            | ✅ 5c |          |
| Mobile-first StandardTable        | ✅ 5d |          |
| WCAG axe coverage extension       | ✅ 5a |          |
| Sentry DSN provisioning           |       | ⏳        |
| Sentry alert rule wiring          |       | ⏳        |
| Source-map upload secret          |       | ⏳        |
| Lighthouse run + capture          |       | ⏳        |
| WCAG axe report capture           |       | ⏳        |
| PITR enable                       |       | ⏳        |
| Restore-to-staging drill          |       | ⏳        |
| DR tabletop minutes               |       | ⏳        |
| OSV-Scanner attach                |       | ⏳        |
| CodeQL enable + attach            |       | ⏳        |

The launch checklist closes when every operator item is ticked.
