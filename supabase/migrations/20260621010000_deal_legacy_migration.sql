-- Legacy Data Migration: VSO → Deals (with full details)
-- Uses sales_orders.id for unique deal numbers

-- Step 1: Migrate sales_orders to deals
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
  deposit_amount,
  deposit_date,
  discount_amount,
  total_amount,
  sales_advisor_id,
  sales_advisor_name,
  lead_source,
  lead_source_detail,
  notes,
  completed_at,
  created_at,
  updated_at,
  created_by
)
SELECT
  so.id,
  so.company_id,
  b.id as branch_id,
  'VSO-' || COALESCE(so.vso_no, so.order_no, so.id::TEXT),
  so.vso_no,
  CASE
    WHEN so.order_status = 'New without Deposit' THEN 'lead'
    WHEN so.order_status = 'New with Deposit' THEN 'booking'
    WHEN so.order_status = 'Invoice' THEN 'lou'
    WHEN so.order_status = 'Car Out' THEN 'completed'
    WHEN so.order_status = 'Cancel' THEN 'completed'
    WHEN so.order_status = 'Passed' THEN 'completed'
    WHEN so.order_status = 'VDO' THEN 'lead'
    ELSE 'lead'
  END,
  so.created_at,
  so.updated_at,
  so.customer_id,
  COALESCE(so.customer_name, c.name, 'Unknown Customer'),
  COALESCE(so.ic_no, c.ic_no),
  c.phone,
  c.email,
  so.model,
  so.variant,
  so.color,
  so.chassis_no,
  so.selling_price,
  so.deposit_amount,
  so.booking_date,
  so.discount,
  COALESCE(so.overall_total, so.selling_price),
  so.salesman_id,
  so.salesman_name,
  CASE
    WHEN so.dms_so_no IS NOT NULL THEN 'dms_import'
    ELSE 'walk_in'
  END,
  CASE
    WHEN so.dms_so_no IS NOT NULL THEN 'DMS SO: ' || so.dms_so_no
    ELSE NULL
  END,
  so.notes,
  CASE
    WHEN so.order_status IN ('Car Out', 'Cancel', 'Passed') THEN so.updated_at
    ELSE NULL
  END,
  so.created_at,
  so.updated_at,
  so.salesman_id
FROM sales_orders so
LEFT JOIN customers c ON c.id = so.customer_id
LEFT JOIN branches b ON b.code = so.branch_code AND b.company_id = so.company_id
WHERE NOT EXISTS (SELECT 1 FROM deals WHERE vso_no = so.vso_no)
  AND so.is_deleted = false;

-- Step 2: Create loan records for invoiced/delivered deals
INSERT INTO deal_loan (
  deal_id,
  company_id,
  bank_name,
  loan_type,
  loan_amount,
  status,
  submitted_at,
  approved_at,
  created_at,
  updated_at
)
SELECT
  d.id,
  d.company_id,
  so.finance_company,
  'hire_purchase',
  so.bank_loan_amount,
  CASE
    WHEN d.stage = 'completed' THEN 'disbursed'
    WHEN d.stage = 'lou' THEN 'lou_issued'
    ELSE 'submitted'
  END,
  d.created_at,
  CASE WHEN d.stage IN ('completed', 'lou') THEN d.updated_at ELSE NULL END,
  d.created_at,
  d.updated_at
FROM deals d
JOIN sales_orders so ON so.vso_no = d.vso_no
WHERE so.bank_loan_amount IS NOT NULL
  AND so.bank_loan_amount > 0
  AND NOT EXISTS (SELECT 1 FROM deal_loan WHERE deal_id = d.id);

-- Step 3: Create insurance records
INSERT INTO deal_insurance (
  deal_id,
  company_id,
  insurer_name,
  coverage_type,
  status,
  policy_issued_at,
  created_at,
  updated_at
)
SELECT
  d.id,
  d.company_id,
  so.insurance_company,
  'comprehensive',
  CASE
    WHEN d.stage = 'completed' THEN 'policy_active'
    ELSE 'cover_note_issued'
  END,
  CASE WHEN d.stage = 'completed' THEN d.updated_at ELSE NULL END,
  d.created_at,
  d.updated_at
