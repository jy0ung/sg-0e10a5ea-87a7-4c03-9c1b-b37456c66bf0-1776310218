# Repository baseline audit

This records the engineering baseline before live database validation. Current release-boundary evidence is tracked in [Production-readiness validation](PRODUCTION_READINESS.md).

Validated on 2026-09-15 against working-tree changes based on `d45023d`.
Existing typed SDK work was preserved and completed alongside this cleanup. The reviewed changes are included in this release candidate.

## Findings and repairs

| Finding | Repair |
| --- | --- |
| Root TypeScript command checked an empty solution config and reported success | Explicitly check main app, tooling, HRMS web, and mobile configurations; retain architecture boundary checks |
| Main app had 246 TypeScript errors; HRMS web initially had 90 | Repair service contracts, schema fields, nullable RPC arguments, UI props, imports, fixtures, and role/status handling; align HRMS aliases with its Vite configuration |
| Four unit tests failed | Align optional RPC expectations with the actual SDK contract |
| Dependency audit reported 15 advisories, including six high severity | Refresh npm lockfile, repair React peer dependency declaration, and migrate router dependency to v7; fresh npm install and app/browser checks pass |
| Environment file, Supabase CLI metadata, and competing Bun locks were tracked | Remove them from the index, retain local environment/CLI configuration, and standardize on npm; enforce tracked-file hygiene |
| Generated CHECK enums could survive dropped constraints; nullable RPC overloads diverged | Replay constraint removal/replacement, augment all nullable overloads, add six generator regression tests, and make repeated generation a no-op |
| Browser route assertion swallowed failures and auth mocks assumed port 3001 | Enforce the assertion and honor the configured test port |

The inspected service-role token in the local environment file is a Supabase demo token, not evidence of a leaked production credential. The local environment file remains available and ignored by Git.

Additional runtime fixes include missing icons/components, master-data action handlers, company-scoped vehicle lookup, canonical leave approval routing, persisted notification links, and required-field validation before database inserts.

## Repeatable baseline gate

```bash
npm ci
npm run check:baseline
```

The baseline gate runs tracked-file hygiene, lint with zero warnings, all app TypeScript checks, repository architecture checks, unit tests, service-role and edge-function security checks, dependency audit, the main build with bundle budgets, and HRMS web/mobile builds. CI now enforces hygiene and actual type checks, builds HRMS web, and treats its dependency-audit job as blocking.

### Verified results

| Check | Result |
| --- | --- |
| Fresh `npm ci` | Passed |
| `npm run check:baseline` | Passed |
| TypeScript and architecture boundaries | Passed across all configured apps |
| Unit tests | 1,143 passed; 28 skipped (146 passing files, three skipped files) |
| `npm audit --audit-level=low` | Zero vulnerabilities reported |
| Main app build and bundle budgets | Passed |
| HRMS web and mobile builds | Passed |
| Desktop routes and accessibility browser checks | 30 passed |
| Responsive browser checks | Eight passed; two project-specific skips |
| Dedicated HRMS browser checks | Seven passed |
| Repeated `npm run gen:types:write` | No generated changes |
| `git diff --check` | Passed |

## Browser reproduction

Install the browser once with `npx playwright install chromium`, then run:

```bash
E2E_PORT=3107 CHOKIDAR_USEPOLLING=true VITE_HRMS_APP_URL='' npx playwright test e2e/routes.spec.ts e2e/accessibility.spec.ts --project=chromium
E2E_PORT=3108 CHOKIDAR_USEPOLLING=true VITE_HRMS_APP_URL='' npx playwright test e2e/responsive.spec.ts --project=mobile-chromium --project=tablet-chromium
HRMS_WEB_E2E_PORT=3109 CHOKIDAR_USEPOLLING=true npx playwright test --config apps/hrms-web/playwright.config.ts
```

## Validation limits

The browser suites in this baseline use mocked authentication/data. They establish rendering, routing, access-state, responsive, and selected accessibility behavior. Live local database/RLS coverage was added in the subsequent production-readiness mission. Skipped unit tests remain skipped. Production configuration and device-native mobile behavior were not validated by this baseline. Dependency advisory results describe the audit at validation time.

No production deployment, database migration, or push was performed. The cleanup and typed SDK work are preserved in the frozen release candidate for review.
