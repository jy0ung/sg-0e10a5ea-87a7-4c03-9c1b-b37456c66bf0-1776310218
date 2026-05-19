-- ============================================================
-- Migration: Deduplicate customers + add missing unique indexes
-- on all seeded transactional/master tables.
-- Date: 2026-05-18
-- ============================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Normalize existing customer data (strip dashes/spaces from ic_no, trim names)
-- ─────────────────────────────────────────────────────────────────────────────

-- Normalize ic_no: strip non-alphanumeric characters, uppercase
UPDATE public.customers
SET ic_no = UPPER(REGEXP_REPLACE(ic_no, '[^A-Za-z0-9]', '', 'g'))
WHERE ic_no IS NOT NULL AND TRIM(ic_no) <> '';

-- Set blanked-out ic_no (after stripping) back to NULL
UPDATE public.customers
SET ic_no = NULL
WHERE ic_no IS NOT NULL AND TRIM(ic_no) = '';

-- Normalize name: trim whitespace, collapse internal runs
UPDATE public.customers
SET name = TRIM(REGEXP_REPLACE(name, '\s+', ' ', 'g'))
WHERE name IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Deduplicate customers — keep the OLDEST row (earliest created_at)
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Rows with ic_no: keep one per (ic_no, company_id)
DELETE FROM public.customers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY ic_no, company_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM public.customers
    WHERE ic_no IS NOT NULL AND TRIM(ic_no) <> ''
  ) ranked
  WHERE rn > 1
);

-- 2b. Rows without ic_no: keep one per (LOWER(TRIM(name)), company_id)
DELETE FROM public.customers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(TRIM(name)), company_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM public.customers
    WHERE ic_no IS NULL OR TRIM(ic_no) = ''
  ) ranked
  WHERE rn > 1
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add unique index on customers (ic_no, company_id) — non-null ic only
-- ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS customers_ic_no_company_key
  ON public.customers (ic_no, company_id)
  WHERE ic_no IS NOT NULL AND is_deleted = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. banks — add unique (name, company_id)
-- ─────────────────────────────────────────────────────────────────────────────

-- Deduplicate first
DELETE FROM public.banks
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(TRIM(name)), company_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM public.banks
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS banks_name_company_key
  ON public.banks (LOWER(TRIM(name)), company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. suppliers — add unique (name, company_id)
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM public.suppliers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(TRIM(name)), company_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM public.suppliers
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_company_key
  ON public.suppliers (LOWER(TRIM(name)), company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. dealers — add unique (name, company_id)
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM public.dealers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY LOWER(TRIM(name)), company_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM public.dealers
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS dealers_name_company_key
  ON public.dealers (LOWER(TRIM(name)), company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. purchase_invoices — add unique (invoice_no, company_id)
-- ─────────────────────────────────────────────────────────────────────────────

-- Normalize invoice_no first
UPDATE public.purchase_invoices
SET invoice_no = UPPER(TRIM(invoice_no))
WHERE invoice_no IS NOT NULL;

DELETE FROM public.purchase_invoices
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY UPPER(TRIM(invoice_no)), company_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM public.purchase_invoices
    WHERE invoice_no IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_invoices_invoice_no_company_key
  ON public.purchase_invoices (invoice_no, company_id)
  WHERE invoice_no IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. dealer_invoices — add unique (invoice_no, company_id)
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.dealer_invoices
SET invoice_no = UPPER(TRIM(invoice_no))
WHERE invoice_no IS NOT NULL;

DELETE FROM public.dealer_invoices
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY UPPER(TRIM(invoice_no)), company_id
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM public.dealer_invoices
    WHERE invoice_no IS NOT NULL
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS dealer_invoices_invoice_no_company_key
  ON public.dealer_invoices (invoice_no, company_id)
  WHERE invoice_no IS NOT NULL;
