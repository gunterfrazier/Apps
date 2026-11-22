-- Version 20: the media library. Photos and videos the church saves (from Find media, a link or an upload) for
-- slides, signage, the Home banner, landing pages and anywhere else a picture goes.
-- Run after upgrade-19.sql. New projects get the same rules from schema.sql.
begin;

create or replace function can_build_media(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_primary(c) or can(c, 'manage.content') or can(c, 'manage.church') or can(c, 'manage.sermons') or can(c, 'manage.page')
    or can(c, 'manage.devices') or can(c, 'manage.classes') or can(c, 'manage.locations') or can(c, 'services.plan')
$$;
revoke execute on function can_build_media(text) from public, anon;
grant execute on function can_build_media(text) to authenticated;

-- Everyone who builds things sees and adds to the library; members see what's published anyway, so they don't need it.
drop policy if exists "read media library" on records;
create policy "read media library" on records for select to authenticated using (
  kind = 'mediaLibrary' and (is_primary(church_id) or church_live(church_id)) and can_build_media(church_id));
drop policy if exists "add to media library" on records;
create policy "add to media library" on records for insert to authenticated with check (
  kind = 'mediaLibrary' and (is_primary(church_id) or church_live(church_id)) and can_build_media(church_id) and data->>'by' = auth.uid()::text);
drop policy if exists "change media library" on records;
create policy "change media library" on records for update to authenticated
  using (kind = 'mediaLibrary' and can_build_media(church_id)) with check (kind = 'mediaLibrary' and can_build_media(church_id));
drop policy if exists "remove from media library" on records;
create policy "remove from media library" on records for delete to authenticated using (kind = 'mediaLibrary' and can_build_media(church_id));

-- Library uploads (videos) go under the church's folder, like other media.
drop policy if exists "builders upload library media" on storage.objects;
create policy "builders upload library media" on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (storage.foldername(name))[2] = 'library' and can_build_media((storage.foldername(name))[1]));

commit;
