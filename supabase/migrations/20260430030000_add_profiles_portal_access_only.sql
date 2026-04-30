alter table public.profiles
add column if not exists portal_access_only boolean not null default false;

comment on column public.profiles.portal_access_only is
'Restricts the user to the Internal Requests portal shell and prevents access to the main application shell.';