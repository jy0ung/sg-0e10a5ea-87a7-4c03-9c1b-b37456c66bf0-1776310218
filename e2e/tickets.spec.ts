import { test, expect } from "@playwright/test";
import { setupAuthMocks, SUPABASE_URL } from "./helpers/auth-mock";

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS HAPPY PATH
// Verifies: MyTickets renders the empty state, New Ticket submits via the
// tickets service, and a toast confirms success. Relies on the catch-all
// REST mock in auth-mock.ts returning [] for GET and {} for POST.
// ─────────────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await setupAuthMocks(page);
});

test("My Tickets renders empty state when the user has no tickets", async ({ page }) => {
  await page.goto("/portal/tickets");

  await expect(
    page.getByRole("heading", { name: /my tickets/i }),
  ).toBeVisible({ timeout: 10000 });

  // Empty-state copy lives in MyTickets.tsx
  await expect(page.getByText(/no tickets yet|haven.?t raised|review the support/i).first())
    .toBeVisible();
});

test("New Ticket submits successfully and shows a confirmation toast", async ({ page }) => {
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
    page.getByRole("heading", { name: /raise a ticket/i }),
  ).toBeVisible({ timeout: 10000 });

  await page.getByLabel(/subject/i).fill("Cannot access sales dashboard");
  await page.getByLabel(/description/i).fill(
    "I get a 403 error whenever I open the sales dashboard after login.",
  );

  await page.getByRole("button", { name: /submit|raise|create/i }).click();

  // Sonner toast with the success message from NewTicket.tsx
  await expect(
    page.getByText(/ticket submitted successfully/i),
  ).toBeVisible({ timeout: 5000 });

  expect(ticketBody).not.toBeNull();
  expect(ticketBody).toMatchObject({
    subject: "Cannot access sales dashboard",
    status: "open",
  });
});
