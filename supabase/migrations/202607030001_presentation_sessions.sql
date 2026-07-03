create table if not exists public.presentation_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_lesson_id uuid not null references public.builder_lessons(id) on delete cascade,
  code_hash text not null unique,
  bucket text not null default 'lesson-assets',
  snapshot_path text,
  snapshot_byte_size bigint not null default 0 check (snapshot_byte_size >= 0),
  snapshot_version integer not null default 0 check (snapshot_version >= 0),
  expires_at timestamptz not null,
  last_uploaded_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists presentation_sessions_set_updated_at on public.presentation_sessions;
create trigger presentation_sessions_set_updated_at
before update on public.presentation_sessions
for each row execute function public.set_updated_at();

alter table public.presentation_sessions enable row level security;

drop policy if exists "presentation sessions owner select" on public.presentation_sessions;
drop policy if exists "presentation sessions owner insert" on public.presentation_sessions;
drop policy if exists "presentation sessions owner update" on public.presentation_sessions;
drop policy if exists "presentation sessions owner delete" on public.presentation_sessions;

create policy "presentation sessions owner select" on public.presentation_sessions
for select to authenticated
using (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

create policy "presentation sessions owner insert" on public.presentation_sessions
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

create policy "presentation sessions owner update" on public.presentation_sessions
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

create policy "presentation sessions owner delete" on public.presentation_sessions
for delete to authenticated
using (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

grant all on public.presentation_sessions to authenticated;

create index if not exists presentation_sessions_owner_source_idx
on public.presentation_sessions (owner_id, source_lesson_id, expires_at desc);

create index if not exists presentation_sessions_active_code_idx
on public.presentation_sessions (code_hash, expires_at)
where closed_at is null;
