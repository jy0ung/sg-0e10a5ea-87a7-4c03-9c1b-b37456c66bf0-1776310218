alter table public.tickets
  add column if not exists requested_due_date date,
  add column if not exists business_impact text,
  add column if not exists desired_outcome text;

create index if not exists tickets_company_status_due_date_idx
  on public.tickets (company_id, status, requested_due_date)
  where requested_due_date is not null;
