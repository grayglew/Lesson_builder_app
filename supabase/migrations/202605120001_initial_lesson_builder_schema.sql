create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  class_name text not null default '',
  title text not null default 'Untitled lesson',
  teaching_date date,
  schema_version integer not null default 1,
  slides jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.retrieval_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  class_name text not null default '',
  legacy_lo_id text,
  lo_text text not null,
  spacing_factor integer not null default 2,
  seen_count integer not null default 0,
  last_taught date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, class_name, lo_text)
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  retrieval_item_id uuid references public.retrieval_items(id) on delete cascade,
  kind text not null check (kind in ('image', 'pdf-page', 'backup', 'other')),
  bucket text not null default 'lesson-assets',
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null default 0,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

create table if not exists public.retrieval_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  retrieval_item_id uuid not null references public.retrieval_items(id) on delete cascade,
  seen_count integer not null,
  asset_id uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, retrieval_item_id, seen_count)
);

create table if not exists public.lesson_versions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  revision integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (lesson_id, revision)
);

create trigger classes_set_updated_at
before update on public.classes
for each row execute function public.set_updated_at();

create trigger lessons_set_updated_at
before update on public.lessons
for each row execute function public.set_updated_at();

create trigger retrieval_items_set_updated_at
before update on public.retrieval_items
for each row execute function public.set_updated_at();

alter table public.classes enable row level security;
alter table public.lessons enable row level security;
alter table public.retrieval_items enable row level security;
alter table public.assets enable row level security;
alter table public.retrieval_images enable row level security;
alter table public.lesson_versions enable row level security;

create policy "classes owner select" on public.classes for select to authenticated using ((select auth.uid()) = owner_id);
create policy "classes owner insert" on public.classes for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "classes owner update" on public.classes for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "classes owner delete" on public.classes for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "lessons owner select" on public.lessons for select to authenticated using ((select auth.uid()) = owner_id);
create policy "lessons owner insert" on public.lessons for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "lessons owner update" on public.lessons for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "lessons owner delete" on public.lessons for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "retrieval items owner select" on public.retrieval_items for select to authenticated using ((select auth.uid()) = owner_id);
create policy "retrieval items owner insert" on public.retrieval_items for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "retrieval items owner update" on public.retrieval_items for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "retrieval items owner delete" on public.retrieval_items for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "assets owner select" on public.assets for select to authenticated using ((select auth.uid()) = owner_id);
create policy "assets owner insert" on public.assets for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "assets owner update" on public.assets for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "assets owner delete" on public.assets for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "retrieval images owner select" on public.retrieval_images for select to authenticated using ((select auth.uid()) = owner_id);
create policy "retrieval images owner insert" on public.retrieval_images for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "retrieval images owner update" on public.retrieval_images for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "retrieval images owner delete" on public.retrieval_images for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "lesson versions owner select" on public.lesson_versions for select to authenticated using ((select auth.uid()) = owner_id);
create policy "lesson versions owner insert" on public.lesson_versions for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "lesson versions owner delete" on public.lesson_versions for delete to authenticated using ((select auth.uid()) = owner_id);

grant usage on schema public to authenticated;
grant all on public.classes to authenticated;
grant all on public.lessons to authenticated;
grant all on public.retrieval_items to authenticated;
grant all on public.assets to authenticated;
grant all on public.retrieval_images to authenticated;
grant all on public.lesson_versions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('lesson-assets', 'lesson-assets', false, 83886080)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

create policy "lesson assets owner select" on storage.objects
for select to authenticated
using (bucket_id = 'lesson-assets' and storage.foldername(name)[1] = (select auth.uid())::text);

create policy "lesson assets owner insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'lesson-assets' and storage.foldername(name)[1] = (select auth.uid())::text);

create policy "lesson assets owner update" on storage.objects
for update to authenticated
using (bucket_id = 'lesson-assets' and storage.foldername(name)[1] = (select auth.uid())::text)
with check (bucket_id = 'lesson-assets' and storage.foldername(name)[1] = (select auth.uid())::text);

create policy "lesson assets owner delete" on storage.objects
for delete to authenticated
using (bucket_id = 'lesson-assets' and storage.foldername(name)[1] = (select auth.uid())::text);
