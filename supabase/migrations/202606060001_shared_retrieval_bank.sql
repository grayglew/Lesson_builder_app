create extension if not exists pgcrypto;

create or replace function public.extract_retrieval_lo_code(value text)
returns text
language sql
immutable
as $$
  select lower(coalesce((regexp_match(coalesce(value, ''), '^\s*([0-9]{2,3}[a-z])(?=\s*:|\b)', 'i'))[1], ''));
$$;

alter table public.assets
  drop constraint if exists assets_kind_check;

alter table public.assets
  add constraint assets_kind_check
  check (kind in ('image', 'retrieval-image', 'pdf-page', 'backup', 'other'));

create table if not exists public.retrieval_los (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lo_code text not null,
  code_source text not null default 'prefix',
  legacy_lo_id text,
  lo_text text not null,
  lo_key text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retrieval_los_code_source_check check (code_source in ('prefix', 'fallback')),
  constraint retrieval_los_code_not_blank_check check (btrim(lo_code) <> '')
);

create or replace function public.set_retrieval_lo_key()
returns trigger
language plpgsql
as $$
begin
  new.lo_key = public.normalized_builder_key(new.lo_text);
  return new;
end;
$$;

drop trigger if exists retrieval_los_set_lo_key on public.retrieval_los;
create trigger retrieval_los_set_lo_key
before insert or update of lo_text on public.retrieval_los
for each row execute function public.set_retrieval_lo_key();

drop trigger if exists retrieval_los_set_updated_at on public.retrieval_los;
create trigger retrieval_los_set_updated_at
before update on public.retrieval_los
for each row execute function public.set_updated_at();

create unique index if not exists retrieval_los_owner_code_active_idx
on public.retrieval_los(owner_id, lo_code)
where archived_at is null;

create index if not exists retrieval_los_owner_archived_idx
on public.retrieval_los(owner_id, archived_at);

