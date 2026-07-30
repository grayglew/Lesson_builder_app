-- Global Doctor Frost catalogue. Existing rows remain personal until the
-- separately-approved promotion command changes their scope.

alter table public.retrieval_los
  add column if not exists scope text not null default 'personal';

alter table public.retrieval_los
  drop constraint if exists retrieval_los_scope_check;

alter table public.retrieval_los
  add constraint retrieval_los_scope_check
  check (scope in ('personal', 'global'));

alter table public.retrieval_lo_images
  add column if not exists scope text not null default 'personal',
  add column if not exists is_hidden boolean not null default false;

alter table public.retrieval_lo_images
  alter column asset_id drop not null;

alter table public.retrieval_lo_images
  drop constraint if exists retrieval_lo_images_scope_check,
  drop constraint if exists retrieval_lo_images_asset_or_hidden_check;

alter table public.retrieval_lo_images
  add constraint retrieval_lo_images_scope_check
    check (scope in ('personal', 'global')),
  add constraint retrieval_lo_images_asset_or_hidden_check
    check (
      (scope = 'global' and is_hidden = false and asset_id is not null)
      or
      (scope = 'personal' and (
        (is_hidden = false and asset_id is not null)
        or (is_hidden = true and asset_id is null)
      ))
    );

drop index if exists public.retrieval_los_owner_code_active_idx;
drop index if exists public.retrieval_lo_images_owner_lo_seen_role_idx;

create unique index retrieval_los_global_code_active_idx
on public.retrieval_los(lo_code)
where scope = 'global' and archived_at is null;

create unique index retrieval_los_personal_owner_code_active_idx
on public.retrieval_los(owner_id, lo_code)
where scope = 'personal' and archived_at is null;

create unique index retrieval_lo_images_global_slot_idx
on public.retrieval_lo_images(retrieval_lo_id, seen_count, role)
where scope = 'global';

create unique index retrieval_lo_images_personal_slot_idx
on public.retrieval_lo_images(owner_id, retrieval_lo_id, seen_count, role)
where scope = 'personal';

create index if not exists retrieval_los_global_wording_idx
on public.retrieval_los(lo_key)
where scope = 'global' and archived_at is null;

drop policy if exists "retrieval_los owner select" on public.retrieval_los;
drop policy if exists "retrieval_los owner insert" on public.retrieval_los;
drop policy if exists "retrieval_los owner update" on public.retrieval_los;
drop policy if exists "retrieval_los owner delete" on public.retrieval_los;
drop policy if exists "retrieval los owner select" on public.retrieval_los;
drop policy if exists "retrieval los owner insert" on public.retrieval_los;
drop policy if exists "retrieval los owner update" on public.retrieval_los;
drop policy if exists "retrieval los owner delete" on public.retrieval_los;

create policy "retrieval_los active catalogue select"
on public.retrieval_los for select to authenticated
using (
  app_private.is_active_app_user((select auth.uid()))
  and (scope = 'global' or owner_id = (select auth.uid()))
);

create policy "retrieval_los personal insert"
on public.retrieval_los for insert to authenticated
with check (
  app_private.is_active_app_user((select auth.uid()))
  and scope = 'personal'
  and owner_id = (select auth.uid())
);

create policy "retrieval_los personal update"
on public.retrieval_los for update to authenticated
using (
  app_private.is_active_app_user((select auth.uid()))
  and scope = 'personal'
  and owner_id = (select auth.uid())
)
with check (
  app_private.is_active_app_user((select auth.uid()))
  and scope = 'personal'
  and owner_id = (select auth.uid())
);

create policy "retrieval_los personal delete"
on public.retrieval_los for delete to authenticated
using (
  app_private.is_active_app_user((select auth.uid()))
  and scope = 'personal'
  and owner_id = (select auth.uid())
);

drop policy if exists "retrieval_lo_images owner select" on public.retrieval_lo_images;
drop policy if exists "retrieval_lo_images owner insert" on public.retrieval_lo_images;
drop policy if exists "retrieval_lo_images owner update" on public.retrieval_lo_images;
drop policy if exists "retrieval_lo_images owner delete" on public.retrieval_lo_images;
drop policy if exists "retrieval lo images owner select" on public.retrieval_lo_images;
drop policy if exists "retrieval lo images owner insert" on public.retrieval_lo_images;
drop policy if exists "retrieval lo images owner update" on public.retrieval_lo_images;
drop policy if exists "retrieval lo images owner delete" on public.retrieval_lo_images;

create policy "retrieval_lo_images active catalogue select"
on public.retrieval_lo_images for select to authenticated
using (
  app_private.is_active_app_user((select auth.uid()))
  and (scope = 'global' or owner_id = (select auth.uid()))
);

create policy "retrieval_lo_images personal insert"
on public.retrieval_lo_images for insert to authenticated
with check (
  app_private.is_active_app_user((select auth.uid()))
  and scope = 'personal'
  and owner_id = (select auth.uid())
);

create policy "retrieval_lo_images personal update"
on public.retrieval_lo_images for update to authenticated
using (
  app_private.is_active_app_user((select auth.uid()))
  and scope = 'personal'
  and owner_id = (select auth.uid())
)
with check (
  app_private.is_active_app_user((select auth.uid()))
  and scope = 'personal'
  and owner_id = (select auth.uid())
);

create policy "retrieval_lo_images personal delete"
on public.retrieval_lo_images for delete to authenticated
using (
  app_private.is_active_app_user((select auth.uid()))
  and scope = 'personal'
  and owner_id = (select auth.uid())
);

grant select, insert, update, delete on public.retrieval_los to authenticated;
grant select, insert, update, delete on public.retrieval_lo_images to authenticated;
