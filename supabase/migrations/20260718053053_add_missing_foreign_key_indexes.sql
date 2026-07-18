create index if not exists lesson_versions_owner_id_idx
  on public.lesson_versions (owner_id);

create index if not exists lessons_owner_id_idx
  on public.lessons (owner_id);

create index if not exists presentation_sessions_source_lesson_id_idx
  on public.presentation_sessions (source_lesson_id);

create index if not exists retrieval_class_progress_class_id_idx
  on public.retrieval_class_progress (class_id);

create index if not exists retrieval_class_progress_retrieval_lo_id_idx
  on public.retrieval_class_progress (retrieval_lo_id);

create index if not exists retrieval_images_retrieval_item_id_idx
  on public.retrieval_images (retrieval_item_id);

create index if not exists retrieval_lo_images_retrieval_lo_id_idx
  on public.retrieval_lo_images (retrieval_lo_id);

create index if not exists retrieval_shared_migration_audit_retrieval_lo_id_idx
  on public.retrieval_shared_migration_audit (retrieval_lo_id);
