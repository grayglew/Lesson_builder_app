alter table public.builder_lessons
  add column if not exists taught_at timestamptz;

create index if not exists builder_lessons_owner_deleted_taught_date_idx
on public.builder_lessons (owner_id, deleted_at, taught_at, teaching_date, title);
