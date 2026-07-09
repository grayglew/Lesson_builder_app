create schema if not exists app_private;

create table if not exists public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'teacher' check (role in ('admin', 'teacher')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_lowercase check (email = lower(email))
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  created_ip text,
  user_agent text,
  constraint admin_impersonation_sessions_distinct_users check (actor_user_id <> target_user_id)
);

create index if not exists app_users_role_status_idx on public.app_users(role, status);
create index if not exists app_users_created_by_idx on public.app_users(created_by) where created_by is not null;
create index if not exists admin_audit_log_actor_created_idx on public.admin_audit_log(actor_user_id, created_at desc);
create index if not exists admin_audit_log_target_created_idx on public.admin_audit_log(target_user_id, created_at desc);
create index if not exists admin_impersonation_sessions_target_user_idx
  on public.admin_impersonation_sessions(target_user_id);
create index if not exists admin_impersonation_sessions_actor_active_idx
  on public.admin_impersonation_sessions(actor_user_id, ended_at, expires_at desc);

insert into public.app_users (id, email, role, status, created_at, updated_at)
select
  u.id,
  lower(u.email),
  case when lower(u.email) = 'grayglew@gmail.com' then 'admin' else 'teacher' end,
  'active',
  now(),
  now()
from auth.users u
where u.email is not null
on conflict (id) do update
set
  email = excluded.email,
  role = case
    when excluded.email = 'grayglew@gmail.com' then 'admin'
    else public.app_users.role
  end,
  status = coalesce(public.app_users.status, 'active'),
  updated_at = now();

create or replace function app_private.is_active_app_user(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_users
    where id = check_user_id
      and status = 'active'
  );
$$;

create or replace function app_private.is_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_users
    where id = check_user_id
      and role = 'admin'
      and status = 'active'
  );
$$;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;
grant execute on function app_private.is_active_app_user(uuid) to authenticated;
grant execute on function app_private.is_admin(uuid) to authenticated;

alter table public.app_users enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.admin_impersonation_sessions enable row level security;

drop policy if exists "app users self/admin select" on public.app_users;
create policy "app users self/admin select"
on public.app_users
for select
to authenticated
using (
  id = (select auth.uid())
  or app_private.is_admin((select auth.uid()))
);

drop policy if exists "admin audit admin select" on public.admin_audit_log;
create policy "admin audit admin select"
on public.admin_audit_log
for select
to authenticated
using (app_private.is_admin((select auth.uid())));

drop policy if exists "admin impersonation actor select" on public.admin_impersonation_sessions;
create policy "admin impersonation actor select"
on public.admin_impersonation_sessions
for select
to authenticated
using (
  actor_user_id = (select auth.uid())
  and app_private.is_admin((select auth.uid()))
);

grant select on public.app_users to authenticated;
grant select on public.admin_audit_log to authenticated;
grant select on public.admin_impersonation_sessions to authenticated;

do $$
declare
  target_table text;
  target_tables text[] := array[
    'assets',
    'builder_lessons',
    'builder_state_sync',
    'classes',
    'lesson_versions',
    'lessons',
    'presentation_sessions',
    'retrieval_class_progress',
    'retrieval_images',
    'retrieval_items',
    'retrieval_lo_images',
    'retrieval_los',
    'retrieval_shared_migration_audit',
    'slide_templates'
  ];
  existing_policy record;
begin
  foreach target_table in array target_tables loop
    for existing_policy in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', existing_policy.policyname, target_table);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = owner_id and app_private.is_active_app_user((select auth.uid())))',
      target_table || ' owner select',
      target_table
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = owner_id and app_private.is_active_app_user((select auth.uid())))',
      target_table || ' owner insert',
      target_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = owner_id and app_private.is_active_app_user((select auth.uid()))) with check ((select auth.uid()) = owner_id and app_private.is_active_app_user((select auth.uid())))',
      target_table || ' owner update',
      target_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = owner_id and app_private.is_active_app_user((select auth.uid())))',
      target_table || ' owner delete',
      target_table
    );
  end loop;
end $$;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'lesson assets owner%'
  loop
    execute format('drop policy if exists %I on storage.objects', existing_policy.policyname);
  end loop;
end $$;

create policy "lesson assets owner select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'lesson-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and app_private.is_active_app_user((select auth.uid()))
);

create policy "lesson assets owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'lesson-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and app_private.is_active_app_user((select auth.uid()))
);

create policy "lesson assets owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'lesson-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and app_private.is_active_app_user((select auth.uid()))
)
with check (
  bucket_id = 'lesson-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and app_private.is_active_app_user((select auth.uid()))
);

create policy "lesson assets owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'lesson-assets'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and app_private.is_active_app_user((select auth.uid()))
);
