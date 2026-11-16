-- Our Faithful Church App: upgrade a version 13 database to version 14. Run once in the Supabase SQL editor, after upgrade-13.sql.
-- (A new project doesn't need this: schema.sql already includes it.)
--
-- Version 14 adds sheet music to songs, shown on stage displays set to an instrument. Pages are pictures in the media
-- bucket under <church>/songs/, so people who plan services ("Plan services", services.plan) can now upload and remove
-- files there too, alongside those who manage sermons, the landing page or content.

drop policy if exists "staff upload media" on storage.objects;
drop policy if exists "staff change media" on storage.objects;
drop policy if exists "staff remove media" on storage.objects;
create policy "staff upload media" on storage.objects for insert with check (bucket_id = 'media' and (can((storage.foldername(name))[1], 'manage.sermons') or can((storage.foldername(name))[1], 'manage.page') or can((storage.foldername(name))[1], 'manage.content') or can((storage.foldername(name))[1], 'services.plan')));
create policy "staff change media" on storage.objects for update using (bucket_id = 'media' and (can((storage.foldername(name))[1], 'manage.sermons') or can((storage.foldername(name))[1], 'manage.page') or can((storage.foldername(name))[1], 'services.plan')));
create policy "staff remove media" on storage.objects for delete using (bucket_id = 'media' and (can((storage.foldername(name))[1], 'manage.sermons') or can((storage.foldername(name))[1], 'manage.page') or can((storage.foldername(name))[1], 'services.plan')));