FROM deals d
JOIN sales_orders so ON so.vso_no = d.vso_no
WHERE so.insurance_company IS NOT NULL
  AND so.insurance_company != ''
  AND NOT EXISTS (SELECT 1 FROM deal_insurance WHERE deal_id = d.id);

-- Step 4: Create registration records
INSERT INTO deal_registration (
  deal_id,
  company_id,
  plate_no,
  status,
  registered_at,
  created_at,
  updated_at
)
SELECT
  d.id,
  d.company_id,
  so.plate_no,
  CASE
    WHEN d.stage = 'completed' THEN 'registered'
    ELSE 'submitted'
  END,
  CASE WHEN d.stage = 'completed' THEN d.updated_at ELSE NULL END,
  d.created_at,
  d.updated_at
FROM deals d
JOIN sales_orders so ON so.vso_no = d.vso_no
WHERE so.plate_no IS NOT NULL
  AND so.plate_no != ''
  AND NOT EXISTS (SELECT 1 FROM deal_registration WHERE deal_id = d.id);

-- Step 5: Log migration activity
INSERT INTO deal_activities (deal_id, company_id, actor_id, action, metadata, created_at)
SELECT
  d.id,
  d.company_id,
  d.created_by,
  'deal_created',
  jsonb_build_object(
    'source', 'sales_orders',
    'original_status', so.order_status,
    'vso_no', so.vso_no,
    'order_no', so.order_no,
    'dms_so_no', so.dms_so_no,
    'booking_date', so.booking_date,
    'payment_method', so.payment_method,
    'finance_company', so.finance_company,
    'insurance_company', so.insurance_company,
    'outstanding_amount', so.outstanding_amount,
    'balance_customer', so.balance_customer
  ),
  d.created_at
FROM deals d
JOIN sales_orders so ON so.vso_no = d.vso_no
WHERE d.lead_source IN ('walk_in', 'dms_import');

-- Step 6: Summary
DO $$
DECLARE
  total_migrated INT;
  total_leads INT;
  total_bookings INT;
  total_lou INT;
  total_completed INT;
  total_loans INT;
  total_insurance INT;
  total_registration INT;
BEGIN
  SELECT COUNT(*) INTO total_migrated FROM deals WHERE lead_source IN ('walk_in', 'dms_import');
  SELECT COUNT(*) INTO total_leads FROM deals WHERE lead_source IN ('walk_in', 'dms_import') AND stage = 'lead';
  SELECT COUNT(*) INTO total_bookings FROM deals WHERE lead_source IN ('walk_in', 'dms_import') AND stage = 'booking';
  SELECT COUNT(*) INTO total_lou FROM deals WHERE lead_source IN ('walk_in', 'dms_import') AND stage = 'lou';
  SELECT COUNT(*) INTO total_completed FROM deals WHERE lead_source IN ('walk_in', 'dms_import') AND stage = 'completed';
  SELECT COUNT(*) INTO total_loans FROM deal_loan;
  SELECT COUNT(*) INTO total_insurance FROM deal_insurance;
  SELECT COUNT(*) INTO total_registration FROM deal_registration;

  RAISE NOTICE '=== Migration Summary ===';
  RAISE NOTICE 'Total deals: %', total_migrated;
  RAISE NOTICE 'Leads: %', total_leads;
  RAISE NOTICE 'Bookings: %', total_bookings;
  RAISE NOTICE 'LOU: %', total_lou;
  RAISE NOTICE 'Completed: %', total_completed;
  RAISE NOTICE 'Loan records: %', total_loans;
  RAISE NOTICE 'Insurance records: %', total_insurance;
  RAISE NOTICE 'Registration records: %', total_registration;
END $$;
