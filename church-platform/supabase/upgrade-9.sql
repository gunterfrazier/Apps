-- Our Faithful Church App: upgrade a version 8 database to version 9. Run once in the Supabase SQL editor.
-- (A new project doesn't need this: schema.sql already includes it.)
--
-- Version 9 lets a church account be deactivated. A deactivated church is hidden from everyone except its primary
-- account holder, who can reactivate it for one year. After a year its data is removed for good.

-- ---------- Is the church's account open? ----------
-- False once it's deactivated. A training church goes quiet with the church it belongs to.
create or replace function church_live(c text) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from churches ch where ch.id = c and (ch.data->'deactivation'->>'status' = 'deactivated'
    or exists (select 1 from churches p where p.id = ch.data->'training'->>'of' and p.data->'deactivation'->>'status' = 'deactivated'))) $$;

-- The permission helpers: nobody but the primary account holder is a member of, or can do anything at, a deactivated church.
create or replace function is_member(c text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or (church_live(c) and exists (select 1 from memberships where church_id = c and user_id = auth.uid())) $$;
create or replace function my_rank(c text) returns int language sql stable security definer set search_path = public as
  $$ select case when is_primary(c) then 100 when not church_live(c) then 0 else coalesce((select r.rank from memberships m join roles r on r.church_id = m.church_id and r.key = m.role_key where m.church_id = c and m.user_id = auth.uid()), 0) end $$;
create or replace function can(c text, perm text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or (church_live(c) and (exists (select 1 from memberships m join roles r on r.church_id = m.church_id and r.key = m.role_key
       where m.church_id = c and m.user_id = auth.uid() and coalesce((r.perms->>perm)::boolean, false))
     or exists (select 1 from memberships m where m.church_id = c and m.user_id = auth.uid() and m.role_key like 'device:%' and perm = any(device_perms(substr(m.role_key, 8)))))) $$;
create or replace function sees_location(c text, loc text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or (church_live(c) and (loc is null or exists (select 1 from locations l where l.id = loc and l.visibility = 'public')
       or exists (select 1 from memberships m where m.church_id = c and m.user_id = auth.uid() and (m.locations = '"all"'::jsonb or m.locations ? loc)))) $$;
create or replace function child_counts(churches text[]) returns table (kind text, parent text, n bigint) language sql stable security definer set search_path = public as $$
  select 'events', data->>'_parent', sum(coalesce((data->>'count')::int, 1))::bigint from records where kind = 'event_regs' and church_id = any(churches) and (is_primary(church_id) or church_live(church_id)) group by 2
  union all
  select 'gatherings', data->>'_parent', count(*) from records where kind = 'gathering_regs' and church_id = any(churches) and data->>'status' = 'in' and (is_primary(church_id) or church_live(church_id)) group by 2 $$;

-- ---------- What everyone else stops seeing ----------
drop policy if exists "find churches" on churches;
create policy "find churches" on churches for select using (owner_id = auth.uid() or church_live(id));
drop policy if exists "see memberships" on memberships;
create policy "see memberships" on memberships for select using (is_primary(church_id) or (church_live(church_id) and (user_id = auth.uid() or is_member(church_id))));
drop policy if exists "join" on memberships;
create policy "join" on memberships for insert with check (user_id = auth.uid() and (is_primary(church_id)
  or (church_live(church_id) and role_key = (select coalesce(data->'defaults'->>'roleId', 'member') from churches where id = church_id)
      and locations = (select coalesce(data->'defaults'->'locations', '[]'::jsonb) from churches where id = church_id))));
drop policy if exists "fellow members see names" on profiles;
create policy "fellow members see names" on profiles for select using (shares_church(id, array['use.prayer'], true)
  or exists (select 1 from memberships a join memberships b on a.church_id = b.church_id where a.user_id = profiles.id and b.user_id = auth.uid() and (is_primary(a.church_id) or church_live(a.church_id))));
-- Records: even your own (a gift, a sign-up) are out of reach while the church is deactivated.
drop policy if exists "read records" on records;
drop policy if exists "add records" on records;
drop policy if exists "change records" on records;
drop policy if exists "remove records" on records;
create policy "read records" on records for select using ((is_primary(church_id) or church_live(church_id)) and rec_read(kind, church_id, location_id, owner, data));
create policy "add records" on records for insert with check ((is_primary(church_id) or church_live(church_id)) and rec_write(kind, church_id, owner, data, 'insert'));
create policy "change records" on records for update using ((is_primary(church_id) or church_live(church_id)) and rec_write(kind, church_id, owner, data, 'update'))
  with check ((is_primary(church_id) or church_live(church_id)) and rec_write(kind, church_id, owner, data, 'update'));
create policy "remove records" on records for delete using ((is_primary(church_id) or church_live(church_id)) and rec_write(kind, church_id, owner, data, 'delete'));

-- ---------- The deactivation record belongs to the server ----------
-- churches.data.deactivation says where the account stands. Browsers send the whole of a church's settings when they
-- save, and a phone with an old copy must never undo a deactivation (or cause one), so the guard keeps the server's
-- value whatever a browser sends. It only changes through church_deactivation() below.
create or replace function guard_church() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; need text; lifecycle boolean := coalesce(current_setting('our_faithful.lifecycle', true), '') = '1';
begin
  -- The deactivation record: kept as it is, even from server functions that save a church's settings whole.
  -- (To correct one by hand in the SQL editor, first run: select set_config('our_faithful.lifecycle', '1', false);)
  if not lifecycle then
    new.data := new.data - 'deactivation';
    if tg_op = 'UPDATE' and old.data ? 'deactivation' then new.data := new.data || jsonb_build_object('deactivation', old.data->'deactivation'); end if;
  end if;
  if auth.uid() is null then return new; end if;   -- server functions
  -- Payment status belongs to the server: whatever a browser sends, keep what the server last set.
  new.data := new.data - 'stripe' - 'payments';
  if tg_op = 'INSERT' then return new; end if;
  if old.data ? 'stripe' then new.data := new.data || jsonb_build_object('stripe', old.data->'stripe'); end if;
  if old.data ? 'payments' then new.data := new.data || jsonb_build_object('payments', old.data->'payments'); end if;
  -- A training church is one from the start and stays one; a real church can't be turned into one.
  new.data := new.data - 'training';
  if old.data ? 'training' then new.data := new.data || jsonb_build_object('training', old.data->'training'); end if;
  if new.owner_id is distinct from old.owner_id and old.owner_id <> auth.uid() then raise exception 'Only the primary account holder can hand over the account'; end if;
  if (new.name, new.handle) is distinct from (old.name, old.handle) and not can(old.id, 'manage.church') then raise exception 'Your role cannot change the church name or ID'; end if;
  for k in select key from jsonb_each(new.data) union select key from jsonb_each(old.data) loop
    if new.data->k is distinct from old.data->k and k <> 'deactivation' then   -- deactivation: only church_deactivation() gets here, and it checks who's asking
      need := case
        when k in ('landing', 'banner') then 'manage.page'
        when k in ('funds', 'textGive', 'taxId', 'givingLink') then 'view.giving'
        when k in ('teams', 'positions') then 'schedule.teams'
        when k in ('followupSteps', 'followupLead') then 'manage.followup'
        when k = 'podcast' then 'manage.sermons'
        when k = 'kidsRooms' then 'manage.classes'
        else 'manage.church' end;
      if not can(old.id, need) then raise exception 'Your role cannot change %', k; end if;
    end if;
  end loop;
  return new;
end $$;

-- Only the primary account holder can let a role ask to deactivate the account.
create or replace function guard_roles() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if coalesce((new.perms->>'church.deactivate')::boolean, false) and not is_primary(new.church_id)
     and (tg_op = 'INSERT' or not coalesce((old.perms->>'church.deactivate')::boolean, false)) then
    raise exception 'Only the primary account holder can let a role ask to deactivate the church account';
  end if;
  return new;
end $$;
drop trigger if exists roles_guard on roles;
create trigger roles_guard before insert or update on roles for each row execute function guard_roles();

-- A line in someone's notifications, written by the server.
create or replace function lifecycle_note(c text, person uuid, nid text, title text, body text, link text) returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into records (kind, id, church_id, owner, data) values ('notifications', nid, c, person::text,
    jsonb_build_object('churchId', c, 'userId', person, 'at', now(), 'read', false, 'kind', 'account', 'title', title, 'body', body, 'link', link))
  on conflict (kind, id) do nothing;
  return found;
end $$;

-- Asking, deciding, deactivating and reactivating. Returns the church's deactivation record as it now stands.
--   request     someone whose role includes church.deactivate asks; the primary account holder decides
--   withdraw    the person who asked (or the primary) takes the request back
--   decline     the primary says no
--   deactivate  the primary deactivates (this also approves a waiting request). Data is kept for one year.
--   reactivate  the primary brings the account back, any time in that year
create or replace function church_deactivation(c text, action text, note text default '') returns jsonb language plpgsql security definer set search_path = public as $$
declare ch churches%rowtype; d jsonb; st text; me uuid := auth.uid(); who text; due timestamptz;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select * into ch from churches where id = c for update;
  if not found then raise exception 'Church not found'; end if;
  if ch.data ? 'training' then raise exception 'A training church is deleted under Admin, Training church, not deactivated'; end if;
  d := coalesce(ch.data->'deactivation', '{}'::jsonb); st := coalesce(d->>'status', 'active');
  select coalesce(nullif(name, ''), 'Someone') into who from profiles where id = me;
  who := coalesce(who, 'Someone');
  if action = 'request' then
    if ch.owner_id = me then raise exception 'You are the primary account holder: deactivate the account yourself'; end if;
    if st = 'deactivated' or not can(c, 'church.deactivate') then raise exception 'Your role cannot ask to deactivate the church account'; end if;
    if st = 'requested' then raise exception 'Someone has already asked. The primary account holder decides.'; end if;
    d := jsonb_build_object('status', 'requested', 'requestedBy', me, 'requestedByName', who, 'requestedAt', now(), 'reason', left(coalesce(note, ''), 500));
    perform lifecycle_note(c, ch.owner_id, 'n-deact-ask-' || c || '-' || floor(extract(epoch from now()))::bigint,
      who || ' asked to deactivate ' || ch.name, 'Nothing changes unless you approve it. Review the request under Admin.', '#admin-deactivate');
  elsif action = 'withdraw' then
    if st <> 'requested' or (d->>'requestedBy' <> me::text and ch.owner_id <> me) then raise exception 'There is no request of yours to take back'; end if;
    d := jsonb_build_object('status', 'active', 'withdrawnAt', now());
  elsif action = 'decline' then
    if ch.owner_id <> me then raise exception 'Only the primary account holder can decide this'; end if;
    if st <> 'requested' then raise exception 'There is no request waiting'; end if;
    perform lifecycle_note(c, (d->>'requestedBy')::uuid, 'n-deact-no-' || c || '-' || floor(extract(epoch from now()))::bigint,
      ch.name || ' stays active', 'The primary account holder declined the request to deactivate the church account.', '#admin');
    d := jsonb_build_object('status', 'active', 'declinedAt', now());
  elsif action = 'deactivate' then
    if ch.owner_id <> me then raise exception 'Only the primary account holder can deactivate the church account'; end if;
    if st = 'deactivated' then return d; end if;
    due := now() + interval '1 year';
    d := jsonb_strip_nulls(jsonb_build_object('status', 'deactivated', 'by', me, 'at', now(), 'purgeAt', due,
      'requestedBy', case when st = 'requested' then d->'requestedBy' end, 'requestedByName', case when st = 'requested' then d->'requestedByName' end,
      'reason', nullif(left(coalesce(nullif(note, ''), d->>'reason', ''), 500), '')));
    perform lifecycle_note(c, me, 'n-deact-done-' || c || '-' || floor(extract(epoch from now()))::bigint,
      ch.name || ' is deactivated', 'Only you can see it now. Reactivate it any time before ' || to_char(due, 'FMMonth FMDD, YYYY') || '. After that, everything in it is permanently deleted.', '#reactivate-' || c);
  elsif action = 'reactivate' then
    if ch.owner_id <> me then raise exception 'Only the primary account holder can reactivate the church account'; end if;
    if st <> 'deactivated' then return d; end if;
    if (d->>'purgeAt')::timestamptz <= now() then raise exception 'The year to reactivate this account has passed'; end if;
    d := jsonb_build_object('status', 'active', 'reactivatedAt', now(), 'wasDeactivatedAt', d->'at');
  else raise exception 'Unknown action';
  end if;
  perform set_config('our_faithful.lifecycle', '1', true);
  update churches set data = jsonb_set(data, '{deactivation}', d) where id = c;
  perform set_config('our_faithful.lifecycle', '', true);
  return d;
end $$;

-- ---------- Reminders and the end of the year ----------
-- What's left behind once a church's data is gone: enough to email its primary account holder and clear its uploaded files.
create table if not exists purged_churches (id text primary key, name text not null, owner_id uuid, deactivated_at timestamptz,
  purged_at timestamptz not null default now(), emailed boolean not null default false, files_removed boolean not null default false);
-- One-time passes that let the hourly schedule call the church-lifecycle server function.
create table if not exists cron_calls (token uuid primary key, at timestamptz not null default now());
-- Which emails about a deactivation have gone out, so each is sent once.
create table if not exists lifecycle_emails (church_id text not null, key text not null, note text not null default '', at timestamptz not null default now(), primary key (church_id, key));
alter table purged_churches enable row level security;
alter table cron_calls enable row level security;
alter table lifecycle_emails enable row level security;
revoke all on purged_churches, cron_calls, lifecycle_emails from anon, authenticated;

create or replace function purge_church_rows(c text, tell boolean) returns void language plpgsql security definer set search_path = public as $$
declare ch churches%rowtype;
begin
  select * into ch from churches where id = c;
  if not found then return; end if;
  insert into purged_churches (id, name, owner_id, deactivated_at, emailed) values (ch.id, ch.name, ch.owner_id, (ch.data->'deactivation'->>'at')::timestamptz, not tell) on conflict (id) do nothing;
  -- Its screens and kiosks have sign-ins of their own.
  delete from auth.users where id in (select (data->>'deviceUser')::uuid from records where church_id = c and kind = 'devices' and data->>'deviceUser' ~ '^[0-9a-fA-F-]{36}$');
  delete from payments where church_id = c;
  delete from churches where id = c;   -- its roles, locations, memberships, records, checkouts and payment keys go with it
end $$;
-- Removes a church for good, and only one that has been deactivated for a full year.
create or replace function purge_church(c text) returns boolean language plpgsql security definer set search_path = public as $$
declare ch churches%rowtype; kid text;
begin
  select * into ch from churches where id = c for update;
  if not found then return false; end if;
  if ch.data->'deactivation'->>'status' is distinct from 'deactivated'
     or (ch.data->'deactivation'->>'at')::timestamptz > now() - interval '1 year'
     or (ch.data->'deactivation'->>'purgeAt')::timestamptz > now() then return false; end if;
  for kid in select id from churches where data->'training'->>'of' = c loop perform purge_church_rows(kid, false); end loop;
  perform purge_church_rows(c, true);
  return true;
end $$;
-- Run every hour (cron.sql). Adds the in-app reminders, removes churches whose year is up, and (given the address of
-- the church-lifecycle server function) has it send the emails and clear uploaded files.
-- Reminders go to the primary account holder with 180, 90, 30, 14, 7, 3 and 1 days left.
create or replace function church_lifecycle_tick(fn_url text default null) returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; days int; m int; reminded int := 0; purged int := 0; t uuid;
begin
  for r in select id, name, owner_id, data->'deactivation' as d from churches where data->'deactivation'->>'status' = 'deactivated' loop
    if (r.d->>'purgeAt')::timestamptz <= now() then
      if purge_church(r.id) then purged := purged + 1; end if;
      continue;
    end if;
    days := ceil(extract(epoch from ((r.d->>'purgeAt')::timestamptz - now())) / 86400.0);
    select min(x) into m from unnest(array[180, 90, 30, 14, 7, 3, 1]) x where x >= days;
    if m is not null and lifecycle_note(r.id, r.owner_id, 'n-deact-' || r.id || '-' || floor(extract(epoch from (r.d->>'at')::timestamptz))::bigint || '-' || m,
        r.name || ' will be deleted in ' || days || case when days = 1 then ' day' else ' days' end,
        'The church account is deactivated. Everything in it is permanently deleted on ' || to_char((r.d->>'purgeAt')::timestamptz, 'FMMonth FMDD, YYYY') || '. Reactivate it to keep it.',
        '#reactivate-' || r.id) then reminded := reminded + 1; end if;
  end loop;
  if fn_url is not null and (exists (select 1 from churches where data->'deactivation'->>'status' in ('requested', 'deactivated'))
      or exists (select 1 from purged_churches where not emailed or not files_removed)) then
    delete from cron_calls where at < now() - interval '1 day';
    t := gen_random_uuid();
    insert into cron_calls (token) values (t);
    perform net.http_post(url := fn_url, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-token', t::text), body := '{}'::jsonb);
  end if;
  return jsonb_build_object('reminded', reminded, 'purged', purged);
end $$;

revoke execute on function guard_roles(), lifecycle_note(text, uuid, text, text, text, text), purge_church_rows(text, boolean), purge_church(text), church_lifecycle_tick(text) from public, anon, authenticated;
revoke execute on function church_deactivation(text, text, text) from public, anon;
grant execute on function church_deactivation(text, text, text) to authenticated;
grant execute on function church_live(text) to anon, authenticated, service_role;
grant execute on function purge_church(text), church_lifecycle_tick(text), lifecycle_note(text, uuid, text, text, text, text) to service_role;
grant select, insert, update, delete on purged_churches, cron_calls, lifecycle_emails to service_role;
