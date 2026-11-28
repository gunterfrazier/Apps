-- Version 32: Game night. A host opens a room and gets a 4-letter code; players join from their phones with the code
-- and a name, with no account. The game runs on a private Realtime channel, game:<room>:
--   the host (or anyone at the church who can host games) hears it and sends the questions (event "state");
--   players who joined with the code hear it and send their answers (events "hello" and "answer").
-- Players without an account join with Supabase's anonymous sign-in, which must be turned on in the dashboard:
-- Authentication, Sign In / Providers, "Allow anonymous sign-ins". Anonymous visitors can do nothing else in the app:
-- they belong to no church, so every other rule turns them away.
-- Rooms close after 6 hours, or when the host ends the night.
-- Run after upgrade-31.sql. New projects get the same from schema.sql.
begin;

create table if not exists public.game_rooms (
  id text primary key,                                   -- the channel is game:<id>
  church_id text not null references churches on delete cascade,
  code text not null,                                    -- the 4 letters players type
  host uuid not null references auth.users on delete cascade,
  title text not null default '',
  until timestamptz not null default now() + interval '6 hours'
);
create unique index if not exists game_rooms_code on public.game_rooms (code);
create table if not exists public.game_players (
  room_id text not null references public.game_rooms on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  joined timestamptz not null default now(),
  primary key (room_id, user_id)
);
-- No policies: these are reached only through the functions below.
alter table public.game_rooms enable row level security;
alter table public.game_players enable row level security;

-- May the signed-in person host games at this church?
create or replace function public.can_host_games(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select can(c, 'host.games') or can(c, 'manage.church')
$$;

-- Opens a room with a new code. Codes use consonants only, so they never spell a word.
create or replace function public.game_open(c text, room_title text default '') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  letters constant text := 'BCDFGHJKLMNPQRSTVWXZ';
  v_code text;
  v_room text := replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null or not can_host_games(c) then raise exception 'You can''t host games at this church.'; end if;
  delete from game_rooms where until < now();
  loop
    v_code := '';
    for i in 1..4 loop v_code := v_code || substr(letters, 1 + floor(random() * 20)::int, 1); end loop;
    exit when not exists (select 1 from game_rooms g where g.code = v_code);
  end loop;
  insert into game_rooms (id, church_id, code, host, title) values (v_room, c, v_code, auth.uid(), left(coalesce(room_title, ''), 80));
  return jsonb_build_object('room', v_room, 'code', v_code);
end $$;

-- Ends a room: its channel goes quiet for everyone.
create or replace function public.game_close(p_room text) returns void
language sql volatile security definer set search_path = public as $$
  update game_rooms set until = now() where id = p_room and (host = auth.uid() or can_host_games(church_id))
$$;

-- Joins a room by its code. Works for anonymous visitors. Returns the room, its title and the church's name.
create or replace function public.game_join(p_code text, p_name text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  r game_rooms;
  v_name text := left(btrim(coalesce(p_name, '')), 24);
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if v_name = '' then raise exception 'Type your name.'; end if;
  select * into r from game_rooms where code = upper(btrim(coalesce(p_code, ''))) and until > now();
  if r.id is null then raise exception 'No game with that code is open. Check the code on the screen.'; end if;
  if (select count(*) from game_players where room_id = r.id) >= 100
     and not exists (select 1 from game_players where room_id = r.id and user_id = auth.uid()) then
    raise exception 'This game is full.';
  end if;
  insert into game_players (room_id, user_id, name) values (r.id, auth.uid(), v_name)
    on conflict (room_id, user_id) do update set name = excluded.name;
  return jsonb_build_object('room', r.id, 'title', r.title, 'church', (select name from churches where id = r.church_id));
end $$;

-- The Realtime rules for game:<room>.
create or replace function public.can_hear_game(topic text) returns boolean
language sql stable security definer set search_path = public as $$
  select topic ~ '^game:[a-z0-9]+$' and exists (select 1 from game_rooms g where g.id = split_part(topic, ':', 2) and g.until > now()
    and (g.host = auth.uid() or can_host_games(g.church_id)
      or exists (select 1 from game_players p where p.room_id = g.id and p.user_id = auth.uid())))
$$;
create or replace function public.can_send_game(topic text, ev text) returns boolean
language sql stable security definer set search_path = public as $$
  select topic ~ '^game:[a-z0-9]+$' and exists (select 1 from game_rooms g where g.id = split_part(topic, ':', 2) and g.until > now()
    and case
      when ev = 'state' then g.host = auth.uid() or can_host_games(g.church_id)
      when ev in ('hello', 'answer') then g.host = auth.uid() or can_host_games(g.church_id)
        or exists (select 1 from game_players p where p.room_id = g.id and p.user_id = auth.uid())
      else false end)
$$;

revoke execute on function public.can_host_games(text), public.game_open(text, text), public.game_close(text), public.game_join(text, text),
  public.can_hear_game(text), public.can_send_game(text, text) from public, anon;
grant execute on function public.can_host_games(text), public.game_open(text, text), public.game_close(text), public.game_join(text, text),
  public.can_hear_game(text), public.can_send_game(text, text) to authenticated;

drop policy if exists "game channels are heard by hosts and players" on realtime.messages;
create policy "game channels are heard by hosts and players" on realtime.messages for select to authenticated using (
  extension = 'broadcast' and public.can_hear_game(coalesce(realtime.topic(), topic))
);
drop policy if exists "game channels are sent by hosts and players" on realtime.messages;
create policy "game channels are sent by hosts and players" on realtime.messages for insert to authenticated with check (
  extension = 'broadcast' and public.can_send_game(coalesce(realtime.topic(), topic), event)
);

commit;
