-- Version 26: Graphics. Saved designs (social posts, slides, lobby screens and flyers) are "graphics" records.
-- Finished graphics go to the media library, which upgrade-20.sql already allows.
-- Run after upgrade-25.sql. New projects get the same rules from schema.sql.
begin;

create or replace function can_build_graphics(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select can_build_media(c) or can(c, 'manage.integrations') or can(c, 'qr.create')
$$;
revoke execute on function can_build_graphics(text) from public, anon;
grant execute on function can_build_graphics(text) to authenticated;

-- Saved designs from Graphics. Everyone who builds with the media library can make, change and remove them.
drop policy if exists "read graphics" on records;
create policy "read graphics" on records for select to authenticated using (
  kind = 'graphics' and (is_primary(church_id) or church_live(church_id)) and can_build_graphics(church_id));
drop policy if exists "add graphics" on records;
create policy "add graphics" on records for insert to authenticated with check (
  kind = 'graphics' and (is_primary(church_id) or church_live(church_id)) and can_build_graphics(church_id) and data->>'by' = auth.uid()::text);
drop policy if exists "change graphics" on records;
create policy "change graphics" on records for update to authenticated
  using (kind = 'graphics' and can_build_graphics(church_id)) with check (kind = 'graphics' and can_build_graphics(church_id));
drop policy if exists "remove graphics" on records;
create policy "remove graphics" on records for delete to authenticated using (kind = 'graphics' and can_build_graphics(church_id));

-- Deleting an account keeps the graphics that person made for the church, like the media library.
create or replace function public.delete_my_account() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  owned text;
  kept int;
  removed int;
begin
  if me is null then raise exception 'Sign in to delete your account'; end if;
  select string_agg(name, ', ' order by name) into owned from churches where owner_id = me;
  if owned is not null then
    raise exception 'You''re the primary account holder of %. Make someone else the primary account holder, or deactivate the church, before deleting your account.', owned;
  end if;
  if exists (select 1 from records where kind = 'recurring' and owner = me::text and coalesce((data->>'active')::boolean, false)) then
    raise exception 'Stop your recurring gifts first (Give, then Recurring gifts), so nothing is charged after your account is gone.';
  end if;

  -- The church's records: kept, no longer tied to this account.
  update records set owner = null
    where owner = me::text and kind in ('gifts', 'recurring', 'pledges', 'ticketPayments', 'expenses', 'docs', 'outlines',
      'followups', 'activity', 'securityIncidents', 'checkins', 'mediaLibrary', 'graphics');
  get diagnostics kept = row_count;
  -- Everything else that was theirs: prayer requests, messages, registrations, serving, notifications and the rest.
  delete from records where owner = me::text;
  get diagnostics removed = row_count;
  update payments set user_id = null where user_id = me;
  update checkouts set user_id = null where user_id = me;
  delete from ai_usage where user_id = me;
  -- The account itself. Its profile, contact details, family (children and pickups), private settings, memberships and
  -- notification subscriptions go with it.
  delete from auth.users where id = me;
  return jsonb_build_object('kept', kept, 'removed', removed);
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

commit;
