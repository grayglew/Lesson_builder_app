create table if not exists public.builder_state_sync (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  bucket text not null default 'lesson-assets',
  storage_path text not null,
  byte_size bigint not null default 0 check (byte_size >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.builder_state_sync enable row level security;

drop policy if exists "builder state owner select" on public.builder_state_sync;
drop policy if exists "builder state owner insert" on public.builder_state_sync;
drop policy if exists "builder state owner update" on public.builder_state_sync;
drop policy if exists "builder state owner delete" on public.builder_state_sync;

create policy "builder state owner select" on public.builder_state_sync
for select to authenticated
using ((select auth.uid()) = owner_id and (select auth.uid()) = '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid);

create policy "builder state owner insert" on public.builder_state_sync
for insert to authenticated
with check ((select auth.uid()) = owner_id and (select auth.uid()) = '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid);

create policy "builder state owner update" on public.builder_state_sync
for update to authenticated
using ((select auth.uid()) = owner_id and (select auth.uid()) = '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid)
with check ((select auth.uid()) = owner_id and (select auth.uid()) = '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid);

create policy "builder state owner delete" on public.builder_state_sync
for delete to authenticated
using ((select auth.uid()) = owner_id and (select auth.uid()) = '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid);

grant all on public.builder_state_sync to authenticated;
