-- Phase 0: Sales Module Critical Fixes
-- Addresses highest-severity issues from the Sales Module GAP Assessment.
--
-- Changes:
--   1. Fix sales_advisors write RLS (role values were invalid)
--   2. Add branch_code column to sales_advisors (branch display was showing raw UUID)
--   3. Add UNIQUE index on sales_orders (order_no, company_id) to prevent duplicate order numbers
--   4. Add partial UNIQUE index on invoices to prevent double customer-sales invoicing per order

-- ── 1. Fix broken RLS write policy on sales_advisors ─────────────────────────
-- The original policy referenced role values ('admin','manager','finance_manager','accountant')
-- that do not exist in profiles.role. No authenticated user could write to this table.

DROP POLICY IF EXISTS "sales_advisors_write" ON public.sales_advisors;

CREATE POLICY "sales_advisors_write" ON public.sales_advisors
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','company_admin','director','general_manager','manager')
    )
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','company_admin','director','general_manager','manager')
    )
  );

-- ── 2. Add branch_code column to sales_advisors ──────────────────────────────
-- The service layer was displaying raw branch UUIDs because the table had no
-- branch_code column. Adding it so advisors can be assigned a human-readable
-- branch code that matches the branches table branch_code column.

ALTER TABLE public.sales_advisors
  ADD COLUMN IF NOT EXISTS branch_code text;

-- ── 3. Prevent duplicate order numbers per company ───────────────────────────
-- NOTE: This index will fail if duplicate (order_no, company_id) pairs already
-- exist. Run the following query first to identify duplicates, and resolve them
-- before applying this migration in production:
--
--   SELECT order_no, company_id, COUNT(*)
--   FROM sales_orders
--   WHERE is_deleted = false
--   GROUP BY order_no, company_id
--   HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_order_no_company
  ON public.sales_orders (order_no, company_id)
  WHERE is_deleted = false;

-- ── 4. Prevent double customer-sales invoice per order ───────────────────────
-- A customer_sales invoice should only be issued once per order.
-- Dealer and purchase invoice types are intentionally excluded from this
-- uniqueness check.
--
-- NOTE: Same caveat as above — check for existing duplicates before applying:
--
--   SELECT sales_order_id, invoice_type, COUNT(*)
--   FROM invoices
--   GROUP BY sales_order_id, invoice_type
--   HAVING COUNT(*) > 1 AND invoice_type = 'customer_sales';

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_customer_sales_per_order
  ON public.invoices (sales_order_id, invoice_type)
  WHERE invoice_type = 'customer_sales';
