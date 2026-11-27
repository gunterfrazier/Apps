-- Version 30: Workstations, PINs and automatic lock.
-- A workstation is a shared church computer (the office PC, the security desk) paired under Devices like a screen.
-- Paired, it shows a lock screen: people pick their name, type their PIN, and use the app as themselves; when they
-- lock it, or stop using it for long enough, it goes back to the lock screen and stays signed in as the church's
-- workstation, which can do nothing on its own.
--   PINs: each person sets their own 6-digit PIN for each church (only a bcrypt hash is kept). Admins with
--   "Members and the directory" can clear someone's PIN or switch off their workstation sign-in. Five wrong tries
--   lock that name out for 15 minutes.
--   Sign-ins: each one is logged (who, which workstation, when) for the church's admins.
--   Automatic lock: the church sets a limit for everyone (churches.data.timeouts.master, in minutes), can set a
--   shorter or longer limit per role or per person (never more than the church's limit), and says who may choose a
--   shorter one for themselves. Only admins with "Church account, features and defaults" change the limits.
-- Run after upgrade-29.sql. New projects get the same from schema.sql.
begin;

create table if not exists public.workstation_pins (
  church_id text not null references public.churches(id) on delete cascade,
  user_id uuid not null,
  pin_hash text not null,
  enabled boolean not null default true,
  failed int not null default 0,
  locked_until timestamptz,
  set_at timestamptz not null default now(),
  primary key (church_id, user_id)
);
alter table public.workstation_pins enable row level security;
revoke all on public.workstation_pins from public, anon, authenticated;

create table if not exists public.workstation_signins (
  id bigint generated always as identity primary key,
  church_id text not null references public.churches(id) on delete cascade,
  device_id text,
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists workstation_signins_church on public.workstation_signins (church_id, at desc);
alter table public.workstation_signins enable row level security;
revoke all on public.workstation_signins from public, anon, authenticated;

-- Is the caller a person at this church (not a church device)?
create or replace function public.is_person_member(c text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.church_id = c and m.user_id = auth.uid() and m.role_key not like 'device:%')
$$;
-- PINs that are easy to guess are refused: one digit repeated, or counting up or down.
create or replace function public.pin_too_easy(p text) returns boolean language sql immutable as $$
  select p ~ '^(\d)\1{5}$' or position(p in '01234567890123456789') > 0 or position(p in '98765432109876543210') > 0
$$;

create or replace function public.set_my_pin(c text, pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_person_member(c) then raise exception 'Only members of this church can set a PIN for its computers'; end if;
  if pin !~ '^\d{6}$' then raise exception 'A PIN is 6 digits'; end if;
  if pin_too_easy(pin) then raise exception 'That PIN is too easy to guess. Avoid repeated digits and counting up or down.'; end if;
  if exists (select 1 from workstation_pins where church_id = c and user_id = auth.uid() and not enabled) then raise exception 'Your church has switched off computer sign-in for you. Ask an admin.'; end if;
  insert into workstation_pins (church_id, user_id, pin_hash) values (c, auth.uid(), crypt(pin, gen_salt('bf', 8)))
  on conflict (church_id, user_id) do update set pin_hash = excluded.pin_hash, failed = 0, locked_until = null, set_at = now();
end $$;
create or replace function public.remove_my_pin(c text) returns void language sql security definer set search_path = public as $$
  delete from workstation_pins where church_id = c and user_id = auth.uid() and enabled
$$;
create or replace function public.my_pin(c text) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('set', true, 'enabled', enabled, 'set_at', set_at) from workstation_pins where church_id = c and user_id = auth.uid()), '{"set": false, "enabled": true}'::jsonb)
$$;

-- For admins: who has a PIN, and switching someone's workstation sign-in off or on, or clearing their PIN.
create or replace function public.workstation_pins_list(c text) returns table(user_id uuid, enabled boolean, set_at timestamptz, locked_until timestamptz)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.enabled, p.set_at, p.locked_until from workstation_pins p where p.church_id = c and can(c, 'manage.people')
$$;
create or replace function public.workstation_pin_admin(c text, who uuid, what text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not can(c, 'manage.people') then raise exception 'Members and the directory access is required'; end if;
  if what = 'clear' then delete from workstation_pins where church_id = c and user_id = who;
  elsif what = 'disable' then
    insert into workstation_pins (church_id, user_id, pin_hash, enabled) values (c, who, '!', false)
    on conflict (church_id, user_id) do update set enabled = false, pin_hash = '!';
  elsif what = 'enable' then delete from workstation_pins where church_id = c and user_id = who and not enabled;
  elsif what = 'unlock' then update workstation_pins set failed = 0, locked_until = null where church_id = c and user_id = who;
  else raise exception 'Unknown action'; end if;
end $$;
create or replace function public.workstation_signins_list(c text, lim int default 100) returns table(at timestamptz, user_id uuid, name text, device_id text)
language sql stable security definer set search_path = public as $$
  select s.at, s.user_id, coalesce(p.name, ''), s.device_id from workstation_signins s left join profiles p on p.id = s.user_id
  where s.church_id = c and can(c, 'manage.people') order by s.at desc limit least(greatest(lim, 1), 500)
$$;

-- For the workstation function only (the server's key): the names on the lock screen, and checking a PIN.
create or replace function public.workstation_people(c text) returns table(user_id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(p.name, 'Member'), coalesce(r.name, m.role_key)
  from workstation_pins w join memberships m on m.church_id = w.church_id and m.user_id = w.user_id and m.role_key not like 'device:%'
  left join profiles p on p.id = m.user_id left join roles r on r.church_id = m.church_id and r.key = m.role_key
  where w.church_id = c and w.enabled and church_live(c) order by 2
$$;
create or replace function public.workstation_check_pin(c text, who uuid, pin text, device text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare w workstation_pins%rowtype;
begin
  select * into w from workstation_pins where church_id = c and user_id = who for update;
  if not found or not w.enabled or not exists (select 1 from memberships m where m.church_id = c and m.user_id = who and m.role_key not like 'device:%')
    then return jsonb_build_object('ok', false, 'error', 'That name can''t sign in here.'); end if;
  if w.locked_until > now() then return jsonb_build_object('ok', false, 'error', 'Too many wrong PINs. Try again later.', 'until', w.locked_until); end if;
  if w.pin_hash = crypt(coalesce(pin, ''), w.pin_hash) then
    update workstation_pins set failed = 0, locked_until = null where church_id = c and user_id = who;
    insert into workstation_signins (church_id, device_id, user_id) values (c, device, who);
    return jsonb_build_object('ok', true);
  end if;
  update workstation_pins set failed = failed + 1, locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' end where church_id = c and user_id = who;
  return jsonb_build_object('ok', false, 'error', case when w.failed + 1 >= 5 then 'Too many wrong PINs. This name is locked for 15 minutes.' else 'That PIN didn''t match.' end,
    'left', greatest(0, 4 - w.failed));
end $$;

-- Automatic lock. churches.data.timeouts = { master: minutes, roles: { <role>: { minutes, adjust } },
--   people: { <user id>: { minutes, adjust, mine } } }. A person's own choice ("mine") is kept only if they may
-- adjust it and it's no longer than their limit.
create or replace function public.set_my_lock_minutes(c text, minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare t jsonb; rk text; lim int; may boolean; me text := auth.uid()::text;
begin
  if not is_person_member(c) then raise exception 'Only members of this church can choose this'; end if;
  select coalesce(data->'timeouts', '{}'::jsonb) into t from churches where id = c;
  select m.role_key into rk from memberships m where m.church_id = c and m.user_id = auth.uid();
  lim := least(coalesce((t->>'master')::int, 60), coalesce((t->'people'->me->>'minutes')::int, (t->'roles'->rk->>'minutes')::int, (t->>'master')::int, 60));
  may := coalesce((t->'people'->me->>'adjust')::boolean, (t->'roles'->rk->>'adjust')::boolean, coalesce((t->>'adjust')::boolean, true));
  if not may then raise exception 'Your church sets this for you'; end if;
  if minutes is not null and (minutes < 1 or minutes > lim) then raise exception 'Choose between 1 and % minutes', lim; end if;
  update churches set data = jsonb_set(coalesce(data, '{}'::jsonb), '{timeouts}',
    jsonb_set(t, '{people}', coalesce(t->'people', '{}'::jsonb) || jsonb_build_object(me,
      case when minutes is null then coalesce(t->'people'->me, '{}'::jsonb) - 'mine' else coalesce(t->'people'->me, '{}'::jsonb) || jsonb_build_object('mine', minutes) end)))
  where id = c;
end $$;

revoke all on function public.set_my_pin(text, text) from public, anon;
revoke all on function public.remove_my_pin(text) from public, anon;
revoke all on function public.my_pin(text) from public, anon;
revoke all on function public.workstation_pins_list(text) from public, anon;
revoke all on function public.workstation_pin_admin(text, uuid, text) from public, anon;
revoke all on function public.workstation_signins_list(text, int) from public, anon;
revoke all on function public.set_my_lock_minutes(text, int) from public, anon;
grant execute on function public.set_my_pin(text, text), public.remove_my_pin(text), public.my_pin(text), public.workstation_pins_list(text),
  public.workstation_pin_admin(text, uuid, text), public.workstation_signins_list(text, int), public.set_my_lock_minutes(text, int) to authenticated;
revoke all on function public.workstation_people(text) from public, anon, authenticated;
revoke all on function public.workstation_check_pin(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.workstation_people(text), public.workstation_check_pin(text, uuid, text, text) to service_role;

commit;
