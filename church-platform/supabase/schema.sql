-- Our Faithful Church App: shared database for many churches (Supabase / Postgres). Version 10.
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
create index records_regid on records ((data->>'regId')) where kind = 'ticketPayments';

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

-- What's left behind once a church's data is gone: enough to email its primary account holder and clear its uploaded files.
create table purged_churches (id text primary key, name text not null, owner_id uuid, deactivated_at timestamptz,
  purged_at timestamptz not null default now(), emailed boolean not null default false, files_removed boolean not null default false);
-- One-time passes that let the hourly schedule call the church-lifecycle server function.
create table cron_calls (token uuid primary key, at timestamptz not null default now());
-- Which emails about a deactivation have gone out, so each is sent once.
create table lifecycle_emails (church_id text not null, key text not null, note text not null default '', at timestamptz not null default now(), primary key (church_id, key));

create or replace function touch() returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
create trigger records_touch before update on records for each row execute function touch();

-- ---------- Permission helpers used by every policy ----------
create or replace function uid_text() returns text language sql stable set search_path = public as $$ select auth.uid()::text $$;
create or replace function is_primary(c text) returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from churches where id = c and owner_id = auth.uid()) $$;
-- Is the church's account open? False once it's deactivated (see "Deactivating a church account" below). A training church goes quiet with the church it belongs to.
create or replace function church_live(c text) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from churches ch where ch.id = c and (ch.data->'deactivation'->>'status' = 'deactivated'
    or exists (select 1 from churches p where p.id = ch.data->'training'->>'of' and p.data->'deactivation'->>'status' = 'deactivated'))) $$;

