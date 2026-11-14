-- Our Faithful Church App: shared database for many churches (Supabase / Postgres). Version 8.
-- Run this once in the Supabase SQL editor on a new project (see SETUP.md).
--
-- How it fits the app: the app keeps one list per kind of thing (sermons, events, prayers, gifts...). Each item is a
-- row in `records` with its kind, church, location and owner, and the item itself in `data`. Churches, roles,
-- locations, memberships and people have their own tables because security depends on them.
-- Row-level security decides what each person can read and write, using their role's permissions at each church.

create extension if not exists pgcrypto;

-- ---------- People ----------
create table profiles (            -- what fellow members see: a name
  id uuid primary key references auth.users on delete cascade,
  name text not null default '', household text,
  updated_at timestamptz not null default now()
);
create table contacts (            -- email and phone, shown in the directory to members when the person is listed
  user_id uuid primary key references auth.users on delete cascade,
  email text, phone text
);
create table families (            -- kids and authorized pickups: for check-in staff and teachers
  user_id uuid primary key references auth.users on delete cascade,
  family jsonb not null default '[]', pickups jsonb not null default '[]'
);
create table profile_private (      -- settings, notes, saved sermons, plan progress: only the person
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'
);

-- ---------- Church accounts ----------
create table churches (
  id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  handle text unique not null,                     -- the church ID people search for
  name text not null,
  owner_id uuid not null references auth.users,     -- the primary account holder
  data jsonb not null default '{}',                 -- contact details, banner, landing page, features, defaults, funds, teams...
  created_at timestamptz not null default now()
);
create table roles (
  church_id text references churches on delete cascade,
  key text not null, name text not null,
  rank int not null check (rank between 1 and 99),
  perms jsonb not null default '{}',                -- { "use.prayer": true, "build.sermons": false, ... }
  builtin boolean not null default false,
  primary key (church_id, key)
);
create table locations (
  id text primary key,
  church_id text not null references churches on delete cascade,
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  data jsonb not null default '{}'                  -- name, code, address, rooms, service times, livestream
);
create table memberships (
  church_id text references churches on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role_key text not null,
  locations jsonb not null default '[]',            -- "all", or the private location IDs this person can see
  listed boolean not null default false,            -- shown in the member directory
  joined timestamptz not null default now(),
  primary key (church_id, user_id)
);

-- ---------- Everything else ----------
create table records (
  kind text not null,                               -- sermons, events, prayers, gifts, checkins, ...
  id text not null,
  church_id text not null references churches on delete cascade,
  location_id text,
  owner text,                                       -- the person it belongs to (their user ID), if any
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (kind, id)
);
create index records_church_kind on records (church_id, kind);
create index records_owner on records (owner) where owner is not null;
create index records_parent on records ((data->>'_parent')) where kind in ('event_regs', 'gathering_regs', 'assignments');

-- Server-only tables (no policies, so only the service role used by server functions can reach them).
create table push_subscriptions (endpoint text primary key, user_id uuid not null references auth.users on delete cascade, keys jsonb not null, created_at timestamptz not null default now());
create table payments (id text primary key, church_id text references churches on delete set null, kind text, ref text, user_id uuid, amount numeric(12, 2), status text, data jsonb, created_at timestamptz not null default now());
create table ai_usage (user_id uuid, day date, n int not null default 0, primary key (user_id, day));
-- A checkout someone started with the church's payment processor: what it's for and how much, so the payment is
-- recorded from these details rather than from anything the browser sends back.
create table checkouts (id text primary key, church_id text not null references churches on delete cascade, provider text not null, provider_ref text,
  user_id uuid, kind text, ref text, amount numeric(12, 2), meta jsonb not null default '{}', status text not null default 'open', created_at timestamptz not null default now());
create index checkouts_provider_ref on checkouts (provider, provider_ref);
-- Each church's payment processor keys (Stripe, PayPal, Square), encrypted in Supabase Vault. Only server functions read them.
create table payment_keys (church_id text not null references churches on delete cascade, provider text not null, secret_id uuid not null,
  updated_at timestamptz not null default now(), primary key (church_id, provider));

create or replace function touch() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
create trigger records_touch before update on records for each row execute function touch();

