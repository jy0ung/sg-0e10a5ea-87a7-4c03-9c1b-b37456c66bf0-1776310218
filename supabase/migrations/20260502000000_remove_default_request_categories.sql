-- Drop the trigger that auto-seeded 7 default categories for every new company.
-- Categories are now configured from scratch by admins in the Request Setup page.
drop trigger if exists companies_seed_request_categories on public.companies;
drop function if exists public.seed_request_categories_for_company();

-- Remove the 7 previously-seeded default categories from every company.
-- Any categories created by admins after the original migration are preserved
-- because they will not match these known default keys.
delete from public.request_categories
where category_key in (
  'operations_support',
  'technical_support',
  'access_request',
  'finance_request',
  'hr_request',
  'service_coordination',
  'other'
);
