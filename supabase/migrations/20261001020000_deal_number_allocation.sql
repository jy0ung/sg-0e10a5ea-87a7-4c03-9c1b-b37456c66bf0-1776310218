-- Private reservation state for the existing Deal display-number RPC.
-- No historical Deal number/UUID is rewritten. Gaps are intentional.
begin;

create table public.deal_number_sequences (
  company_id text not null references public.companies(id) on delete cascade,
  branch_label text not null,
  year smallint not null check (year between 0 and 99),
  month smallint not null check (month between 1 and 12),
  last_number bigint not null default 0 check (last_number >= 0),
  updated_at timestamptz not null default now(),
  primary key (company_id, branch_label, year, month)
);

comment on table public.deal_number_sequences is
  'Private durable high-water reservations for company/literal branch label/YY/MM. Retain state after failed inserts, abandonment or Deal deletion.';
comment on column public.deal_number_sequences.branch_label is
  'Displayed namespace, not branch identity: null/unresolved branch and a branch coded GEN share this key.';

alter table public.deal_number_sequences enable row level security;
revoke all on table public.deal_number_sequences from public, anon, authenticated;
grant all on table public.deal_number_sequences to service_role;
create policy deal_number_sequences_service on public.deal_number_sequences
  for all to service_role using (true) with check (true);

create or replace function public.generate_deal_no(p_company_id text, p_branch_id text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  selected_branch_code text;
  year_part text;
  month_part text;
  number_prefix text;
  reserved bigint;
  existing_suffix text;
  suffix text;
begin
  -- Run the existing enabled-actor/company/global/service checks BEFORE any write.
  perform public.assert_company_access(p_company_id);

  select b.code into selected_branch_code
  from public.branches b
  where b.id = p_branch_id and b.company_id = p_company_id;
  selected_branch_code := coalesce(selected_branch_code, 'GEN');
  year_part := to_char(now(), 'YY');
  month_part := to_char(now(), 'MM');
  number_prefix := 'DEAL/' || selected_branch_code || '/' || year_part || '/' || month_part || '/';

  -- Both first-use initialization and later allocations serialize on this row.
  -- The RPC transaction commits the reservation independently of any later INSERT.
  insert into public.deal_number_sequences (company_id, branch_label, year, month)
  values (p_company_id, selected_branch_code, year_part::smallint, month_part::smallint)
  on conflict (company_id, branch_label, year, month) do nothing;

  select s.last_number into reserved
  from public.deal_number_sequences s
  where s.company_id = p_company_id and s.branch_label = selected_branch_code
    and s.year = year_part::smallint and s.month = month_part::smallint
  for update;

  -- Read existing high-water AFTER acquiring the lock, on every allocation.
  -- Prefix equality is literal, including /, %, _, and regex metacharacters.
  -- Normalize digits as text before casting, including arbitrary leading zeroes.
  -- Length/lexical ordering avoids overflowing a cast on legacy strings.
  select coalesce(nullif(ltrim(candidate.raw_suffix, '0'), ''), '0') into existing_suffix
  from (
    select substr(d.deal_no, char_length(number_prefix) + 1) as raw_suffix
    from public.deals d
    where d.company_id = p_company_id
      and left(d.deal_no, char_length(number_prefix)) = number_prefix
  ) candidate
  where candidate.raw_suffix ~ '^[0-9]+$'
  order by char_length(coalesce(nullif(ltrim(candidate.raw_suffix, '0'), ''), '0')) desc,
    coalesce(nullif(ltrim(candidate.raw_suffix, '0'), ''), '0') collate "C" desc
  limit 1;

  if existing_suffix is not null then
    if char_length(existing_suffix) > 19
      or (char_length(existing_suffix) = 19 and existing_suffix collate "C" > '9223372036854775807' collate "C") then
      raise exception 'Deal number allocation capacity exhausted for %', number_prefix using errcode = '22003';
    end if;
    reserved := greatest(reserved, existing_suffix::bigint);
  end if;
  if reserved = 9223372036854775807 then
    raise exception 'Deal number allocation capacity exhausted for %', number_prefix using errcode = '22003';
  end if;

  reserved := reserved + 1;
  update public.deal_number_sequences s
  set last_number = reserved, updated_at = now()
  where s.company_id = p_company_id and s.branch_label = selected_branch_code
    and s.year = year_part::smallint and s.month = month_part::smallint;

  suffix := reserved::text;
  return number_prefix || case when char_length(suffix) < 3 then lpad(suffix, 3, '0') else suffix end;
end;
$$;

-- Replacement retains the public signature and its intentional caller grants.
revoke all on function public.generate_deal_no(text, text) from public, anon;
grant execute on function public.generate_deal_no(text, text) to authenticated, service_role;

commit;
