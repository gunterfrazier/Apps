-- Version 29: Control keys. A control key lets a Stream Deck (through Bitfocus Companion), a MIDI bridge or any tool
-- that can call a web address send commands to the booth without anyone signing in on that computer. The control
-- function (supabase/functions/control) checks the key and sends the command on the church's private control
-- channel from version 28.
--   Only a hash of each key is kept; the key itself is shown once, when it's made.
--   People with "Screens and devices" (manage.devices) make, list and remove keys.
--   A key can be kept to one campus, so its commands only move that campus's presenter.
--   Each key may send 30 commands in 10 seconds; more than that are turned away.
-- Run after upgrade-28.sql. New projects get the same from schema.sql.
begin;

create table if not exists public.control_keys (
  id text primary key default substr(md5(gen_random_uuid()::text), 1, 12),
  church_id text not null references public.churches(id) on delete cascade,
  name text not null,
  location_id text,
  hash text not null unique,
  hint text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_used timestamptz,
  window_start timestamptz,
  window_count int not null default 0
);
create index if not exists control_keys_church on public.control_keys (church_id);
alter table public.control_keys enable row level security;
revoke all on public.control_keys from public, anon, authenticated;

-- A new key. Returns the key once; only its hash is kept.
create or replace function public.control_key_create(c text, key_name text, loc text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k text := 'ofc_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  row_id text;
begin
  if not can(c, 'manage.devices') then raise exception 'Screens and devices access is required'; end if;
  if coalesce(trim(key_name), '') = '' then raise exception 'Name the key, like "Booth Stream Deck"'; end if;
  if loc is not null and not exists (select 1 from locations l where l.id = loc and l.church_id = c) then raise exception 'That campus was not found'; end if;
  if (select count(*) from control_keys where church_id = c) >= 50 then raise exception 'A church can have up to 50 control keys'; end if;
  insert into control_keys (church_id, name, location_id, hash, hint, created_by)
    values (c, left(trim(key_name), 60), loc, encode(sha256(convert_to(k, 'UTF8')), 'hex'), right(k, 4), auth.uid())
    returning id into row_id;
  return jsonb_build_object('id', row_id, 'key', k);
end $$;

create or replace function public.control_keys_list(c text) returns table(id text, name text, location_id text, hint text, created_at timestamptz, last_used timestamptz, created_by_name text)
language sql stable security definer set search_path = public as $$
  select k.id, k.name, k.location_id, k.hint, k.created_at, k.last_used, coalesce(p.name, '')
  from control_keys k left join profiles p on p.id = k.created_by
  where k.church_id = c and can(c, 'manage.devices') order by k.created_at
$$;

create or replace function public.control_key_remove(c text, key_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can(c, 'manage.devices') then raise exception 'Screens and devices access is required'; end if;
  delete from control_keys where id = key_id and church_id = c;
end $$;

-- Used only by the control function, with the server's key: checks the key, counts it against its limit, and sends
-- the command to the church's booth. Returns the church, or an error the function passes back.
create or replace function public.control_send(k text, cmd jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r control_keys%rowtype;
  now_at timestamptz := clock_timestamp();
begin
  select * into r from control_keys where hash = encode(sha256(convert_to(coalesce(k, ''), 'UTF8')), 'hex') for update;
  if not found then return jsonb_build_object('error', 'This control key was not found. It may have been removed.', 'status', 401); end if;
  if not church_live(r.church_id) then return jsonb_build_object('error', 'This church is not active.', 'status', 403); end if;
  if r.window_start is null or r.window_start < now_at - interval '10 seconds' then
    update control_keys set window_start = now_at, window_count = 1, last_used = now_at where id = r.id;
  elsif r.window_count >= 30 then
    return jsonb_build_object('error', 'Too many commands. Wait a few seconds.', 'status', 429);
  else
    update control_keys set window_count = window_count + 1, last_used = now_at where id = r.id;
  end if;
  perform realtime.send(cmd || jsonb_build_object('church', r.church_id, 'loc', r.location_id, 'from', r.name, '_id', gen_random_uuid()::text),
    'cmd', 'control:' || r.church_id, true);
  return jsonb_build_object('church', r.church_id);
end $$;

revoke all on function public.control_key_create(text, text, text) from public, anon;
revoke all on function public.control_keys_list(text) from public, anon;
revoke all on function public.control_key_remove(text, text) from public, anon;
grant execute on function public.control_key_create(text, text, text) to authenticated;
grant execute on function public.control_keys_list(text) to authenticated;
grant execute on function public.control_key_remove(text, text) to authenticated;
revoke all on function public.control_send(text, jsonb) from public, anon, authenticated;
grant execute on function public.control_send(text, jsonb) to service_role;

commit;
