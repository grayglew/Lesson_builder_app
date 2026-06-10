create table if not exists public.builder_lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Untitled lesson',
  class_name text not null default '',
  teaching_date date,
  bucket text not null default 'lesson-assets',
  storage_path text not null,
  byte_size bigint not null default 0 check (byte_size >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (owner_id, storage_path)
);

drop trigger if exists builder_lessons_set_updated_at on public.builder_lessons;
create trigger builder_lessons_set_updated_at
before update on public.builder_lessons
for each row execute function public.set_updated_at();

alter table public.builder_lessons enable row level security;

drop policy if exists "builder lessons owner select" on public.builder_lessons;
drop policy if exists "builder lessons owner insert" on public.builder_lessons;
drop policy if exists "builder lessons owner update" on public.builder_lessons;
drop policy if exists "builder lessons owner delete" on public.builder_lessons;

create policy "builder lessons owner select" on public.builder_lessons
for select to authenticated
using (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

create policy "builder lessons owner insert" on public.builder_lessons
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

create policy "builder lessons owner update" on public.builder_lessons
for update to authenticated
using (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
)
with check (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

create policy "builder lessons owner delete" on public.builder_lessons
for delete to authenticated
using (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

grant all on public.builder_lessons to authenticated;

create index if not exists builder_lessons_owner_deleted_updated_idx
on public.builder_lessons (owner_id, deleted_at, updated_at desc);