-- ---------- Permission helpers used by every policy ----------
create or replace function uid_text() returns text language sql stable set search_path = public as $$ select auth.uid()::text $$;
create or replace function is_primary(c text) returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from churches where id = c and owner_id = auth.uid()) $$;
create or replace function is_member(c text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or exists (select 1 from memberships where church_id = c and user_id = auth.uid()) $$;
create or replace function my_rank(c text) returns int language sql stable security definer set search_path = public as
  $$ select case when is_primary(c) then 100 else coalesce((select r.rank from memberships m join roles r on r.church_id = m.church_id and r.key = m.role_key where m.church_id = c and m.user_id = auth.uid()), 0) end $$;
-- Signed-in church devices (kiosks, screens, the booth) have a membership with role_key 'device:<type>' instead of a role.
-- A room display also reads bookings and presentations in rooms ('rooms.view', a permission only devices have).
create or replace function device_perms(t text) returns text[] language sql immutable set search_path = public as $$
  select case t when 'kiosk' then array['checkin.station', 'use.checkin'] when 'display' then array['present'] when 'room' then array['present', 'rooms.view']
    when 'stage' then array['present'] when 'overlay' then array['present'] when 'booth' then array['present'] else array[]::text[] end $$;
create or replace function can(c text, perm text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or exists (select 1 from memberships m join roles r on r.church_id = m.church_id and r.key = m.role_key
       where m.church_id = c and m.user_id = auth.uid() and coalesce((r.perms->>perm)::boolean, false))
     or exists (select 1 from memberships m where m.church_id = c and m.user_id = auth.uid() and m.role_key like 'device:%' and perm = any(device_perms(substr(m.role_key, 8)))) $$;
-- Church-wide items (no location) and public locations are visible to all; private locations need access.
create or replace function sees_location(c text, loc text) returns boolean language sql stable security definer set search_path = public as
  $$ select loc is null or is_primary(c) or exists (select 1 from locations l where l.id = loc and l.visibility = 'public')
       or exists (select 1 from memberships m where m.church_id = c and m.user_id = auth.uid() and (m.locations = '"all"'::jsonb or m.locations ? loc)) $$;
create or replace function leads(gathering text) returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from records g where g.kind = 'gatherings' and g.id = gathering and g.data->'leaders' ? auth.uid()::text) $$;
-- Chats: leaders-<church>, g-<group> (members and leaders), p-<class> (parents and teachers), or a direct message channel.
create or replace function in_channel(c text, ch text) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when ch like 'leaders-%' then can(c, 'chat.leaders')
    when ch like 'g-%' then leads(substr(ch, 3)) or exists (select 1 from records r where r.kind = 'gathering_regs' and r.data->>'_parent' = substr(ch, 3) and r.owner = auth.uid()::text and r.data->>'status' = 'in')
    when ch like 'p-%' then leads(substr(ch, 3)) or exists (select 1 from records r where r.kind = 'gathering_regs' and r.data->>'_parent' = substr(ch, 3) and r.owner = auth.uid()::text and r.data->>'childId' is not null)
    else exists (select 1 from records x where x.kind = 'channels' and x.id = ch and x.data->'members' ? auth.uid()::text) end $$;
-- Do two people share a church where the viewer has one of these permissions (or the person is listed)?
create or replace function shares_church(person uuid, perms text[], or_listed boolean) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.user_id = person and is_member(m.church_id)
    and ((or_listed and m.listed) or exists (select 1 from unnest(perms) p where can(m.church_id, p)))) $$;

-- Volunteers the church lets join a team without waiting: everyone, or chosen people (Admin, Approvals).
create or replace function volunteer_preapproved(c text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case ch.data->'approvals'->'volunteers'->>'pre' when 'all' then true
      when 'some' then coalesce(ch.data->'approvals'->'volunteers'->'people', '[]'::jsonb) ? auth.uid()::text else false end
    from churches ch where ch.id = c), false) $$;

