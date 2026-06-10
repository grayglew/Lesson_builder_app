alter table public.retrieval_items
  add column if not exists current_image_slot integer not null default 1;

alter table public.retrieval_items
  drop constraint if exists retrieval_items_current_image_slot_check,
  add constraint retrieval_items_current_image_slot_check check (current_image_slot between 1 and 8);

update public.retrieval_items
set current_image_slot = case
  when coalesce(seen_count, 0) <= 0 then 1
  else ((seen_count - 1) % 8) + 1
end;

create or replace function public.advance_retrieval_image_slot(p_item_id uuid)
returns table (
  id uuid,
  current_image_slot integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  available_slots integer[];
  selected_slot integer;
  current_slot integer;
begin
  select array_agg(distinct seen_count order by seen_count)
  into available_slots
  from public.retrieval_images
  where retrieval_item_id = p_item_id
    and owner_id = (select auth.uid())
    and role = 'question'
    and seen_count between 1 and 8;

  if available_slots is null or array_length(available_slots, 1) is null then
    select retrieval_items.current_image_slot
    into current_slot
    from public.retrieval_items
    where retrieval_items.id = p_item_id
      and retrieval_items.owner_id = (select auth.uid())
      and retrieval_items.archived_at is null;

    if current_slot is null then
      return;
    end if;

    return query
      select p_item_id, current_slot;
    return;
  end if;

  select retrieval_items.current_image_slot
  into current_slot
  from public.retrieval_items
  where retrieval_items.id = p_item_id
    and retrieval_items.owner_id = (select auth.uid())
    and retrieval_items.archived_at is null
  for update;

  if current_slot is null then
    return;
  end if;

  select slot
  into selected_slot
  from unnest(available_slots) as slot
  where slot > current_slot
  order by slot
  limit 1;

  if selected_slot is null then
    selected_slot := available_slots[1];
  end if;

  update public.retrieval_items
  set current_image_slot = selected_slot
  where retrieval_items.id = p_item_id
    and retrieval_items.owner_id = (select auth.uid())
    and retrieval_items.archived_at is null;

  return query
    select p_item_id, selected_slot;
end;
$$;

grant execute on function public.advance_retrieval_image_slot(uuid) to authenticated;
