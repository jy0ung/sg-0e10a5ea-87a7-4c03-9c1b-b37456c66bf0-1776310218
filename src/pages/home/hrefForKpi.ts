/**
 * Resolve the destination route for a Role-aware Home KPI card.
 *
 * Resolution order:
 *  1. `landingRoute` from the KPI definition (Phase 5a onward). Admins
 *     populate this on `kpi_definitions.landing_route`; the RPC threads it
 *     onto `RoleHomeKpi.landingRoute`.
 *  2. The legacy code-keyed map below — a safety net for KPIs that predate
 *     the column and for tests that stub the RPC without it.
 *  3. `/dashboard` — the executive dashboard, used when neither of the
 *     above resolves. Chosen over `/` because `/` redirects through the
 *     route resolver and the executive dashboard is a stable destination.
 *
 * Adding a new KPI no longer requires a frontend change: populate
 * `kpi_definitions.landing_route` and the card will resolve to it.
 */
const KPI_HREF_BY_CODE: Record<string, string> = {
  'vehicles.total_stock':     '/auto-aging/vehicles',
  'vehicles.aged_over_180':   '/auto-aging/vehicles?ageBucket=181%2B',
  'sales.open_orders':        '/sales/orders',
  'sales.weekly_revenue':     '/sales',
  'customers.new_this_month': '/sales/customers',
};

export function hrefForKpi(code: string, landingRoute: string | null | undefined): string {
  if (landingRoute && landingRoute.trim().length > 0) return landingRoute;
  return KPI_HREF_BY_CODE[code] ?? '/dashboard';
}