create table if not exists public.retrieval_class_progress (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  retrieval_lo_id uuid not null references public.retrieval_los(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  class_name text not null default '',
  spacing_factor numeric not null default 1.3,
  seen_count integer not null default 0,
  current_image_slot integer not null default 1,
  last_taught date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retrieval_class_progress_current_image_slot_check check (current_image_slot between 1 and 8),
  constraint retrieval_class_progress_seen_count_check check (seen_count >= 0)
);

drop trigger if exists retrieval_class_progress_set_updated_at on public.retrieval_class_progress;
create trigger retrieval_class_progress_set_updated_at
before update on public.retrieval_class_progress
for each row execute function public.set_updated_at();

create unique index if not exists retrieval_class_progress_owner_class_lo_active_idx
on public.retrieval_class_progress(owner_id, class_name, retrieval_lo_id)
where archived_at is null;

create index if not exists retrieval_class_progress_owner_class_archived_idx
on public.retrieval_class_progress(owner_id, class_name, archived_at);

create index if not exists retrieval_class_progress_owner_lo_idx
on public.retrieval_class_progress(owner_id, retrieval_lo_id);

create table if not exists public.retrieval_lo_images (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  retrieval_lo_id uuid not null references public.retrieval_los(id) on delete cascade,
  seen_count integer not null,
  role text not null default 'question',
  asset_id uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint retrieval_lo_images_seen_count_check check (seen_count between 1 and 8),
  constraint retrieval_lo_images_role_check check (role in ('question', 'answer'))
);

create unique index if not exists retrieval_lo_images_owner_lo_seen_role_idx
on public.retrieval_lo_images(owner_id, retrieval_lo_id, seen_count, role);

create index if not exists retrieval_lo_images_asset_id_idx
on public.retrieval_lo_images(asset_id);

create table if not exists public.retrieval_shared_migration_audit (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lo_code text not null,
  retrieval_lo_id uuid references public.retrieval_los(id) on delete set null,
  canonical_progress_id uuid,
  source_progress_id uuid,
  class_name text not null default '',
  image_slot_count integer not null default 0,
  image_byte_size bigint not null default 0,
  bank_signature text not null default '',
  selected_as_canonical boolean not null default false,
  reason text not null default 'initial_shared_retrieval_migration',
  created_at timestamptz not null default now()
);

create unique index if not exists retrieval_shared_migration_audit_source_reason_idx
on public.retrieval_shared_migration_audit(owner_id, source_progress_id, reason);

alter table public.retrieval_los enable row level security;
alter table public.retrieval_class_progress enable row level security;
alter table public.retrieval_lo_images enable row level security;
alter table public.retrieval_shared_migration_audit enable row level security;

drop policy if exists "retrieval los owner select" on public.retrieval_los;
drop policy if exists "retrieval los owner insert" on public.retrieval_los;
drop policy if exists "retrieval los owner update" on public.retrieval_los;
drop policy if exists "retrieval los owner delete" on public.retrieval_los;

create policy "retrieval los owner select" on public.retrieval_los for select to authenticated using ((select auth.uid()) = owner_id);
create policy "retrieval los owner insert" on public.retrieval_los for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "retrieval los owner update" on public.retrieval_los for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "retrieval los owner delete" on public.retrieval_los for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "retrieval class progress owner select" on public.retrieval_class_progress;
drop policy if exists "retrieval class progress owner insert" on public.retrieval_class_progress;
drop policy if exists "retrieval class progress owner update" on public.retrieval_class_progress;
drop policy if exists "retrieval class progress owner delete" on public.retrieval_class_progress;

create policy "retrieval class progress owner select" on public.retrieval_class_progress for select to authenticated using ((select auth.uid()) = owner_id);
create policy "retrieval class progress owner insert" on public.retrieval_class_progress for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "retrieval class progress owner update" on public.retrieval_class_progress for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "retrieval class progress owner delete" on public.retrieval_class_progress for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "retrieval lo images owner select" on public.retrieval_lo_images;
drop policy if exists "retrieval lo images owner insert" on public.retrieval_lo_images;
drop policy if exists "retrieval lo images owner update" on public.retrieval_lo_images;
drop policy if exists "retrieval lo images owner delete" on public.retrieval_lo_images;

create policy "retrieval lo images owner select" on public.retrieval_lo_images for select to authenticated using ((select auth.uid()) = owner_id);
create policy "retrieval lo images owner insert" on public.retrieval_lo_images for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "retrieval lo images owner update" on public.retrieval_lo_images for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "retrieval lo images owner delete" on public.retrieval_lo_images for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "retrieval shared migration audit owner select" on public.retrieval_shared_migration_audit;
drop policy if exists "retrieval shared migration audit owner insert" on public.retrieval_shared_migration_audit;
drop policy if exists "retrieval shared migration audit owner update" on public.retrieval_shared_migration_audit;
drop policy if exists "retrieval shared migration audit owner delete" on public.retrieval_shared_migration_audit;

create policy "retrieval shared migration audit owner select" on public.retrieval_shared_migration_audit for select to authenticated using ((select auth.uid()) = owner_id);
create policy "retrieval shared migration audit owner insert" on public.retrieval_shared_migration_audit for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "retrieval shared migration audit owner update" on public.retrieval_shared_migration_audit for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "retrieval shared migration audit owner delete" on public.retrieval_shared_migration_audit for delete to authenticated using ((select auth.uid()) = owner_id);

grant all on public.retrieval_los to authenticated;
grant all on public.retrieval_class_progress to authenticated;
grant all on public.retrieval_lo_images to authenticated;
grant all on public.retrieval_shared_migration_audit to authenticated;

drop table if exists pg_temp.legacy_item_banks;
create temporary table legacy_item_banks on commit drop as
with base as (
  select
    ri.id as item_id,
    ri.owner_id,
    ri.class_id,
    ri.class_name,
    ri.legacy_lo_id,
    ri.lo_text,
    coalesce(ri.lo_key, public.normalized_builder_key(ri.lo_text)) as lo_key,
    ri.spacing_factor,
    ri.seen_count,
    coalesce(ri.current_image_slot, 1) as current_image_slot,
    ri.last_taught,
    ri.archived_at,
    ri.created_at,
    ri.updated_at,
    public.extract_retrieval_lo_code(ri.lo_text) as extracted_code
  from public.retrieval_items ri
  where ri.archived_at is null
),
with_codes as (
  select
    *,
    case when extracted_code <> '' then extracted_code else lo_key end as lo_code,
    case when extracted_code <> '' then 'prefix' else 'fallback' end as code_source
  from base
),
with_images as (
  select
    wc.*,
    count(rimg.id)::integer as image_slot_count,
    coalesce(sum(a.byte_size), 0)::bigint as image_byte_size,
    coalesce(string_agg(concat_ws(':', coalesce(rimg.role, 'question'), rimg.seen_count, coalesce(a.checksum, a.id::text, 'missing')), '|' order by coalesce(rimg.role, 'question'), rimg.seen_count), '') as bank_signature
  from with_codes wc
  left join public.retrieval_images rimg on rimg.owner_id = wc.owner_id and rimg.retrieval_item_id = wc.item_id
  left join public.assets a on a.owner_id = wc.owner_id and a.id = rimg.asset_id
  group by wc.item_id, wc.owner_id, wc.class_id, wc.class_name, wc.legacy_lo_id, wc.lo_text, wc.lo_key, wc.spacing_factor, wc.seen_count, wc.current_image_slot, wc.last_taught, wc.archived_at, wc.created_at, wc.updated_at, wc.extracted_code, wc.lo_code, wc.code_source
)
select
  *,
  row_number() over (
    partition by owner_id, lo_code
    order by image_slot_count desc, updated_at desc, item_id
  ) as canonical_rank,
  count(*) over (partition by owner_id, lo_code) as duplicate_group_count
from with_images
where lo_code <> '';

insert into public.retrieval_los (
  owner_id,
  lo_code,
  code_source,
  legacy_lo_id,
  lo_text,
  lo_key,
  created_at,
  updated_at,
  archived_at
)
select
  owner_id,
  lo_code,
  code_source,
  legacy_lo_id,
  lo_text,
  public.normalized_builder_key(lo_text),
  created_at,
  updated_at,
  null
from legacy_item_banks
where canonical_rank = 1
on conflict (owner_id, lo_code) where archived_at is null
do update set
  code_source = excluded.code_source,
  legacy_lo_id = excluded.legacy_lo_id,
  lo_text = excluded.lo_text,
  lo_key = excluded.lo_key,
  archived_at = null;

drop table if exists pg_temp.shared_retrieval_lo_map;
create temporary table shared_retrieval_lo_map on commit drop as
select distinct
  b.owner_id,
  b.lo_code,
  l.id as retrieval_lo_id
from legacy_item_banks b
join public.retrieval_los l
  on l.owner_id = b.owner_id
 and l.lo_code = b.lo_code
 and l.archived_at is null;

insert into public.retrieval_class_progress (
  id,
  owner_id,
  retrieval_lo_id,
  class_id,
  class_name,
  spacing_factor,
  seen_count,
  current_image_slot,
  last_taught,
  created_at,
  updated_at,
  archived_at
)
select item_id,
  b.owner_id,
  m.retrieval_lo_id,
  class_id,
  class_name,
  spacing_factor,
  greatest(coalesce(seen_count, 0), 0),
  least(8, greatest(1, coalesce(current_image_slot, 1))),
  last_taught,
  created_at,
  updated_at,
  null
from legacy_item_banks b
join shared_retrieval_lo_map m on m.owner_id = b.owner_id and m.lo_code = b.lo_code
on conflict (id)
do update set
  retrieval_lo_id = excluded.retrieval_lo_id,
  class_id = excluded.class_id,
  class_name = excluded.class_name,
  spacing_factor = excluded.spacing_factor,
  seen_count = excluded.seen_count,
  current_image_slot = excluded.current_image_slot,
  last_taught = excluded.last_taught,
  archived_at = null;

insert into public.retrieval_lo_images (
  owner_id,
  retrieval_lo_id,
  seen_count,
  role,
  asset_id,
  created_at
)
select
  rimg.owner_id,
  m.retrieval_lo_id,
  rimg.seen_count,
  coalesce(rimg.role, 'question'),
  rimg.asset_id,
  min(rimg.created_at)
from legacy_item_banks b
join shared_retrieval_lo_map m on m.owner_id = b.owner_id and m.lo_code = b.lo_code
join public.retrieval_images rimg on rimg.owner_id = b.owner_id and rimg.retrieval_item_id = b.item_id
where b.canonical_rank = 1
group by rimg.owner_id, m.retrieval_lo_id, rimg.seen_count, coalesce(rimg.role, 'question'), rimg.asset_id
on conflict (owner_id, retrieval_lo_id, seen_count, role)
do update set asset_id = excluded.asset_id;

insert into public.retrieval_shared_migration_audit (
  owner_id,
  lo_code,
  retrieval_lo_id,
  canonical_progress_id,
  source_progress_id,
  class_name,
  image_slot_count,
  image_byte_size,
  bank_signature,
  selected_as_canonical,
  reason
)
select
  b.owner_id,
  b.lo_code,
  m.retrieval_lo_id,
  canonical.item_id,
  b.item_id,
  b.class_name,
  b.image_slot_count,
  b.image_byte_size,
  b.bank_signature,
  b.canonical_rank = 1,
  'initial_shared_retrieval_migration'
from legacy_item_banks b
join shared_retrieval_lo_map m on m.owner_id = b.owner_id and m.lo_code = b.lo_code
join legacy_item_banks canonical on canonical.owner_id = b.owner_id and canonical.lo_code = b.lo_code and canonical.canonical_rank = 1
where b.duplicate_group_count > 1
on conflict (owner_id, source_progress_id, reason)
do update set
  retrieval_lo_id = excluded.retrieval_lo_id,
  canonical_progress_id = excluded.canonical_progress_id,
  image_slot_count = excluded.image_slot_count,
  image_byte_size = excluded.image_byte_size,
  bank_signature = excluded.bank_signature,
  selected_as_canonical = excluded.selected_as_canonical;
