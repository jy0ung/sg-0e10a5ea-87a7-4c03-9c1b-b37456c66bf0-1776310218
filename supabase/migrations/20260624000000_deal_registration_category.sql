-- Migration: Add deal_registration category for auto-created tickets
-- When a deal reaches the Registration stage, an IR ticket is auto-created with this category.

INSERT INTO request_categories (company_id, category_key, label, description, is_active, sort_order)
SELECT 
  c.id as company_id,
  'deal_registration' as category_key,
  'Deal Registration (Auto)' as label,
  'Auto-created when a deal reaches the Registration stage. Handles JPJ submission and plate assignment.' as description,
  true as is_active,
  100 as sort_order
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM request_categories rc 
  WHERE rc.company_id = c.id AND rc.category_key = 'deal_registration'
);
