# Production WebApp Audit Results

Generated: 2026-06-25T05:43:16.247Z

## Summary

```json
{
  "routes": 84,
  "routeIssues": 84,
  "crashes": 0,
  "mobileRoutes": 8,
  "mobileIssues": 8,
  "navChecks": 7,
  "navIssues": 0,
  "workflows": 1,
  "workflowIssues": 1
}
```

## Issues

| Status | Module | Route/Workflow | Issues | Screenshot |
|---|---|---|---|---|
| issue | Platform | / | 2 critical console message(s)<br>2 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/root.png` |
| issue | Platform | /home | 2 critical console message(s)<br>1 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/home.png` |
| issue | Platform | /modules | 2 critical console message(s)<br>1 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/modules.png` |
| issue | Platform | /inbox | 2 critical console message(s)<br>1 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/inbox.png` |
| issue | Platform | /notifications | 2 critical console message(s)<br>1 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/notifications.png` |
| issue | Platform | /not-a-real-route-audit | Very little body text (39 chars)<br>1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/not-a-real-route-audit.png` |
| issue | Portal | /portal | 1 critical console message(s)<br>8 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal.png` |
| issue | Portal | /portal/tickets/new | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-tickets-new.png` |
| issue | Portal | /portal/tickets | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-tickets.png` |
| issue | Portal | /portal/tickets/completed | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-tickets-completed.png` |
| issue | Portal | /portal/tickets/9f3748d5-6f83-4b9e-a03a-e7bad91ec030 | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-tickets-9f3748d5-6f83-4b9e-a03a-e7bad91ec030.png` |
| issue | Portal | /portal/dashboard | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-dashboard.png` |
| issue | Portal | /portal/queue | 1 critical console message(s)<br>8 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-queue.png` |
| issue | Portal | /portal/history | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-history.png` |
| issue | Portal | /portal/reports | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-reports.png` |
| issue | Portal | /portal/setup | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-setup.png` |
| issue | Portal | /portal/announcements | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-announcements.png` |
| issue | Portal | /portal/documents | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/portal-documents.png` |
| issue | Auto Aging | /auto-aging | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging.png` |
| issue | Auto Aging | /auto-aging/vehicles | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-vehicles.png` |
| issue | Auto Aging | /auto-aging/vehicles/PL1BT3SRRRB341114 | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-vehicles-PL1BT3SRRRB341114.png` |
| issue | Auto Aging | /auto-aging/lifecycle/PL1BT3SRRRB341114 | Visible not-found text on registered route<br>1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-lifecycle-PL1BT3SRRRB341114.png` |
| issue | Auto Aging | /auto-aging/import | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-import.png` |
| issue | Auto Aging | /auto-aging/review | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-review.png` |
| issue | Auto Aging | /auto-aging/history | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-history.png` |
| issue | Auto Aging | /auto-aging/quality | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-quality.png` |
| issue | Auto Aging | /auto-aging/sla | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-sla.png` |
| issue | Auto Aging | /auto-aging/mappings | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-mappings.png` |
| issue | Auto Aging | /auto-aging/commissions | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-commissions.png` |
| issue | Auto Aging | /auto-aging/reports | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/auto-aging-reports.png` |
| issue | Sales | /sales | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales.png` |
| issue | Sales | /sales/pipeline | Visible not-found text on registered route<br>1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-pipeline.png` |
| issue | Sales | /sales/deals | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-deals.png` |
| issue | Sales | /sales/deals/new | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-deals-new.png` |
| issue | Sales | /sales/deals/a3111304-bf9b-426a-99e7-284803ce7ec1 | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-deals-a3111304-bf9b-426a-99e7-284803ce7ec1.png` |
| issue | Sales | /sales/orders | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-orders.png` |
| issue | Sales | /sales/lead-intake | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-lead-intake.png` |
| issue | Sales | /sales/performance | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-performance.png` |
| issue | Sales | /sales/margin | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-margin.png` |
| issue | Sales | /sales/invoices | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-invoices.png` |
| issue | Sales | /sales/customers | Visible not-found text on registered route<br>1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-customers.png` |
| issue | Sales | /sales/customers/f78846e0-671e-4619-a253-19bb2b6eac63 | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-customers-f78846e0-671e-4619-a253-19bb2b6eac63.png` |
| issue | Sales | /sales/dealer-invoices | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-dealer-invoices.png` |
| issue | Sales | /sales/verify-or | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-verify-or.png` |
| issue | Sales | /sales/outstanding | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-outstanding.png` |
| issue | Sales | /sales/outstanding-new | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-outstanding-new.png` |
| issue | Sales | /sales/advisors | Visible not-found text on registered route<br>1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/sales-advisors.png` |
| issue | Inventory | /inventory/stock | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/inventory-stock.png` |
| issue | Inventory | /inventory/chassis-filter | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/inventory-chassis-filter.png` |
| issue | Inventory | /inventory/transfers | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/inventory-transfers.png` |
| issue | Inventory | /inventory/chassis | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/inventory-chassis.png` |
| issue | Purchasing | /purchasing/invoices | Visible not-found text on registered route<br>1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/purchasing-invoices.png` |
| issue | Purchasing | /purchasing/invoices/ca3b19a2-3983-41eb-b255-314bb27bcd81 | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/purchasing-invoices-ca3b19a2-3983-41eb-b255-314bb27bcd81.png` |
| issue | Purchasing | /purchasing/orders | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/purchasing-orders.png` |
| issue | Purchasing | /purchasing/orders/new | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/purchasing-orders-new.png` |
| issue | Purchasing | /purchasing/grn | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/purchasing-grn.png` |
| issue | Purchasing | /purchasing/grn/new | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/purchasing-grn-new.png` |
| issue | Purchasing | /purchasing/three-way-match | Visible not-found text on registered route<br>1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/purchasing-three-way-match.png` |
| issue | Finance | /accounts/chart | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/accounts-chart.png` |
| issue | Finance | /accounts/periods | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/accounts-periods.png` |
| issue | Finance | /accounts/trial-balance | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/accounts-trial-balance.png` |
| issue | Finance | /accounts/profit-loss | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/accounts-profit-loss.png` |
| issue | Finance | /accounts/balance-sheet | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/accounts-balance-sheet.png` |
| issue | Finance | /accounts/aging-by-branch | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/accounts-aging-by-branch.png` |
| issue | Finance | /accounts/cash-position | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/accounts-cash-position.png` |
| issue | Finance | /accounts/period-close | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/accounts-period-close.png` |
| issue | Finance | /accounts/journal | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/accounts-journal.png` |
| issue | Reports | /reports | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/reports.png` |
| issue | HRMS | /hrms | 4 critical console message(s)<br>1 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/hrms.png` |
| issue | Admin | /admin/activity | 7 critical console message(s)<br>4 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-activity.png` |
| issue | Admin | /admin/kpi-studio | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-kpi-studio.png` |
| issue | Admin | /admin/dms-sync | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-dms-sync.png` |
| issue | Admin | /admin/reconciliation | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-reconciliation.png` |
| issue | Admin | /admin/audit | 3 critical console message(s)<br>1 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-audit.png` |
| issue | Admin | /admin/webhooks | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-webhooks.png` |
| issue | Admin | /admin/users | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-users.png` |
| issue | Admin | /admin/user-groups | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-user-groups.png` |
| issue | Admin | /admin/role-permissions | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-role-permissions.png` |
| issue | Admin | /admin/branches | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-branches.png` |
| issue | Admin | /admin/master-data | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-master-data.png` |
| issue | Admin | /admin/suppliers | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-suppliers.png` |
| issue | Admin | /admin/dealers | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-dealers.png` |
| issue | Admin | /admin/settings | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-settings.png` |
| issue | Admin | /admin/health | 2 critical console message(s)<br>6 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/admin-health.png` |
| issue | Platform | mobile:/ | 2 critical console message(s)<br>2 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/mobile-root.png` |
| issue | Portal | mobile:/portal/tickets/new | 2 critical console message(s)<br>1 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/mobile-portal-tickets-new.png` |
| issue | Portal | mobile:/portal/tickets | 2 critical console message(s)<br>1 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/mobile-portal-tickets.png` |
| issue | Auto Aging | mobile:/auto-aging/vehicles | 2 critical console message(s)<br>1 failed/4xx/5xx request(s) | `/tmp/prod-webapp-audit-20260625/screenshots/mobile-auto-aging-vehicles.png` |
| issue | Sales | mobile:/sales/deals | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/mobile-sales-deals.png` |
| issue | Sales | mobile:/sales/deals/a3111304-bf9b-426a-99e7-284803ce7ec1 | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/mobile-sales-deals-a3111304-bf9b-426a-99e7-284803ce7ec1.png` |
| issue | Reports | mobile:/reports | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/mobile-reports.png` |
| issue | Admin | mobile:/admin/users | 1 critical console message(s) | `/tmp/prod-webapp-audit-20260625/screenshots/mobile-admin-users.png` |
| issue | Workflow | Portal new request draft persistence/tab switch | Draft input did not persist after route away/back | `/tmp/prod-webapp-audit-20260625/screenshots/workflow-draft-persistence.png` |
