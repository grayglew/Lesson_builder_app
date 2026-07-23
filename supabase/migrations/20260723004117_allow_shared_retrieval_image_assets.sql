alter table public.assets
  drop constraint if exists assets_check;

alter table public.assets
  add constraint assets_check
  check (
    kind = 'retrieval-image'
    or lesson_id is not null
    or retrieval_item_id is not null
  );
