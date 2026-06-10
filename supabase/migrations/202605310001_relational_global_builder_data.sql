create extension if not exists pgcrypto;

alter table public.classes
  add column if not exists sort_order integer not null default 0,
  add column if not exists archived_at timestamptz;

create index if not exists classes_owner_archived_sort_idx
on public.classes(owner_id, archived_at, sort_order);

alter table public.retrieval_items
  add column if not exists legacy_json_id text,
  add column if not exists lo_key text;

alter table public.retrieval_items
  alter column spacing_factor type numeric using spacing_factor::numeric,
  alter column spacing_factor set default 1.3;

create or replace function public.normalized_builder_key(value text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace(coalesce(value, ''), '\s+', ' ', 'g')));
$$;

create or replace function public.set_retrieval_item_lo_key()
returns trigger
language plpgsql
as $$
begin
  new.lo_key = public.normalized_builder_key(new.lo_text);
  return new;
end;
$$;

update public.retrieval_items
set lo_key = public.normalized_builder_key(lo_text)
where lo_key is null or lo_key = '';

drop trigger if exists retrieval_items_set_lo_key on public.retrieval_items;
create trigger retrieval_items_set_lo_key
before insert or update of lo_text on public.retrieval_items
for each row execute function public.set_retrieval_item_lo_key();

create unique index if not exists retrieval_items_owner_legacy_json_id_idx
on public.retrieval_items(owner_id, legacy_json_id)
where legacy_json_id is not null and legacy_json_id <> '';

create unique index if not exists retrieval_items_owner_class_lo_key_active_idx
on public.retrieval_items(owner_id, class_name, lo_key)
where archived_at is null;

create index if not exists retrieval_items_owner_class_archived_idx
on public.retrieval_items(owner_id, class_name, archived_at);

alter table public.assets
  add column if not exists checksum text,
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

create index if not exists assets_owner_checksum_idx
on public.assets(owner_id, checksum)
where checksum is not null and checksum <> '';

alter table public.retrieval_images
  add column if not exists role text not null default 'question';

alter table public.retrieval_images
  drop constraint if exists retrieval_images_role_check,
  add constraint retrieval_images_role_check check (role in ('question', 'answer'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'retrieval_images_owner_id_retrieval_item_id_seen_count_key'
      and conrelid = 'public.retrieval_images'::regclass
  ) then
    alter table public.retrieval_images
      drop constraint retrieval_images_owner_id_retrieval_item_id_seen_count_key;
  end if;
end $$;

create unique index if not exists retrieval_images_owner_item_seen_role_idx
on public.retrieval_images(owner_id, retrieval_item_id, seen_count, role);

create index if not exists retrieval_images_owner_item_role_idx
on public.retrieval_images(owner_id, retrieval_item_id, role);

create table if not exists public.slide_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  template_id text not null,
  title text not null,
  bullets jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, template_id)
);

drop trigger if exists slide_templates_set_updated_at on public.slide_templates;
create trigger slide_templates_set_updated_at
before update on public.slide_templates
for each row execute function public.set_updated_at();

alter table public.slide_templates enable row level security;

drop policy if exists "slide templates owner select" on public.slide_templates;
drop policy if exists "slide templates owner insert" on public.slide_templates;
drop policy if exists "slide templates owner update" on public.slide_templates;
drop policy if exists "slide templates owner delete" on public.slide_templates;

create policy "slide templates owner select" on public.slide_templates
for select to authenticated
using (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

create policy "slide templates owner insert" on public.slide_templates
for insert to authenticated
with check (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

create policy "slide templates owner update" on public.slide_templates
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

create policy "slide templates owner delete" on public.slide_templates
for delete to authenticated
using (
  (select auth.uid()) = owner_id
  and (select auth.uid()) in (
    '225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid,
    'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid
  )
);

grant all on public.slide_templates to authenticated;

create or replace function public.apply_retrieval_seen_delta(
  p_item_id uuid,
  p_delta integer,
  p_teaching_date date
)
returns table (
  id uuid,
  lo_text text,
  class_name text,
  seen_count integer,
  last_taught date,
  updated_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
  update public.retrieval_items
  set seen_count = greatest(0, retrieval_items.seen_count + case when p_delta < 0 then -1 else 1 end),
      last_taught = case
        when p_delta > 0 then coalesce(p_teaching_date, current_date)
        else retrieval_items.last_taught
      end
  where retrieval_items.id = p_item_id
    and retrieval_items.owner_id = (select auth.uid())
    and retrieval_items.archived_at is null
  returning retrieval_items.id,
            retrieval_items.lo_text,
            retrieval_items.class_name,
            retrieval_items.seen_count,
            retrieval_items.last_taught,
            retrieval_items.updated_at;
$$;

grant execute on function public.apply_retrieval_seen_delta(uuid, integer, date) to authenticated;
