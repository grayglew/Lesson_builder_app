alter function public.set_updated_at()
  set search_path = public, pg_temp;

alter function public.normalized_builder_key(text)
  set search_path = public, pg_temp;

alter function public.set_retrieval_item_lo_key()
  set search_path = public, pg_temp;

alter function public.extract_retrieval_lo_code(text)
  set search_path = public, pg_temp;

alter function public.set_retrieval_lo_key()
  set search_path = public, pg_temp;
