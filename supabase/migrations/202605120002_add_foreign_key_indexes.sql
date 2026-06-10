create index if not exists lessons_class_id_idx on public.lessons(class_id);
create index if not exists retrieval_items_class_id_idx on public.retrieval_items(class_id);
create index if not exists assets_lesson_id_idx on public.assets(lesson_id);
create index if not exists assets_retrieval_item_id_idx on public.assets(retrieval_item_id);
create index if not exists retrieval_images_asset_id_idx on public.retrieval_images(asset_id);
create index if not exists lesson_versions_lesson_id_idx on public.lesson_versions(lesson_id);
