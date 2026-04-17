# FLC BI UBS — Legacy Data Migration Runbook

## When to run this

Only execute after ALL of the following are true:

- The new FLC BI UBS system is fully deployed and all database migrations applied
- You are on a network that can reach https://fookloi.net/proton (office LAN or VPN)
- The fookloi.net site is still live (old system not yet shut down)
- You have taken a full database backup of the new Supabase database

---

## Step 0 — Prerequisites (one-time setup)

Install Chromium browser for Playwright (first time only):

```bash
npx playwright install chromium
```

Confirm tsx is available:

```bash
npx tsx --version      # should print e.g. v4.x.x
```

Confirm Supabase is running:

```bash
supabase status        # must show API and DB URLs as active
# If not running: supabase start
```

No credentials to configure — the scripts already contain:
- fookloi.net login: `staffName=<CHANGE>` / `staffpwd=<CHANGE>`
- Supabase local service-role key (default local dev key, already in `.env`)

---

## Step 1 — Extract data from fookloi.net

```bash
npx playwright test --config=e2e/proton-extract.config.ts
```

What this does:
- Logs into fookloi.net using the saved credentials
- Visits 17 data pages, paginates through all rows
- Writes JSON arrays to `test-results/extract/*.json`
- Writes a summary to `test-results/extract/_manifest.json`

**Expected duration:** 15–45 minutes (deliberate 2–5 s delays between pages to avoid
overloading the server).  
**Do NOT interrupt** the process — let it complete naturally.

If the session expires mid-run (browser redirected back to the login page):
- Re-run the same command
- JSON files already written are preserved and cumulative
- Duplicate rows are skipped at seed time

Verify after completion:

```bash
cat test-results/extract/_manifest.json   # check totalRows > 0
ls -lh test-results/extract/              # confirm 17+ .json files exist
```

---

## Step 2 — Dry run (no database writes)

```bash
npx tsx scripts/seed-from-extract.ts --dry-run
```

What this does:
- Reads each `.json` file from `test-results/extract/`
- Applies column name mapping (old fookloi headers → new DB columns)
- Prints a sample mapped row per table and a row-count summary
- Writes **nothing** to the database

Review the output carefully:
- Confirm fields like `chassis_no`, `salesman_name`, `invoice_date` look correct
- If a field is missing or mis-mapped, edit the relevant `COLUMN_MAP` object
  in `scripts/seed-from-extract.ts` and re-run until satisfied

---

## Step 3 — Live seed

```bash
npx tsx scripts/seed-from-extract.ts
```

What this does:
- Inserts rows into Supabase in FK-safe order:
  1. `branches`, `finance_companies`, `insurance_companies`, `vehicle_models`,
     `vehicle_colours`, `payment_types`, `banks`, `suppliers`, `dealers`
  2. `vehicles`
  3. `customers`
  4. `sales_orders`
  5. `invoices`, `dealer_invoices`, `official_receipts`, `commission_records`
  6. `profiles` (staff)
- 50 rows per chunk, 120 ms pause between chunks
- Duplicates (matched by unique key) are silently skipped — safe to re-run
- Final summary table is printed: Extracted / Inserted / Skipped / Errors

If a table shows errors, fix the column map and retry that table only:

```bash
npx tsx scripts/seed-from-extract.ts --only vehicles
npx tsx scripts/seed-from-extract.ts --only customers sales-orders
```

---

## Step 4 — Verify in the app

1. Open Supabase Studio: http://127.0.0.1:54323
   - Table Editor → confirm row counts match `_manifest.json` totals

2. Log in to the FLC BI UBS app
   - **Vehicles** page — real chassis numbers visible
   - **Customers** page — real customer names visible
   - **Sales Orders** page — real order data visible
   - **Reports Centre** — run Stock Balance report and confirm data

---

## Step 5 — Staff password reset

The seed script creates `profiles` rows for all staff imported from fookloi.net
but does **not** create Supabase Auth accounts — no passwords are set yet.

Before any staff member can use **Forgot Password**, an admin must create or invite
the corresponding Supabase Auth user for that work email.

Recommended sequence:

1. Admin creates or bulk-invites staff under:
   **Supabase Dashboard → Authentication → Users**
2. Confirm each invited user email matches the imported `profiles.email` value
3. Staff member goes to the FLC BI UBS login page
4. Staff member clicks **Forgot Password** and enters that same work email
5. Staff member follows the reset link sent to their inbox
6. Staff member sets a new password and logs in

If an admin uses **Invite user**, the invite email itself may be enough for first access,
but the supported in-app recovery path remains **Forgot Password** after the auth user exists.

---

## Rollback

To undo all seeded data (preserves schema, deletes all rows):

```bash
supabase db reset
# WARNING: wipes the entire local DB and re-applies all migrations from scratch
```

To undo specific tables only (run in Supabase Studio → SQL Editor):

```sql
TRUNCATE vehicles, customers, sales_orders, invoices CASCADE;
```

---

## Files reference

| File | Purpose |
|---|---|
| `e2e/proton-extract.config.ts` | Playwright config — 1 worker, polite delays, headless Chromium |
| `e2e/proton-extract.spec.ts` | Crawler — logs in, paginates all 17 tables, writes JSON |
| `scripts/seed-from-extract.ts` | Maps JSON headers → DB columns, inserts into Supabase |
| `test-results/extract/` | Intermediate JSON files (gitignored — never committed) |