-- Who can read each kind of record.
create or replace function rec_read(k text, c text, loc text, own text, d jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when own is not null and own = auth.uid()::text then true
    when is_primary(c) then true
    when k in ('sermons', 'events', 'news', 'plans', 'gatherings', 'forms', 'outlines') then sees_location(c, loc)
    when k = 'prayers' then can(c, 'manage.prayer') or (is_member(c) and not coalesce((d->>'private')::boolean, false) and not coalesce((d->>'hidden')::boolean, false))
    when k = 'docs' then can(c, 'present') or (d->>'kind' = 'sermon' and can(c, 'build.sermons')) or can(c, 'manage.classes') or (d->>'gatheringId' is not null and leads(d->>'gatheringId'))
    when k in ('songs', 'library', 'services') then can(c, 'services.plan') or can(c, 'present') or can(c, 'schedule.teams')
    when k in ('layouts', 'savedBlocks') then can(c, 'services.plan') or can(c, 'build.sermons') or can(c, 'build.lessons') or can(c, 'build.studies')
    when k = 'assignments' then can(c, 'schedule.teams') or can(c, 'services.plan')
    when k = 'teamMembers' then is_member(c)
    when k = 'blockouts' then can(c, 'schedule.teams')
    when k = 'event_regs' then can(c, 'manage.content')
    when k = 'gathering_regs' then can(c, 'manage.classes') or leads(d->>'_parent')
    when k in ('gifts', 'recurring') then can(c, 'view.giving')
    when k = 'cards' then can(c, 'manage.prayer') or can(c, 'manage.followup')
    when k = 'followups' then can(c, 'manage.followup')
    when k in ('checkins', 'serving') then can(c, 'checkin.station') and sees_location(c, loc)
    when k = 'guests' then can(c, 'checkin.station') or can(c, 'manage.followup')
    when k = 'attendance' then can(c, 'view.reports')
    when k = 'formResponses' then can(c, 'manage.content') or exists (select 1 from records f where f.kind = 'forms' and f.id = d->>'formId' and f.data->>'notify' = auth.uid()::text)
    when k = 'bookings' then can(c, 'book.rooms') or can(c, 'manage.locations') or can(c, 'rooms.view')
    -- Someone presenting in a room: the presenter (as owner, above), the room displays and the people who manage screens.
    when k = 'roomSessions' then can(c, 'rooms.view') or can(c, 'manage.devices')
    when k = 'channels' then d->'members' ? auth.uid()::text
    when k = 'messages' then in_channel(c, d->>'channelId')
    when k in ('deliveries', 'integrations') then can(c, 'manage.integrations')
    when k = 'devices' then can(c, 'manage.devices')
    when k = 'signage' then is_member(c)
    else false end $$;
-- Who can add, change or remove each kind of record. op is 'insert', 'update' or 'delete'.
create or replace function rec_write(k text, c text, own text, d jsonb, op text) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when is_primary(c) then true
    when k in ('sermons', 'plans') then can(c, 'manage.sermons')
    when k in ('events', 'news', 'forms') then can(c, 'manage.content')
    when k = 'gatherings' then can(c, 'manage.classes') or (d->'leaders' ? auth.uid()::text and (can(c, 'lead.groups') or can(c, 'teach.classes')))
    when k = 'prayers' then (own = auth.uid()::text and can(c, 'use.prayer')) or can(c, 'manage.prayer') or (op = 'update' and is_member(c))
    when k in ('docs', 'outlines') then (own = auth.uid()::text and (can(c, 'build.sermons') or can(c, 'build.lessons') or can(c, 'build.studies'))) or (d->>'kind' = 'sermon' and can(c, 'build.sermons')) or (k = 'docs' and can(c, 'manage.classes'))
    when k in ('songs', 'library', 'services') then can(c, 'services.plan')
    when k in ('layouts', 'savedBlocks') then can(c, 'services.plan') or can(c, 'build.sermons') or can(c, 'build.lessons') or can(c, 'build.studies')
    when k = 'assignments' then can(c, 'schedule.teams') or (op = 'update' and own = auth.uid()::text)
    -- Joining a volunteer team yourself is a request until a scheduler approves it, unless the church pre-approved you.
    when k = 'teamMembers' then can(c, 'schedule.teams') or (own = auth.uid()::text and is_member(c) and (op = 'delete' or d->>'status' = 'requested' or volunteer_preapproved(c)))
    when k = 'blockouts' then own = auth.uid()::text or can(c, 'schedule.teams')
    when k = 'event_regs' then (own = auth.uid()::text and is_member(c)) or can(c, 'manage.content')
    -- Joining a class or group whose leader approves each request: your own sign-up has to wait as a request.
    when k = 'gathering_regs' then (own = auth.uid()::text and is_member(c) and (op = 'delete' or d->>'status' = 'requested'
        or not exists (select 1 from records g where g.kind = 'gatherings' and g.id = d->>'_parent' and g.data->>'registration' = 'approval')))
      or can(c, 'manage.classes') or leads(d->>'_parent')
    -- Real gifts and recurring gifts are written by the payment webhook; people can only record test gifts themselves.
    when k = 'gifts' then own = auth.uid()::text and d->>'status' = 'test' and op = 'insert'
    when k = 'recurring' then own = auth.uid()::text and (op = 'update' or coalesce((d->>'test')::boolean, false))
    when k = 'cards' then (own = auth.uid()::text and op = 'insert') or can(c, 'manage.prayer') or can(c, 'manage.followup')
    when k = 'followups' then can(c, 'manage.followup') or (op = 'insert' and is_member(c) and d->>'source' in ('card', 'joined', 'kiosk'))
    when k = 'checkins' then (own = auth.uid()::text and can(c, 'use.checkin')) or can(c, 'checkin.station')
    when k = 'serving' then own = auth.uid()::text and is_member(c)
    when k = 'guests' then can(c, 'checkin.station')
    when k = 'attendance' then can(c, 'view.reports') or can(c, 'checkin.station')
    when k = 'formResponses' then (own = auth.uid()::text and op <> 'update') or can(c, 'manage.content')
    when k = 'bookings' then (own = auth.uid()::text and can(c, 'book.rooms') and (op = 'delete' or d->>'status' = 'requested')) or can(c, 'manage.locations')
    -- Presenting in a room is always in your own name. Room displays check the time (a booking or a class you lead, or
    -- present.rooms); here only people who could have a room can start one. Screen managers can clear any.
    when k = 'roomSessions' then (own = auth.uid()::text and d->>'by' = own and is_member(c) and (op = 'delete' or can(c, 'present.rooms')
        or can(c, 'book.rooms') or can(c, 'teach.classes') or can(c, 'lead.groups')
        or exists (select 1 from records g where g.kind = 'gatherings' and g.church_id = c and g.data->'leaders' ? auth.uid()::text)))
      or (op = 'delete' and (can(c, 'manage.devices') or can(c, 'present.rooms')))
    when k = 'channels' then d->'members' ? auth.uid()::text and can(c, 'use.chat')
    when k = 'messages' then own = auth.uid()::text and in_channel(c, d->>'channelId')
    when k = 'notifications' then (op = 'insert' and is_member(c)) or own = auth.uid()::text
    when k = 'deliveries' then (op = 'insert' and is_member(c) and d->>'status' = 'queued') or can(c, 'manage.integrations')
    when k = 'integrations' then can(c, 'manage.integrations')
    -- Devices are paired and removed by the device-pair function; a paired device can only update when it was last seen.
    when k = 'devices' then can(c, 'manage.devices') or (op = 'update' and own = auth.uid()::text)
    when k = 'signage' then can(c, 'manage.devices')
    else false end $$;

-- Sign-up counts everyone can see, without seeing who signed up.
create or replace function child_counts(churches text[]) returns table (kind text, parent text, n bigint) language sql stable security definer set search_path = public as $$
  select 'events', data->>'_parent', sum(coalesce((data->>'count')::int, 1))::bigint from records where kind = 'event_regs' and church_id = any(churches) group by 2
  union all
  select 'gatherings', data->>'_parent', count(*) from records where kind = 'gathering_regs' and church_id = any(churches) and data->>'status' = 'in' group by 2 $$;

-- ---------- Row-level security ----------
do $$ declare t text; begin
  foreach t in array array['profiles', 'contacts', 'families', 'profile_private', 'churches', 'roles', 'locations', 'memberships', 'records', 'push_subscriptions', 'payments', 'ai_usage', 'checkouts', 'payment_keys'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "fellow members see names" on profiles for select using (shares_church(id, array['use.prayer'], true) or exists (select 1 from memberships a join memberships b on a.church_id = b.church_id where a.user_id = profiles.id and b.user_id = auth.uid()));
create policy "own contact" on contacts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "directory and staff see contacts" on contacts for select using (shares_church(user_id, array['manage.people', 'checkin.station', 'manage.followup', 'schedule.teams'], true));
create policy "own family" on families for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "staff see families" on families for select using (shares_church(user_id, array['checkin.station', 'manage.classes', 'teach.classes', 'manage.followup'], false));
create policy "own private data" on profile_private for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push subscriptions" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Church accounts: anyone can find one; you create it as its primary account holder.
create policy "find churches" on churches for select using (true);
create policy "register church" on churches for insert with check (owner_id = auth.uid());
create policy "edit church" on churches for update using (is_member(id));
create policy "delete church" on churches for delete using (is_primary(id));
-- Each part of a church's settings needs the permission for that part. Payment processor status is set by the server only.
create or replace function guard_church() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; need text;
begin
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
    if new.data->k is distinct from old.data->k then
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
create trigger churches_guard before insert or update on churches for each row execute function guard_church();

-- Roles: you only change roles below your own; only the primary changes Administrator.
create policy "read roles" on roles for select using (is_member(church_id));
create policy "manage roles" on roles for all using (can(church_id, 'manage.roles') and rank < my_rank(church_id)) with check (can(church_id, 'manage.roles') and rank < my_rank(church_id));

create policy "read locations" on locations for select using (sees_location(church_id, id));
create policy "manage locations" on locations for all using (can(church_id, 'manage.locations')) with check (can(church_id, 'manage.locations'));

-- Memberships: join yourself with the church's default role; give roles only below your own.
create policy "see memberships" on memberships for select using (user_id = auth.uid() or is_member(church_id));
create policy "join" on memberships for insert with check (user_id = auth.uid() and (is_primary(church_id)
  or (role_key = (select coalesce(data->'defaults'->>'roleId', 'member') from churches where id = church_id)
      and locations = (select coalesce(data->'defaults'->'locations', '[]'::jsonb) from churches where id = church_id))));
create policy "change membership" on memberships for update using (user_id = auth.uid() or can(church_id, 'manage.people') or can(church_id, 'manage.roles'));
create policy "leave or remove" on memberships for delete using (user_id = auth.uid() or can(church_id, 'manage.people'));
create or replace function guard_membership() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.role_key is distinct from old.role_key or new.locations is distinct from old.locations then
    if not can(old.church_id, 'manage.roles') then raise exception 'Your role cannot change roles or location access'; end if;
    if new.role_key like 'device:%' or old.role_key like 'device:%' then raise exception 'Devices are managed under Screens and devices'; end if;
    if not is_primary(old.church_id) and (coalesce((select rank from roles where church_id = old.church_id and key = new.role_key), 0) >= my_rank(old.church_id)
      or coalesce((select rank from roles where church_id = old.church_id and key = old.role_key), 0) >= my_rank(old.church_id)) then
      raise exception 'You can only give roles below your own'; end if;
  end if;
  return new;
end $$;
create trigger memberships_guard before update on memberships for each row execute function guard_membership();

-- Members can mark "I prayed" on someone else's request, and nothing more. A device can only say it's still on.
create or replace function guard_records() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.kind = 'devices' then
    if can(old.church_id, 'manage.devices') then return new; end if;
    if (new.data - 'lastSeen') is distinct from (old.data - 'lastSeen') or new.owner is distinct from old.owner or new.church_id is distinct from old.church_id
    then raise exception 'A device can only update when it was last seen'; end if;
    return new;
  end if;
  if new.kind <> 'prayers' or old.owner = auth.uid()::text or can(old.church_id, 'manage.prayer') then return new; end if;
  if (new.data - 'prayedBy') is distinct from (old.data - 'prayedBy')
     or exists (select 1 from jsonb_array_elements_text(coalesce(new.data->'prayedBy', '[]')) x where x <> auth.uid()::text and not (coalesce(old.data->'prayedBy', '[]') ? x))
     or exists (select 1 from jsonb_array_elements_text(coalesce(old.data->'prayedBy', '[]')) x where x <> auth.uid()::text and not (coalesce(new.data->'prayedBy', '[]') ? x))
  then raise exception 'You can only add or remove your own prayer'; end if;
  return new;
end $$;
create trigger records_guard before update on records for each row execute function guard_records();

create policy "read records" on records for select using (rec_read(kind, church_id, location_id, owner, data));
create policy "add records" on records for insert with check (rec_write(kind, church_id, owner, data, 'insert'));
create policy "change records" on records for update using (rec_write(kind, church_id, owner, data, 'update')) with check (rec_write(kind, church_id, owner, data, 'update'));
create policy "remove records" on records for delete using (rec_write(kind, church_id, owner, data, 'delete'));

-- ---------- Files ----------
-- Public bucket for logos, banners, sermon audio and video. Files go under the church's ID; staff upload.
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
create policy "staff upload media" on storage.objects for insert with check (bucket_id = 'media' and (can((storage.foldername(name))[1], 'manage.sermons') or can((storage.foldername(name))[1], 'manage.page') or can((storage.foldername(name))[1], 'manage.content')));
create policy "staff change media" on storage.objects for update using (bucket_id = 'media' and (can((storage.foldername(name))[1], 'manage.sermons') or can((storage.foldername(name))[1], 'manage.page')));
create policy "staff remove media" on storage.objects for delete using (bucket_id = 'media' and (can((storage.foldername(name))[1], 'manage.sermons') or can((storage.foldername(name))[1], 'manage.page')));

-- ---------- Payment processor keys ----------
-- Server functions save and read each church's keys through these; the keys themselves live encrypted in Vault.
create or replace function payment_key_set(c text, p text, s text) returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if exists (select 1 from churches where id = c and data ? 'training') then raise exception 'A training church can''t connect a payment processor'; end if;
  select secret_id into sid from payment_keys where church_id = c and provider = p;
  if sid is null then
    sid := vault.create_secret(s, 'payments/' || c || '/' || p || '/' || gen_random_uuid(), 'Payment processor keys');
    insert into payment_keys (church_id, provider, secret_id) values (c, p, sid);
  else
    perform vault.update_secret(sid, s);
    update payment_keys set updated_at = now() where church_id = c and provider = p;
  end if;
end $$;
create or replace function payment_key_get(c text, p text) returns text language sql stable security definer set search_path = public as $$
  select d.decrypted_secret from payment_keys k join vault.decrypted_secrets d on d.id = k.secret_id where k.church_id = c and k.provider = p $$;
-- Removing a church's keys (or the church) removes the encrypted copy too.
create or replace function payment_key_forget() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from vault.secrets where id = old.secret_id; return old; end $$;
create trigger payment_keys_forget after delete on payment_keys for each row execute function payment_key_forget();

-- ---------- Shared training churches ----------
-- A training church (data.training set when it's created) is a practice copy a team shares. Its managers can clear
-- everything in it and start fresh; the app then fills it with sample content or a copy of the real church's setup.
create or replace function reset_training_church(c text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from churches where id = c and data ? 'training') then raise exception 'Only a training church can be reset'; end if;
  if not can(c, 'manage.church') then raise exception 'Ask an administrator of the training church to reset it'; end if;
  delete from records where church_id = c;
  delete from checkouts where church_id = c;
  delete from payments where church_id = c;
end $$;

-- ---------- Live updates ----------
alter publication supabase_realtime add table records;

-- ---------- What the app's API roles may touch ----------
-- Newer Supabase projects no longer hand new tables to the API automatically, so say it here. These grants only open
-- the door: the row-level security rules above still decide which rows each person can see or change.
grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;   -- the permission helpers run inside the rules
revoke execute on function guard_church(), guard_membership(), guard_records(), touch() from public, anon, authenticated;   -- triggers only
-- Payment keys: server functions only.
revoke all on checkouts, payment_keys from anon, authenticated;
revoke execute on function payment_key_set(text, text, text), payment_key_get(text, text), payment_key_forget() from public, anon, authenticated;
revoke execute on function reset_training_church(text) from public, anon;
grant execute on function reset_training_church(text) to authenticated;
