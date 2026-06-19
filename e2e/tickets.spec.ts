import { test, expect } from "@playwright/test";
import { setupAuthMocks, SUPABASE_URL } from "./helpers/auth-mock";

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS HAPPY PATH
// Verifies: My Requests renders the empty state and New Request submits via the
// tickets service before returning to the requester history. Relies on the catch-all
// REST mock in auth-mock.ts returning [] for GET and {} for POST.
// ─────────────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await setupAuthMocks(page);
  await page.route(`${SUPABASE_URL}/rest/v1/request_categories*`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "request-category-general",
          company_id: "00000000-0000-0000-0000-000000000099",
          category_key: "general",
          label: "General Support",
          description: "General internal support requests.",
          is_active: true,
          sort_order: 1,
          requires_approval: false,
          response_sla_hours: 8,
          resolution_sla_hours: 48,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          updated_by: null,
        },
      ]),
    });
  });
  await page.route(`${SUPABASE_URL}/rest/v1/request_subcategories*`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route(`${SUPABASE_URL}/rest/v1/request_templates*`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route(`${SUPABASE_URL}/rest/v1/request_form_fields*`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
});

test("Pending Requests renders empty state when the user has no tickets", async ({ page }) => {
  await page.goto("/portal/tickets");

  await expect(
    page.getByRole("heading", { name: /pending requests/i }),
  ).toBeVisible({ timeout: 10000 });

  // Empty-state copy lives in MyTickets.tsx
  await expect(page.getByText(/no requests yet|no tickets yet|haven.?t raised|review the support/i).first())
    .toBeVisible();
});

test("New Request submits successfully and returns to request history", async ({ page }) => {
  // Observe the POST so we can assert the shape the page sends.
  let ticketBody: Record<string, unknown> | null = null;
  await page.route(`${SUPABASE_URL}/rest/v1/tickets*`, (route) => {
    if (route.request().method() === "POST") {
      try {
        ticketBody = JSON.parse(route.request().postData() ?? "null");
      } catch {
        ticketBody = null;
      }
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "t-1" }),
      });
      return;
    }
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  await page.goto("/portal/tickets/new");

  await expect(
    page.getByRole("heading", { name: /new internal request|new request/i }),
  ).toBeVisible({ timeout: 10000 });

  await page.getByLabel(/request title/i).fill("Cannot access sales dashboard");
  // Category is a dropdown; the only configured category auto-selects.
  await expect(page.getByRole("combobox", { name: /^category/i })).toContainText("General Support");
  // Description auto-fills from the category description (no subcategory configured).
  await expect(page.getByLabel(/description/i)).toHaveValue(/general internal support requests/i);
  await page.getByLabel(/description/i).fill(
    "I get a 403 error whenever I open the sales dashboard after login.",
  );

  await page.getByRole("button", { name: /submit|raise|create/i }).click();

  await expect(page).toHaveURL(/\/portal\/tickets$/);

  expect(ticketBody).not.toBeNull();
  expect(ticketBody).toMatchObject({
    subject: "Cannot access sales dashboard",
    status: "open",
  });
});
