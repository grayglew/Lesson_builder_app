alter table public.builder_lessons
  add column if not exists confidence_summary jsonb not null default '{}'::jsonb;
