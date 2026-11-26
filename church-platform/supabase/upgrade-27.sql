-- Version 27: Time zones. Each church has a time zone (Admin, Account details), and a campus in another zone can
-- have its own (Admin, Locations). The app and the edge functions read them from churches.data.timeZone and
-- locations.data.timeZone, so no tables change. This adds church_zone() and uses it where the database writes a
-- date: the deactivation notices and the day an NFC tag tap is counted on.
-- Run after upgrade-26.sql. New projects get the same from schema.sql.
begin;

create or replace function church_zone(c text) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select z.name from churches ch join pg_timezone_names z on z.name = ch.data->>'timeZone' where ch.id = c limit 1), 'America/New_York')
$$;
revoke execute on function church_zone(text) from public, anon;
grant execute on function church_zone(text) to authenticated;

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
      ch.name || ' is deactivated', 'Only you can see it now. Reactivate it any time before ' || to_char(due at time zone church_zone(c), 'FMMonth FMDD, YYYY') || '. After that, everything in it is permanently deleted.', '#reactivate-' || c);
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
        'The church account is deactivated. Everything in it is permanently deleted on ' || to_char((r.d->>'purgeAt')::timestamptz at time zone church_zone(r.id), 'FMMonth FMDD, YYYY') || '. Reactivate it to keep it.',
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

create or replace function public.tag_open(tag text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r records%rowtype;
begin
  tag := lower(btrim(coalesce(tag, '')));
  if tag !~ '^[a-z0-9-]{3,30}$' then return null; end if;
  select * into r from records where kind = 'tagLinks' and lower(data->>'code') = tag limit 1;
  if not found or not church_live(r.church_id) or coalesce((r.data->>'paused')::boolean, false) then return null; end if;
  insert into tag_taps (code, church_id, day, taps) values (tag, r.church_id, (now() at time zone church_zone(r.church_id))::date, 1)
    on conflict (code, day) do update set taps = tag_taps.taps + 1;
  return jsonb_build_object('target', r.data->>'target', 'churchId', r.church_id);
end $$;
revoke execute on function public.tag_open(text) from public;
grant execute on function public.tag_open(text) to anon, authenticated;

commit;
