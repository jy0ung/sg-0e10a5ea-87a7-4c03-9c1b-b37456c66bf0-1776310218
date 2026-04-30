update public.tickets
   set category = case category
     when 'sales_inquiry' then 'service_coordination'
     when 'technical_issue' then 'technical_support'
     when 'service_request' then 'operations_support'
     when 'general' then 'operations_support'
     else 'other'
   end
 where category in ('sales_inquiry', 'technical_issue', 'service_request', 'general', 'other');

alter table public.tickets
  alter column category set default 'operations_support';

alter table public.tickets
  drop constraint if exists tickets_category_check;

alter table public.tickets
  add constraint tickets_category_check
  check (
    category in (
      'operations_support',
      'technical_support',
      'access_request',
      'finance_request',
      'hr_request',
      'service_coordination',
      'other'
    )
  );