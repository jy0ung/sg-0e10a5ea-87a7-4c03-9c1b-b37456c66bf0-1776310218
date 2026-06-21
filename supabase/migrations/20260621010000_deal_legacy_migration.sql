-- Legacy Data Migration: VSO → Deals
-- This script migrates existing sales_orders (VSO) data into the new deals table
-- Run this after the deal lifecycle migration is applied

-- Step 1: Migrate sales_orders to deals
-- Maps existing VSO records to the new deal lifecycle format
INSERT INTO deals (
  id,
  company_id,
  branch_id,
  deal_no,
  vso_no,
  stage,
  stage_entered_at,
  stage_updated_at,
  customer_id,
  customer_name,
  customer_ic,
  customer_phone,
  customer_email,
  model_name,
  variant,
  colour,
  chassis_no,
  selling_price,
  total_amount,
  sales_advisor_id,
  sales_advisor_name,
  lead_source,
  created_at,
  updated_at,
  created_by
)
SELECT
  so.id,
  so.company_id,
  so.branch_id,
  'DEAL/' || COALESCE(b.code, 'GEN') || '/' || TO_CHAR(so.created_at, 'YY') || '/' || TO_CHAR(so.created_at, 'MM') || '/' || LPAD(ROW_NUMBER() OVER (PARTITION BY so.company_id, so.branch_id ORDER BY so.created_at)::TEXT, 3, '0'),
  so.order_no,
  CASE
    WHEN so.status = 'enquiry' THEN 'lead'
    WHEN so.status = 'quoted' THEN 'prospect'
    WHEN so.status = 'confirmed' THEN 'booking'
    WHEN so.status = 'booked' THEN 'booking'
    WHEN so.status = 'delivered' THEN 'completed'
    WHEN so.status = 'cancelled' THEN 'completed'
    ELSE 'lead'
  END,
  so.created_at,
  so.updated_at,
  so.customer_id,
  COALESCE(c.name, 'Unknown Customer'),
  c.ic_no,
  c.phone,
  c.email,
  so.model,
  so.variant,
  so.colour,
  so.chassis_no,
  so.selling_price,
  so.total_price,
  so.assigned_to,
  p.name,
  'legacy_import',
  so.created_at,
  so.updated_at,
  so.assigned_to
FROM sales_orders so
LEFT JOIN customers c ON c.id = so.customer_id
LEFT JOIN branches b ON b.id = so.branch_id
LEFT JOIN profiles p ON p.id = so.assigned_to
WHERE NOT EXISTS (SELECT 1 FROM deals WHERE vso_no = so.order_no)
  AND so.is_deleted = false;

-- Step 2: Log migration activity for each migrated deal
INSERT INTO deal_activities (deal_id, company_id, actor_id, action, metadata, created_at)
SELECT
  d.id,
  d.company_id,
  d.created_by,
  'deal_migrated',
  jsonb_build_object(
    'source', 'legacy_sales_orders',
    'original_status', so.status,
    'vso_no', so.order_no,
    'migration_date', now()
  ),
  now()
FROM deals d
JOIN sales_orders so ON so.order_no = d.vso_no
WHERE d.lead_source = 'legacy_import';

-- Step 3: Update completed_at for deals that are already completed
UPDATE deals
SET completed_at = updated_at
WHERE stage = 'completed'
  AND completed_at IS NULL
  AND lead_source = 'legacy_import';

-- Step 4: Create summary report
DO $$
DECLARE
  total_migrated INT;
  total_leads INT;
  total_prospects INT;
  total_bookings INT;
  total_completed INT;
BEGIN
  SELECT COUNT(*) INTO total_migrated FROM deals WHERE lead_source = 'legacy_import';
  SELECT COUNT(*) INTO total_leads FROM deals WHERE lead_source = 'legacy_import' AND stage = 'lead';
  SELECT COUNT(*) INTO total_prospects FROM deals WHERE lead_source = 'legacy_import' AND stage = 'prospect';
  SELECT COUNT(*) INTO total_bookings FROM deals WHERE lead_source = 'legacy_import' AND stage = 'booking';
  SELECT COUNT(*) INTO total_completed FROM deals WHERE lead_source = 'legacy_import' AND stage = 'completed';

  RAISE NOTICE '=== Legacy Migration Summary ===';
  RAISE NOTICE 'Total migrated: %', total_migrated;
  RAISE NOTICE 'Leads: %', total_leads;
  RAISE NOTICE 'Prospects: %', total_prospects;
  RAISE NOTICE 'Bookings: %', total_bookings;
  RAISE NOTICE 'Completed: %', total_completed;
END $$;
