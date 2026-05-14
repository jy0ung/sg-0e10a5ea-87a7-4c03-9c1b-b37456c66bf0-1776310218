alter table public.profiles
  alter column role set default 'creator_updater';

alter table public.employees
  alter column primary_role set default 'creator_updater';

update public.profiles
set role = 'creator_updater'
where role = 'analyst'
  and status = 'pending'
  and company_id is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role, company_id, access_scope, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'creator_updater',
    null,
    'self',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Creates neutral pending accounts with the non-legacy creator_updater fallback role; admins must still provision company access explicitly.';