alter policy "classes owner select" on public.classes
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "classes owner insert" on public.classes
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "classes owner update" on public.classes
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid))
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "classes owner delete" on public.classes
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));

alter policy "lessons owner select" on public.lessons
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "lessons owner insert" on public.lessons
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "lessons owner update" on public.lessons
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid))
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "lessons owner delete" on public.lessons
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));

alter policy "retrieval items owner select" on public.retrieval_items
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "retrieval items owner insert" on public.retrieval_items
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "retrieval items owner update" on public.retrieval_items
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid))
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "retrieval items owner delete" on public.retrieval_items
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));

alter policy "assets owner select" on public.assets
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "assets owner insert" on public.assets
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "assets owner update" on public.assets
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid))
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "assets owner delete" on public.assets
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));

alter policy "retrieval images owner select" on public.retrieval_images
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "retrieval images owner insert" on public.retrieval_images
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "retrieval images owner update" on public.retrieval_images
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid))
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "retrieval images owner delete" on public.retrieval_images
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));

alter policy "lesson versions owner select" on public.lesson_versions
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "lesson versions owner insert" on public.lesson_versions
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "lesson versions owner delete" on public.lesson_versions
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));

alter policy "builder state owner select" on public.builder_state_sync
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "builder state owner insert" on public.builder_state_sync
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "builder state owner update" on public.builder_state_sync
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid))
  with check ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "builder state owner delete" on public.builder_state_sync
  using ((select auth.uid()) = owner_id and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));

alter policy "lesson assets owner select" on storage.objects
  using (bucket_id = 'lesson-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "lesson assets owner insert" on storage.objects
  with check (bucket_id = 'lesson-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "lesson assets owner update" on storage.objects
  using (bucket_id = 'lesson-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid))
  with check (bucket_id = 'lesson-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
alter policy "lesson assets owner delete" on storage.objects
  using (bucket_id = 'lesson-assets' and (storage.foldername(name))[1] = (select auth.uid())::text and (select auth.uid()) in ('225f2092-e96f-4065-bf8f-0d68d7c3cf78'::uuid, 'ad7a8f0b-5d66-4110-a4cd-74ba5f92299e'::uuid));
