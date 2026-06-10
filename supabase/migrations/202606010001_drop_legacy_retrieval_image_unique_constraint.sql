alter table public.retrieval_images
  drop constraint if exists retrieval_images_retrieval_item_id_seen_count_key;

create unique index if not exists retrieval_images_owner_item_seen_role_idx
on public.retrieval_images(owner_id, retrieval_item_id, seen_count, role);
