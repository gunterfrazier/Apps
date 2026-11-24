-- Version 25: deleting your own account (Me, Delete my account; required for Google Play).
-- What's personal is deleted. What the church has to keep (giving records for tax statements, ticket payments, kids'
-- check-in history, safety reports, and the sermons, lessons and media someone made for the church) stays with the
-- church, without the account attached. Someone who is a church's primary account holder, or has recurring gifts
-- running, is asked to sort those out first.
-- Run after upgrade-24.sql. New projects get the same function from schema.sql.
begin;

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
      'followups', 'activity', 'securityIncidents', 'checkins', 'mediaLibrary');
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