-- The permission helpers: nobody but the primary account holder is a member of, or can do anything at, a deactivated church.
create or replace function is_member(c text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or (church_live(c) and exists (select 1 from memberships where church_id = c and user_id = auth.uid())) $$;
create or replace function my_rank(c text) returns int language sql stable security definer set search_path = public as
  $$ select case when is_primary(c) then 100 when not church_live(c) then 0 else coalesce((select r.rank from memberships m join roles r on r.church_id = m.church_id and r.key = m.role_key where m.church_id = c and m.user_id = auth.uid()), 0) end $$;
-- Signed-in church devices (kiosks, screens, the booth) have a membership with role_key 'device:<type>' instead of a role.
-- A room display also reads bookings and presentations in rooms ('rooms.view', a permission only devices have).
create or replace function device_perms(t text) returns text[] language sql immutable set search_path = public as $$
  select case t when 'kiosk' then array['checkin.station', 'use.checkin'] when 'display' then array['present'] when 'room' then array['present', 'rooms.view']
    when 'stage' then array['present'] when 'overlay' then array['present'] when 'booth' then array['present'] else array[]::text[] end $$;
create or replace function can(c text, perm text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or (church_live(c) and (exists (select 1 from memberships m join roles r on r.church_id = m.church_id and r.key = m.role_key
       where m.church_id = c and m.user_id = auth.uid() and coalesce((r.perms->>perm)::boolean, false))
     or exists (select 1 from memberships m where m.church_id = c and m.user_id = auth.uid() and m.role_key like 'device:%' and perm = any(device_perms(substr(m.role_key, 8)))))) $$;
-- Church-wide items (no location) and public locations are visible to all; private locations need access.
create or replace function sees_location(c text, loc text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or (church_live(c) and (loc is null or exists (select 1 from locations l where l.id = loc and l.visibility = 'public')
       or exists (select 1 from memberships m where m.church_id = c and m.user_id = auth.uid() and (m.locations = '"all"'::jsonb or m.locations ? loc)))) $$;
-- Is the signed-in person named on this event to take its payments?
create or replace function collects(event text) returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from records e where e.kind = 'events' and e.id = event and e.data->'collectors' ? auth.uid()::text) $$;
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
    -- Sign-ups: the people who run events, take ticket payments or read reports, and the people an event names to take its payments.
    when k = 'event_regs' then can(c, 'manage.content') or can(c, 'take.payments') or can(c, 'view.reports') or collects(d->>'_parent')
    -- Ticket payments: the payer (as owner, above), and the same people.
    when k = 'ticketPayments' then can(c, 'manage.content') or can(c, 'take.payments') or can(c, 'view.reports') or can(c, 'view.giving') or collects(d->>'eventId')
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
    -- Who was here: the person (as owner, above), and the people who take attendance or read reports.
    when k = 'presence' then can(c, 'view.reports') or can(c, 'checkin.station')
    -- Birthdays and milestones: the person, and the pastors and staff who care for people.
    when k = 'milestones' then can(c, 'manage.people') or can(c, 'manage.followup')
    when k = 'campaigns' then is_member(c)
    when k = 'pledges' then can(c, 'view.giving')
    when k = 'activity' then can(c, 'manage.church')
    -- Custom reports and the copies they make: people who read reports. One with giving in it needs the giving permission too.
    when k in ('customReports', 'reportRuns') then (can(c, 'view.reports') or can(c, 'view.giving')) and (not coalesce((d->>'giving')::boolean, false) or can(c, 'view.giving'))
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
    when k = 'event_regs' then (own = auth.uid()::text and is_member(c)) or can(c, 'manage.content') or can(c, 'take.payments') or collects(d->>'_parent')
    -- Cash and checks are recorded by people who take payments, in their own name unless they manage events. Payments in the
    -- app are written by the payment webhook; people can only record test payments themselves (the preview and practice).
    when k = 'ticketPayments' then (d->>'method' in ('cash', 'check') and (can(c, 'manage.content') or ((can(c, 'take.payments') or collects(d->>'eventId'))
        and (op <> 'insert' or d->>'receivedBy' = auth.uid()::text))))
      or (own = auth.uid()::text and d->>'method' = 'app' and d->>'status' in ('test', 'refunded') and is_member(c))
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
    -- Marking yourself as here is always in your own name; greeters and report readers can mark anyone.
    when k = 'presence' then (own = auth.uid()::text and d->>'userId' = own and d->>'via' = 'self' and is_member(c)) or can(c, 'view.reports') or can(c, 'checkin.station')
    when k = 'milestones' then (own = auth.uid()::text and is_member(c)) or can(c, 'manage.people')
    when k = 'campaigns' then can(c, 'view.giving')
    when k = 'pledges' then (own = auth.uid()::text and is_member(c)) or can(c, 'view.giving')
    -- The activity log is only ever added to, in your own name. (The primary account holder can clear it.)
    when k = 'activity' then op = 'insert' and own = auth.uid()::text and d->>'by' = own and is_member(c)
    when k in ('customReports', 'reportRuns') then (can(c, 'view.reports') or can(c, 'view.giving')) and (not coalesce((d->>'giving')::boolean, false) or can(c, 'view.giving'))
    when k = 'signage' then can(c, 'manage.devices')
    else false end $$;

-- Sign-up counts everyone can see, without seeing who signed up.
create or replace function child_counts(churches text[]) returns table (kind text, parent text, n bigint) language sql stable security definer set search_path = public as $$
  select 'events', data->>'_parent', sum(coalesce((data->>'count')::int, 1))::bigint from records where kind = 'event_regs' and church_id = any(churches) and (is_primary(church_id) or church_live(church_id)) group by 2
  union all
  select 'gatherings', data->>'_parent', count(*) from records where kind = 'gathering_regs' and church_id = any(churches) and data->>'status' = 'in' and (is_primary(church_id) or church_live(church_id)) group by 2 $$;

-- ---------- Row-level security ----------
do $$ declare t text; begin
  foreach t in array array['profiles', 'contacts', 'families', 'profile_private', 'churches', 'roles', 'locations', 'memberships', 'records', 'push_subscriptions', 'payments', 'ai_usage', 'checkouts', 'payment_keys', 'purged_churches', 'cron_calls', 'lifecycle_emails'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "fellow members see names" on profiles for select using (shares_church(id, array['use.prayer'], true)
  or exists (select 1 from memberships a join memberships b on a.church_id = b.church_id where a.user_id = profiles.id and b.user_id = auth.uid() and (is_primary(a.church_id) or church_live(a.church_id))));
create policy "own contact" on contacts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "directory and staff see contacts" on contacts for select using (shares_church(user_id, array['manage.people', 'checkin.station', 'manage.followup', 'schedule.teams'], true));
create policy "own family" on families for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "staff see families" on families for select using (shares_church(user_id, array['checkin.station', 'manage.classes', 'teach.classes', 'manage.followup'], false));
create policy "own private data" on profile_private for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own push subscriptions" on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Church accounts: anyone can find one that's active; you create it as its primary account holder.
create policy "find churches" on churches for select using (owner_id = auth.uid() or church_live(id));
create policy "register church" on churches for insert with check (owner_id = auth.uid());
create policy "edit church" on churches for update using (is_member(id));
create policy "delete church" on churches for delete using (is_primary(id));
-- Each part of a church's settings needs the permission for that part. Payment processor status is set by the server only.
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
create trigger churches_guard before insert or update on churches for each row execute function guard_church();

-- Roles: you only change roles below your own; only the primary changes Administrator.
create policy "read roles" on roles for select using (is_member(church_id));
create policy "manage roles" on roles for all using (can(church_id, 'manage.roles') and rank < my_rank(church_id)) with check (can(church_id, 'manage.roles') and rank < my_rank(church_id));

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
create trigger roles_guard before insert or update on roles for each row execute function guard_roles();

create policy "read locations" on locations for select using (sees_location(church_id, id));
create policy "manage locations" on locations for all using (can(church_id, 'manage.locations')) with check (can(church_id, 'manage.locations'));

-- Memberships: join yourself with the church's default role; give roles only below your own.
create policy "see memberships" on memberships for select using (is_primary(church_id) or (church_live(church_id) and (user_id = auth.uid() or is_member(church_id))));
create policy "join" on memberships for insert with check (user_id = auth.uid() and (is_primary(church_id)
  or (church_live(church_id) and role_key = (select coalesce(data->'defaults'->>'roleId', 'member') from churches where id = church_id)
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

-- Records: even your own (a gift, a sign-up) are out of reach while the church is deactivated.
create policy "read records" on records for select using ((is_primary(church_id) or church_live(church_id)) and rec_read(kind, church_id, location_id, owner, data));
create policy "add records" on records for insert with check ((is_primary(church_id) or church_live(church_id)) and rec_write(kind, church_id, owner, data, 'insert'));
create policy "change records" on records for update using ((is_primary(church_id) or church_live(church_id)) and rec_write(kind, church_id, owner, data, 'update'))
  with check ((is_primary(church_id) or church_live(church_id)) and rec_write(kind, church_id, owner, data, 'update'));
create policy "remove records" on records for delete using ((is_primary(church_id) or church_live(church_id)) and rec_write(kind, church_id, owner, data, 'delete'));

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

-- ---------- Deactivating a church account ----------
-- The primary account holder can deactivate the account; someone whose role includes church.deactivate can ask, and
-- the primary decides. A deactivated church is hidden from everyone but its primary (church_live above), who can
-- reactivate it for one year. After that its data is removed for good.
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

-- ---------- Pledge campaigns: the totals every member may see ----------
-- Members see how a campaign is going without seeing anyone's gifts or pledges.
create or replace function campaign_totals(c text) returns table (campaign text, given numeric, pledged numeric, pledges bigint)
language sql stable security definer set search_path = public as $$
  select k.id,
    coalesce((select sum((g.data->>'amount')::numeric) from records g where g.church_id = c and g.kind = 'gifts' and g.data->>'fundId' = k.data->>'fundId'
      and coalesce(g.data->>'status', '') <> 'refunded' and left(g.data->>'at', 10) >= k.data->>'start'
      and (coalesce(k.data->>'end', '') = '' or left(g.data->>'at', 10) <= k.data->>'end')), 0),
    coalesce((select sum((p.data->>'amount')::numeric) from records p where p.church_id = c and p.kind = 'pledges' and p.data->>'campaignId' = k.id), 0),
    (select count(*) from records p where p.church_id = c and p.kind = 'pledges' and p.data->>'campaignId' = k.id)
  from records k where k.church_id = c and k.kind = 'campaigns' and is_member(c) $$;

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
revoke execute on function guard_church(), guard_membership(), guard_records(), guard_roles(), touch() from public, anon, authenticated;   -- triggers only
-- Payment keys: server functions only.
revoke all on checkouts, payment_keys, purged_churches, cron_calls, lifecycle_emails from anon, authenticated;
revoke execute on function payment_key_set(text, text, text), payment_key_get(text, text), payment_key_forget() from public, anon, authenticated;
revoke execute on function reset_training_church(text) from public, anon;
grant execute on function reset_training_church(text) to authenticated;
-- Deactivating: people use church_deactivation(); the clean-up belongs to the server's schedule.
revoke execute on function lifecycle_note(text, uuid, text, text, text, text), purge_church_rows(text, boolean), purge_church(text), church_lifecycle_tick(text) from public, anon, authenticated;
revoke execute on function church_deactivation(text, text, text) from public, anon;
grant execute on function church_deactivation(text, text, text) to authenticated;
revoke execute on function campaign_totals(text) from public, anon;
grant execute on function campaign_totals(text) to authenticated;
