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
create index records_event_checkins on records ((data->>'eventId')) where kind = 'eventCheckins';

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
  select case t when 'kiosk' then array['checkin.station', 'use.checkin', 'checkin.events'] when 'gate' then array['checkin.events'] when 'display' then array['present'] when 'room' then array['present', 'rooms.view']
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
/** Is the signed-in person an approved member of this volunteer team? */
create or replace function on_team(c text, team text) returns boolean language sql stable security definer set search_path = public as $$
  select team is not null and exists (select 1 from records m where m.kind = 'teamMembers' and m.church_id = c and m.owner = auth.uid()::text
    and lower(m.data->>'team') = lower(team) and coalesce(m.data->>'status', 'approved') <> 'requested')
$$;
/** The security team: the Security team permission, church admins, or anyone serving on a security, safety, medical,
 *  first aid, greeter or usher team. Keep in step with isSecurityMember() in src/js/98b-safety.js. */
create or replace function on_security_team(c text) returns boolean language sql stable security definer set search_path = public as $$
  select is_member(c) and (can(c, 'security.team') or can(c, 'manage.church') or exists (select 1 from records a where a.church_id = c and a.kind = 'securityAccessAssignments'
    and a.owner = auth.uid()::text and a.data->>'role' in ('head','supervisor','volunteer')) or exists (select 1 from records m where m.kind = 'teamMembers'
    and m.church_id = c and m.owner = auth.uid()::text and coalesce(m.data->>'status', 'approved') <> 'requested'
    and m.data->>'team' ~* '(security|safety|medical|first.?aid|greeter|usher)'))
$$;

-- Security Command roles. Existing team members keep communication access.
create or replace function security_access(c text, person uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case when ch.owner_id = person or coalesce(r.perms->>'manage.church', 'false') = 'true' or m.role_key = 'admin' then 3
      when m.user_id is not null and a.data->>'role' = 'head' then 3
      when m.user_id is not null and a.data->>'role' = 'supervisor' then 2
      when m.user_id is not null and a.data->>'role' = 'volunteer' then 1
      when person = auth.uid() and on_security_team(c) then 1
      else 0 end
    from churches ch left join memberships m on m.church_id = ch.id and m.user_id = person
    left join roles r on r.church_id = ch.id and r.key = m.role_key
    left join records a on a.church_id = ch.id and a.kind = 'securityAccessAssignments' and a.id = c || ':' || person::text
    where ch.id = c and church_live(c)
  ), 0)
$$;


-- Who can read each kind of record.
create or replace function rec_read(k text, c text, loc text, own text, d jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when k in ('securityProtocolRequests', 'securityAccessAssignments') then is_member(c) and (own = auth.uid()::text or security_access(c, auth.uid()) = 3)
    when own is not null and own = auth.uid()::text then true
    when is_primary(c) then true
    when k in ('sermons', 'events', 'news', 'plans', 'gatherings', 'forms', 'outlines') then sees_location(c, loc)
    when k = 'prayers' then can(c, 'manage.prayer') or (is_member(c) and not coalesce((d->>'private')::boolean, false) and not coalesce((d->>'hidden')::boolean, false))
    when k = 'docs' then can(c, 'present') or (d->>'kind' = 'sermon' and can(c, 'build.sermons')) or can(c, 'manage.classes') or (d->>'gatheringId' is not null and leads(d->>'gatheringId'))
    when k in ('songs', 'library', 'services') then can(c, 'services.plan') or can(c, 'present') or can(c, 'schedule.teams')
    when k in ('layouts', 'savedBlocks') then can(c, 'services.plan') or can(c, 'build.sermons') or can(c, 'build.lessons') or can(c, 'build.studies')
    -- New in 15: teammates see their team's assignments, to claim a sub request or offer a swap.
    when k = 'assignments' then can(c, 'schedule.teams') or can(c, 'services.plan') or on_team(c, d->>'team')
    when k = 'teamMembers' then is_member(c)
    when k = 'blockouts' then can(c, 'schedule.teams')
    when k = 'event_regs' then can(c, 'manage.content') or can(c, 'take.payments') or can(c, 'view.reports') or can(c, 'checkin.events') or collects(d->>'_parent')
    when k = 'eventCheckins' then can(c, 'checkin.events') or can(c, 'manage.content') or can(c, 'view.reports') or can(c, 'take.payments') or collects(d->>'eventId')
    when k = 'ticketPayments' then can(c, 'manage.content') or can(c, 'take.payments') or can(c, 'view.reports') or can(c, 'view.giving') or collects(d->>'eventId')
    when k = 'gathering_regs' then can(c, 'manage.classes') or leads(d->>'_parent')
    when k in ('gifts', 'recurring') then can(c, 'view.giving')
    when k = 'cards' then can(c, 'manage.prayer') or can(c, 'manage.followup')
    when k = 'followups' then can(c, 'manage.followup')
    -- New in 15: schedulers and report readers see who checked in to serve, for the volunteer and staff attendance report.
    when k = 'checkins' then (can(c, 'checkin.station') and sees_location(c, loc))
      or (security_access(c, auth.uid()) >= 2 and d->>'out' is null)
    when k = 'serving' then (can(c, 'checkin.station') or can(c, 'schedule.teams') or can(c, 'view.reports')) and sees_location(c, loc)
    when k = 'guests' then can(c, 'checkin.station') or can(c, 'manage.followup')
    when k = 'attendance' then can(c, 'view.reports')
    when k = 'formResponses' then can(c, 'manage.content') or exists (select 1 from records f where f.kind = 'forms' and f.id = d->>'formId' and f.data->>'notify' = auth.uid()::text)
    when k = 'bookings' then can(c, 'book.rooms') or can(c, 'manage.locations') or can(c, 'rooms.view')
    when k = 'roomSessions' then can(c, 'rooms.view') or can(c, 'manage.devices')
    when k = 'channels' then d->'members' ? auth.uid()::text
    when k = 'messages' then in_channel(c, d->>'channelId')
    when k in ('deliveries', 'integrations') then can(c, 'manage.integrations')
    when k = 'devices' then can(c, 'manage.devices')
    -- New in 15: schedulers see who's here, for the volunteer and staff attendance report.
    when k = 'presence' then can(c, 'view.reports') or can(c, 'checkin.station') or can(c, 'schedule.teams')
    when k = 'milestones' then can(c, 'manage.people') or can(c, 'manage.followup')
    when k = 'campaigns' then is_member(c)
    when k = 'pledges' then can(c, 'view.giving')
    when k = 'activity' then can(c, 'manage.church')
    when k in ('customReports', 'reportRuns') then (can(c, 'view.reports') or can(c, 'view.giving')) and (not coalesce((d->>'giving')::boolean, false) or can(c, 'view.giving'))
    when k = 'signage' then is_member(c)
    -- ----- New in 15 -----
    -- Community boards: members who can see the board's campus. Posts waiting for a moderator: their author and moderators.
    when k = 'boards' then is_member(c) and sees_location(c, loc)
    when k = 'boardPosts' then sees_location(c, loc) and (can(c, 'manage.prayer') or can(c, 'manage.content') or can(c, 'manage.classes') or can(c, 'manage.church')
      or (is_member(c) and coalesce(d->>'status', 'approved') = 'approved'))
    -- Targeted push notifications sent: the people who can send them.
    when k = 'pushCampaigns' then can(c, 'manage.content') or can(c, 'send.email') or can(c, 'send.texts') or can(c, 'schedule.teams')
    -- The treasurer's ledger: people who see giving. (Someone who submitted an expense sees it as its owner, above.)
    when k in ('expenses', 'budgets', 'batches') then can(c, 'view.giving')
    -- Safety: incidents and the security channel are for the security team (and whoever reported, as owner, above).
    when k = 'securityMessages' then security_access(c, auth.uid()) >= 1
    when k = 'securityIncidents' then security_access(c, auth.uid()) >= 2
    when k = 'securityDrills' then security_access(c, auth.uid()) = 3
    -- Roll call and reunification: the security team and the people with children and classes.
    when k = 'securityRollCall' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station') or can(c, 'manage.classes') or can(c, 'teach.classes')
    when k = 'securityReunifications' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station')
    else false end $$;
-- Who can add, change or remove each kind of record. op is 'insert', 'update' or 'delete'.
create or replace function rec_write(k text, c text, own text, d jsonb, op text) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when k in ('securityProtocolRequests', 'securityAccessAssignments') then false
    when is_primary(c) then true
    when k in ('sermons', 'plans') then can(c, 'manage.sermons')
    when k in ('events', 'news', 'forms') then can(c, 'manage.content')
    when k = 'gatherings' then can(c, 'manage.classes') or (d->'leaders' ? auth.uid()::text and (can(c, 'lead.groups') or can(c, 'teach.classes')))
    when k = 'prayers' then (own = auth.uid()::text and can(c, 'use.prayer')) or can(c, 'manage.prayer') or (op = 'update' and is_member(c))
    when k in ('docs', 'outlines') then (own = auth.uid()::text and (can(c, 'build.sermons') or can(c, 'build.lessons') or can(c, 'build.studies'))) or (d->>'kind' = 'sermon' and can(c, 'build.sermons')) or (k = 'docs' and can(c, 'manage.classes'))
    when k in ('songs', 'library', 'services') then can(c, 'services.plan')
    when k in ('layouts', 'savedBlocks') then can(c, 'services.plan') or can(c, 'build.sermons') or can(c, 'build.lessons') or can(c, 'build.studies')
    -- New in 15: teammates on the assignment's team can claim a sub request or swap a shift. guard_records limits what
    -- they change to who serves and their answer.
    when k = 'assignments' then can(c, 'schedule.teams') or (op = 'update' and (own = auth.uid()::text or on_team(c, d->>'team')))
    when k = 'teamMembers' then can(c, 'schedule.teams') or (own = auth.uid()::text and is_member(c) and (op = 'delete' or d->>'status' = 'requested' or volunteer_preapproved(c)))
    when k = 'blockouts' then own = auth.uid()::text or can(c, 'schedule.teams')
    when k = 'event_regs' then (own = auth.uid()::text and is_member(c)) or can(c, 'manage.content') or can(c, 'take.payments') or collects(d->>'_parent')
    when k = 'ticketPayments' then (d->>'method' in ('cash', 'check') and (can(c, 'manage.content') or ((can(c, 'take.payments') or collects(d->>'eventId'))
        and (op <> 'insert' or d->>'receivedBy' = auth.uid()::text))))
      or (own = auth.uid()::text and d->>'method' = 'app' and d->>'status' in ('test', 'refunded') and is_member(c))
    when k = 'eventCheckins' then (op = 'insert' and d->>'by' = auth.uid()::text and (can(c, 'checkin.events') or can(c, 'manage.content') or collects(d->>'eventId'))) or (op = 'delete' and can(c, 'manage.content'))
    when k = 'gathering_regs' then (own = auth.uid()::text and is_member(c) and (op = 'delete' or d->>'status' = 'requested'
        or not exists (select 1 from records g where g.kind = 'gatherings' and g.id = d->>'_parent' and g.data->>'registration' = 'approval')))
      or can(c, 'manage.classes') or leads(d->>'_parent')
    -- New in 15: people who see giving can record gifts by hand and correct or remove the ones recorded by hand (they carry
    -- recordedBy; a change has to keep it, and a new one is in your own name). Gifts the payment processor recorded have no
    -- recordedBy, so they still can't be changed in the app. People can still record test gifts themselves.
    when k = 'gifts' then (own = auth.uid()::text and d->>'status' = 'test' and op = 'insert')
      or (can(c, 'view.giving') and d ? 'recordedBy' and (op <> 'insert' or d->>'recordedBy' = auth.uid()::text))
    when k = 'recurring' then own = auth.uid()::text and (op = 'update' or coalesce((d->>'test')::boolean, false))
    when k = 'cards' then (own = auth.uid()::text and op = 'insert') or can(c, 'manage.prayer') or can(c, 'manage.followup')
    when k = 'followups' then can(c, 'manage.followup') or (op = 'insert' and is_member(c) and d->>'source' in ('card', 'joined', 'kiosk'))
    when k = 'checkins' then (own = auth.uid()::text and can(c, 'use.checkin')) or can(c, 'checkin.station')
    -- New in 15: check-in stations and schedulers can check a volunteer in.
    when k = 'serving' then (own = auth.uid()::text and is_member(c)) or can(c, 'checkin.station') or can(c, 'schedule.teams')
    when k = 'guests' then can(c, 'checkin.station')
    when k = 'attendance' then can(c, 'view.reports') or can(c, 'checkin.station')
    when k = 'formResponses' then (own = auth.uid()::text and op <> 'update') or can(c, 'manage.content')
    when k = 'bookings' then (own = auth.uid()::text and can(c, 'book.rooms') and (op = 'delete' or d->>'status' = 'requested')) or can(c, 'manage.locations')
    when k = 'roomSessions' then (own = auth.uid()::text and d->>'by' = own and is_member(c) and (op = 'delete' or can(c, 'present.rooms')
        or can(c, 'book.rooms') or can(c, 'teach.classes') or can(c, 'lead.groups')
        or exists (select 1 from records g where g.kind = 'gatherings' and g.church_id = c and g.data->'leaders' ? auth.uid()::text)))
      or (op = 'delete' and (can(c, 'manage.devices') or can(c, 'present.rooms')))
    when k = 'channels' then d->'members' ? auth.uid()::text and can(c, 'use.chat')
    when k = 'messages' then own = auth.uid()::text and in_channel(c, d->>'channelId')
    when k = 'notifications' then (op = 'insert' and is_member(c)) or own = auth.uid()::text
    when k = 'deliveries' then (op = 'insert' and is_member(c) and d->>'status' = 'queued') or can(c, 'manage.integrations')
    when k = 'integrations' then can(c, 'manage.integrations')
    when k = 'devices' then can(c, 'manage.devices') or (op = 'update' and own = auth.uid()::text)
    -- New in 15: marking yourself as here can also come from arriving on campus ('geofence'), always in your own name.
    when k = 'presence' then (own = auth.uid()::text and d->>'userId' = own and d->>'via' in ('self', 'geofence', 'geofence-test') and is_member(c)) or can(c, 'view.reports') or can(c, 'checkin.station')
    when k = 'milestones' then (own = auth.uid()::text and is_member(c)) or can(c, 'manage.people')
    when k = 'campaigns' then can(c, 'view.giving')
    when k = 'pledges' then (own = auth.uid()::text and is_member(c)) or can(c, 'view.giving')
    when k = 'activity' then op = 'insert' and own = auth.uid()::text and d->>'by' = own and is_member(c)
    when k in ('customReports', 'reportRuns') then (can(c, 'view.reports') or can(c, 'view.giving')) and (not coalesce((d->>'giving')::boolean, false) or can(c, 'view.giving'))
    when k = 'signage' then can(c, 'manage.devices')
    -- ----- New in 15 -----
    when k = 'boards' then can(c, 'manage.prayer') or can(c, 'manage.content') or can(c, 'manage.classes') or can(c, 'manage.church')
    -- Board posts: members post in their own name and remove their own; everyone can react, reply, sign up and vote
    -- (guard_records keeps the rest of someone else's post as it was); moderators manage all.
    when k = 'boardPosts' then can(c, 'manage.prayer') or can(c, 'manage.content') or can(c, 'manage.classes') or can(c, 'manage.church')
      or (is_member(c) and ((op = 'insert' and own = auth.uid()::text and d->>'by' = own) or op = 'update' or (op = 'delete' and own = auth.uid()::text)))
    when k = 'pushCampaigns' then op = 'insert' and d->>'by' = auth.uid()::text and (can(c, 'manage.content') or can(c, 'send.email') or can(c, 'send.texts') or can(c, 'schedule.teams'))
    -- The treasurer's ledger. Any member can submit an expense for reimbursement, waiting for approval.
    when k = 'expenses' then can(c, 'view.giving') or (op = 'insert' and is_member(c) and own = auth.uid()::text and d->>'status' = 'pending-approval')
    when k in ('budgets', 'batches') then can(c, 'view.giving')
    -- Safety. Anyone at the church can raise an SOS or 911 alert (an incident and a message in their own name) and add their
    -- location to it; the security team handles the rest.
    when k = 'securityMessages' then security_access(c, auth.uid()) >= 1 or (own = auth.uid()::text and d->>'by' = own and is_member(c) and op in ('insert', 'update'))
    when k = 'securityIncidents' then security_access(c, auth.uid()) >= 2 or (own = auth.uid()::text and d->>'by' = own and is_member(c) and op in ('insert', 'update'))
    when k = 'securityDrills' then security_access(c, auth.uid()) = 3
    when k = 'securityRollCall' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station') or can(c, 'manage.classes') or can(c, 'teach.classes')
    when k = 'securityReunifications' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station')
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
  if not lifecycle then
    new.data := new.data - 'deactivation';
    if tg_op = 'UPDATE' and old.data ? 'deactivation' then new.data := new.data || jsonb_build_object('deactivation', old.data->'deactivation'); end if;
  end if;
  if auth.uid() is null then return new; end if;
  new.data := new.data - 'stripe' - 'payments';
  if tg_op = 'INSERT' then
    new.data := new.data - 'activeAlert' - 'activeDrill';
    return new;
  end if;
  if old.data ? 'stripe' then new.data := new.data || jsonb_build_object('stripe', old.data->'stripe'); end if;
  if old.data ? 'payments' then new.data := new.data || jsonb_build_object('payments', old.data->'payments'); end if;
  new.data := new.data - 'training';
  if old.data ? 'training' then new.data := new.data || jsonb_build_object('training', old.data->'training'); end if;
  if new.owner_id is distinct from old.owner_id and old.owner_id <> auth.uid() then raise exception 'Only the primary account holder can hand over the account'; end if;
  if (new.name, new.handle) is distinct from (old.name, old.handle) and not can(old.id, 'manage.church') then raise exception 'Your role cannot change the church name or ID'; end if;
  for k in select key from jsonb_each(new.data) union select key from jsonb_each(old.data) loop
    if new.data->k is distinct from old.data->k and k <> 'deactivation' then
      need := case
        when k in ('landing', 'banner') then 'manage.page'
        when k in ('funds', 'textGive', 'taxId', 'givingLink', 'giftCategories') then 'view.giving'
        when k in ('teams', 'positions') then 'schedule.teams'
        when k in ('followupSteps', 'followupLead') then 'manage.followup'
        when k = 'podcast' then 'manage.sermons'
        when k = 'kidsRooms' then 'manage.classes'
        when k = 'livePew' then 'live.sermon'
        when k = 'activeAlert' then 'security.transition'
        when k in ('activeDrill', 'drillPlanner', 'securityProtocols', 'securityAeds', 'medicalResponders') then 'security.head'
        when k = 'securityDoors' then 'security.supervisor'
        else 'manage.church' end;
      if not (case need
          when 'live.sermon' then can(old.id, 'present') or can(old.id, 'manage.sermons')
          when 'security.transition' then
            coalesce(current_setting('our_faithful.security_transition', true), '') = '1'
            or (security_access(old.id, auth.uid()) = 3
              and (old.data->'activeAlert'->>'active' is distinct from 'true' or old.data->'activeAlert'->>'isDrill' = 'true')
              and (new.data->'activeAlert'->>'active' is distinct from 'true' or new.data->'activeAlert'->>'isDrill' = 'true'))
          when 'security.head' then security_access(old.id, auth.uid()) = 3
          when 'security.supervisor' then security_access(old.id, auth.uid()) >= 2
          else can(old.id, need) end)
      then raise exception 'Your role cannot change %', k; end if;
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
  -- A teammate (not a scheduler) changes only who serves and their answer.
  if new.kind = 'assignments' then
    if can(old.church_id, 'schedule.teams') or is_primary(old.church_id) then return new; end if;
    if new.church_id is distinct from old.church_id
       or (new.data - 'userId' - 'status' - 'note' - 'coveredFor' - 'swapOffer' - 'respondedAt' - 'subRequestedAt' - 'subNote')
          is distinct from (old.data - 'userId' - 'status' - 'note' - 'coveredFor' - 'swapOffer' - 'respondedAt' - 'subRequestedAt' - 'subNote')
    then raise exception 'You can only answer, claim or swap this spot'; end if;
    -- Your own spot: answer, ask for a sub, or hand it over in a swap. Someone else's: only take it, when it's waiting for a sub.
    if old.owner is distinct from auth.uid()::text and not (old.data->>'status' = 'sub' and new.owner = auth.uid()::text)
    then raise exception 'This spot isn''t waiting for a sub'; end if;
    return new;
  end if;
  -- Board posts: someone who isn't the author or a moderator can react, sign up, vote, reply (without changing other
  -- replies) and flag the post for a moderator; nothing else.
  if new.kind = 'boardPosts' then
    if old.owner = auth.uid()::text or can(old.church_id, 'manage.prayer') or can(old.church_id, 'manage.content')
       or can(old.church_id, 'manage.classes') or can(old.church_id, 'manage.church') or is_primary(old.church_id) then return new; end if;
    if (new.data - 'reactions' - 'replies' - 'slots' - 'pollOptions' - 'status') is distinct from (old.data - 'reactions' - 'replies' - 'slots' - 'pollOptions' - 'status')
       or new.owner is distinct from old.owner
       or (new.data->>'status' is distinct from old.data->>'status' and new.data->>'status' <> 'flagged')
       or not (coalesce(new.data->'replies', '[]') @> coalesce(old.data->'replies', '[]'))
    then raise exception 'Only the author or a board moderator can change this post'; end if;
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
-- Public bucket for logos, banners, sermon audio and video, and songs' sheet music. Files go under the church's ID; staff upload.
insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
create policy "staff upload media" on storage.objects for insert with check (bucket_id = 'media' and (can((storage.foldername(name))[1], 'manage.sermons') or can((storage.foldername(name))[1], 'manage.page') or can((storage.foldername(name))[1], 'manage.content') or can((storage.foldername(name))[1], 'services.plan')));
create policy "staff change media" on storage.objects for update using (bucket_id = 'media' and (can((storage.foldername(name))[1], 'manage.sermons') or can((storage.foldername(name))[1], 'manage.page') or can((storage.foldername(name))[1], 'services.plan')));
create policy "staff remove media" on storage.objects for delete using (bucket_id = 'media' and (can((storage.foldername(name))[1], 'manage.sermons') or can((storage.foldername(name))[1], 'manage.page') or can((storage.foldername(name))[1], 'services.plan')));

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

-- Version 15: create index if not exists records_boards_church_idx on public.records (church_id) where kind = 'boards';
create index if not exists records_board_posts_board_idx on public.records (church_id, (data->>'boardId')) where kind = 'boardPosts';
create index if not exists records_expenses_church_date_idx on public.records (church_id, (data->>'date')) where kind = 'expenses';
create index if not exists records_budgets_church_idx on public.records (church_id) where kind = 'budgets';
create index if not exists records_batches_church_date_idx on public.records (church_id, (data->>'date')) where kind = 'batches';
create index if not exists records_push_campaigns_church_idx on public.records (church_id) where kind = 'pushCampaigns';
create index if not exists records_team_members_owner_idx on public.records (church_id, owner) where kind = 'teamMembers';
create index if not exists records_security_idx on public.records (church_id, kind)
  where kind in ('securityIncidents', 'securityMessages', 'securityRollCall', 'securityDrills', 'securityReunifications');

-- Version 16: Security Command permissions and protocol approval.
-- Live declaration, review and all-clear are serialized against the church's saved state.
create or replace function security_protocol(c text, action text, level_no int default null,
  request_id text default null, alert jsonb default null, incident_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ch churches%rowtype;
  pending records%rowtype;
  actor uuid := auth.uid();
  access_level int;
  max_level int;
  cap text;
  rid text;
  approved_alert jsonb;
  recipient uuid;
  current_alert jsonb;
  protocol jsonb;
begin
  if actor is null then raise exception 'Sign in to use Security Command'; end if;
  select * into ch from churches where id = c for update;
  access_level := security_access(c, actor);
  if access_level < 2 then raise exception 'Protocol declarations require supervisor access'; end if;
  current_alert := ch.data->'activeAlert';
  select data->>'maxLevel' into cap from records where kind = 'securityAccessAssignments'
    and church_id = c and id = c || ':' || actor::text;
  max_level := case when access_level = 3 then 5 when cap ~ '^[0-5]$' then cap::int else 0 end;

  if action in ('approve', 'decline', 'clear') and access_level <> 3 then
    raise exception 'Only the head of security or a church administrator can review requests or issue All Clear';
  end if;
  if action in ('approve', 'decline') then
    select * into pending from records where church_id = c and kind = 'securityProtocolRequests' and id = request_id for update;
    if not found or pending.data->>'status' <> 'pending' then raise exception 'This request is no longer pending'; end if;
    if action = 'decline' then
      update records set data = data || jsonb_build_object('status', 'declined', 'reviewedBy', actor, 'reviewedAt', now())
        where kind = pending.kind and id = pending.id;
      return jsonb_build_object('status', 'declined', 'id', pending.id);
    end if;
    level_no := (pending.data->>'level')::int;
    incident_id := pending.data->>'incidentId';
  end if;
  if action = 'clear' then
    if current_alert->>'active' is distinct from 'true' or current_alert->>'isDrill' = 'true' then
      raise exception 'There is no live protocol to clear';
    end if;
    perform set_config('our_faithful.security_transition', '1', true);
    update churches set data = jsonb_set(data, '{activeAlert}', 'null'::jsonb) where id = c;
    return jsonb_build_object('status', 'cleared', 'previousAlert', current_alert);
  end if;

  if action is null or action not in ('declare', 'approve') or level_no is null or level_no not between 1 and 5 then
    raise exception 'Choose a valid security protocol';
  end if;
  if nullif(incident_id, '') is not null and not exists (
    select 1 from records where kind = 'securityIncidents' and church_id = c and id = incident_id
  ) then raise exception 'The incident is not available at this church'; end if;
  if action = 'declare' and level_no > max_level then
    if exists (select 1 from records where church_id = c and kind = 'securityProtocolRequests' and owner = actor::text
      and data->>'status' = 'pending' and data->>'level' = level_no::text
      and data->>'incidentId' is not distinct from nullif(incident_id, '')) then
      raise exception 'An equivalent request is already waiting for review';
    end if;
    rid := gen_random_uuid()::text;
    insert into records (kind, id, church_id, owner, data) values (
      'securityProtocolRequests', rid, c, actor::text,
      jsonb_build_object('requestedBy', actor, 'at', now(), 'level', level_no, 'incidentId', nullif(incident_id, ''), 'status', 'pending'));
    for recipient in select ch.owner_id union select m.user_id from memberships m
      where m.church_id = c and security_access(c, m.user_id) = 3 loop
      insert into records (kind, id, church_id, owner, data) values ('notifications', gen_random_uuid()::text, c, recipient::text,
        jsonb_build_object('userId', recipient, 'at', now(), 'read', false, 'kind', 'security',
          'title', 'Security protocol approval requested', 'body', format('Review the request to activate Level %s.', level_no), 'link', '#security-access'));
    end loop;
    return jsonb_build_object('status', 'pending', 'id', rid, 'at', now());
  end if;

  if coalesce((ch.data->'activeDrill'->>'active')::boolean, false) then
    raise exception 'End the active drill before activating a live protocol';
  end if;
  if current_alert->>'active' = 'true' and current_alert->>'isDrill' is distinct from 'true'
      and current_alert->>'level' ~ '^[1-5]$' and (current_alert->>'level')::int >= level_no then
    raise exception 'An equal or higher security protocol is already active';
  end if;
  if jsonb_typeof(alert) is distinct from 'object' or alert->>'level' is distinct from level_no::text then
    raise exception 'The activation does not match the requested level';
  end if;
  select p into protocol from jsonb_array_elements(coalesce(ch.data->'securityProtocols', '[]'::jsonb)) p where p->>'level' = level_no::text limit 1;
  approved_alert := alert || jsonb_build_object('overrideDisplays', coalesce(protocol->'overrideDisplays', to_jsonb(level_no = 5)),
    'requireDoorCheck', coalesce(protocol->'requireDoorCheck', to_jsonb(level_no >= 3)),
    'requireRollCall', coalesce(protocol->'requireRollCall', to_jsonb(level_no in (3, 5))), 'showHomeBanner', true) || jsonb_build_object('active', true, 'isDrill', false, 'level', level_no, 'incidentId', nullif(incident_id, ''),
    'startedAt', now(), 'startedBy', actor);
  perform set_config('our_faithful.security_transition', '1', true);
  update churches set data = jsonb_set(data, '{activeAlert}', approved_alert) where id = c;
  if action = 'approve' then
    update records set data = data || jsonb_build_object('status', 'approved', 'reviewedBy', actor, 'reviewedAt', now())
      where kind = pending.kind and id = pending.id;
  end if;
  return jsonb_build_object('status', 'active', 'alert', approved_alert);
end $$;

-- Security responders outside the check-in team can close an active check-in and log the handoff atomically.
create or replace function security_checkout(c text, checkin_id text, pickup_code text, guardian_name text, relation_name text, identity_verified boolean, handoff_confirmed boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  child records%rowtype;
  actor uuid := auth.uid();
  log_time timestamptz := now();
begin
  if security_access(c, actor) < 2 then raise exception 'Reunification access is required'; end if;
  if identity_verified is distinct from true or handoff_confirmed is distinct from true then
    raise exception 'Confirm identity verification and the handoff';
  end if;
  select * into child from records where kind = 'checkins' and church_id = c and id = checkin_id for update;
  if not found or child.data->>'out' is not null then raise exception 'This check-in is no longer active'; end if;
  if nullif(upper(trim(pickup_code)), '') is null or upper(trim(pickup_code)) is distinct from upper(child.data->>'code') then
    raise exception 'Pickup code does not match';
  end if;
  if nullif(trim(guardian_name), '') is null or length(guardian_name) > 200
      or relation_name is null or relation_name not in ('Parent / Legal Guardian', 'Authorized Family Pickup', 'Emergency Contact') then
    raise exception 'Enter the guardian and relationship';
  end if;
  update records set data = data || jsonb_build_object('out', log_time, 'outBy', actor) where kind = child.kind and id = child.id;
  insert into records (kind, id, church_id, data) values ('securityReunifications', gen_random_uuid()::text, c, jsonb_build_object(
    'checkinId', child.id, 'childName', child.data->>'childName', 'room', child.data->>'room', 'code', child.data->>'code',
    'guardianName', trim(guardian_name), 'relation', relation_name, 'idVerified', true,
    'releasedBy', (select name from profiles where id = actor), 'at', log_time));
end $$;
revoke execute on function security_checkout(text, text, text, text, text, boolean, boolean) from public, anon;
grant execute on function security_checkout(text, text, text, text, text, boolean, boolean) to authenticated;

create or replace function security_pickups(c text, checkin_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare contacts jsonb;
begin
  if security_access(c, auth.uid()) < 2 and not can(c, 'checkin.station') then
    raise exception 'Reunification access is required';
  end if;
  select f.pickups into contacts from records k join families f on f.user_id::text = k.owner
    where k.kind = 'checkins' and k.id = checkin_id and k.church_id = c and k.data->>'out' is null
      and (security_access(c, auth.uid()) >= 2 or sees_location(c, k.location_id));
  return coalesce(contacts, '[]'::jsonb);
end $$;
revoke execute on function security_pickups(text, text) from public, anon;
grant execute on function security_pickups(text, text) to authenticated;

-- Only church administrators assign Security Command access. Assignments are private records.
create or replace function security_assign_access(c text, person uuid, role_name text, max_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  assignment jsonb;
  actor uuid := auth.uid();
begin
  if actor is null or not (can(c, 'manage.church') or exists (
    select 1 from memberships where church_id = c and user_id = actor and role_key = 'admin' and church_live(c)
  )) then raise exception 'Only church administrators can assign access'; end if;
  perform 1 from churches where id = c for update;
  if not exists (select 1 from memberships where church_id = c and user_id = person and role_key not like 'device:%') then
    raise exception 'Choose a member of this church';
  end if;
  if role_name is null or role_name not in ('', 'volunteer', 'supervisor', 'head') or max_level is null or max_level not between 0 and 5 then
    raise exception 'Choose a valid security role and limit';
  end if;
  assignment := jsonb_build_object('userId', person, 'role', nullif(role_name, ''), 'maxLevel',
    case when role_name = 'supervisor' then max_level else 0 end);
  insert into records (kind, id, church_id, owner, data) values ('securityAccessAssignments', c || ':' || person::text, c, person::text, assignment)
    on conflict (kind,id) do update set data = excluded.data;
  return assignment;
end $$;

revoke execute on function security_assign_access(text, uuid, text, int) from public, anon;
grant execute on function security_assign_access(text, uuid, text, int) to authenticated;
revoke execute on function security_access(text, uuid), security_protocol(text, text, int, text, jsonb, text) from public, anon;
grant execute on function security_protocol(text, text, int, text, jsonb, text) to authenticated;

-- Version 17: Incident response timeline.
create or replace function can_respond_to_incidents(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select security_access(c, auth.uid()) >= 2
$$;
revoke execute on function can_respond_to_incidents(text) from public, anon;
grant execute on function can_respond_to_incidents(text) to authenticated;

create policy "read incident response events" on records for select to authenticated using (
  kind = 'securityIncidentEvents' and can_respond_to_incidents(church_id)
);
create policy "restrict incident response reads" on records as restrictive for select to authenticated using (
  kind <> 'securityIncidentEvents' or can_respond_to_incidents(church_id)
);
create policy "incident events use RPC for insert" on records as restrictive for insert to authenticated
  with check (kind <> 'securityIncidentEvents');
create policy "incident events are immutable on update" on records as restrictive for update to authenticated
  using (kind <> 'securityIncidentEvents') with check (kind <> 'securityIncidentEvents');
create policy "incident events are immutable on delete" on records as restrictive for delete to authenticated
  using (kind <> 'securityIncidentEvents');

create index records_incident_events on records (church_id, (data->>'incidentId')) where kind = 'securityIncidentEvents';

create or replace function security_incident_roster(c text) returns table(id uuid, name text)
language sql stable security definer set search_path = public as $$
  select candidate.id, coalesce(nullif(p.name, ''), 'Church responder')
  from (
    select owner_id as id from churches where churches.id = c
    union select user_id from memberships where church_id = c
  ) candidate left join profiles p on p.id = candidate.id
  where can_respond_to_incidents(c) and security_access(c, candidate.id) >= 2
  order by 2, 1
$$;
revoke execute on function security_incident_roster(text) from public, anon;
grant execute on function security_incident_roster(text) to authenticated;

create or replace function security_incident_event(c text, incident_id text, event_id text, event_type text,
  event_value text default null, detail text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inc records%rowtype;
  previous records%rowtype;
  result jsonb;
  actor uuid := auth.uid();
  person uuid;
  target uuid;
  alert_title text;
  actor_name text;
  target_name text;
  closed boolean;
begin
  if actor is null or security_access(c, actor) < 2 then raise exception 'Incident response access is required'; end if;
  if event_id is null or event_id !~ '^[a-zA-Z0-9-]{8,48}$' then raise exception 'Invalid update ID'; end if;
  select * into inc from records where church_id = c and kind = 'securityIncidents' and id = incident_id for update;
  if not found then raise exception 'This incident is unavailable'; end if;

  select * into previous from records where kind = 'securityIncidentEvents' and id = event_id;
  if found then
    if previous.church_id = c and previous.data->>'incidentId' = incident_id and previous.data->>'by' = actor::text
      and previous.data->>'type' = event_type and previous.data->>'value' is not distinct from nullif(event_value, '')
      and previous.data->>'note' = coalesce(trim(detail), '') then return previous.data || jsonb_build_object('id', previous.id); end if;
    raise exception 'This update ID is already in use';
  end if;

  closed := coalesce(inc.data->>'status' = 'resolved', false) or exists (
    select 1 from records where kind = 'securityIncidentEvents' and church_id = c and data->>'incidentId' = incident_id and data->>'type' = 'clear'
  );
  if event_type = 'ack' and not closed then raise exception 'The incident is still active'; end if;
  if event_type <> 'ack' and closed then raise exception 'The incident has already been cleared'; end if;
  if length(coalesce(detail, '')) > 2000 then raise exception 'Keep the note to 2,000 characters'; end if;

  case event_type
    when 'triage' then
      if event_value is null or event_value not in ('critical','high','medium','low') then raise exception 'Choose a triage priority'; end if;
    when 'assign' then
      select r.id into person from security_incident_roster(c) r where r.id::text = event_value;
      if person is null then raise exception 'Choose a responder with incident access'; end if;
      alert_title := 'Incident assigned to you';
    when 'respond' then null;
    when 'arrive' then
      if not exists (
        select 1 from records where kind = 'securityIncidentEvents' and church_id = c and data->>'incidentId' = incident_id
          and data->>'type' = 'respond' and data->>'by' = actor::text
      ) then raise exception 'Join the response before recording your arrival'; end if;
    when 'note' then
      if nullif(trim(detail), '') is null then raise exception 'Enter a note'; end if;
    when 'assistance' then alert_title := 'Incident needs further assistance';
    when 'dispatched' then null;
    when 'available' then alert_title := 'All available responders requested';
    when 'clear' then null;
    when 'ack' then null;
    else raise exception 'Unknown incident update';
  end case;

  if event_type in ('respond','arrive','ack') or event_type = 'assign' then
    select * into previous from records where kind = 'securityIncidentEvents' and church_id = c and data->>'incidentId' = incident_id
      and data->>'type' = event_type and (case when event_type = 'assign' then data->>'value' = person::text else data->>'by' = actor::text end)
      limit 1;
    if found then return previous.data || jsonb_build_object('id', previous.id); end if;
  end if;

  select name into actor_name from profiles where id = actor;
  if person is not null then select name into target_name from profiles where id = person; end if;
  result := jsonb_build_object('id', event_id, 'incidentId', incident_id, 'type', event_type, 'value', nullif(event_value, ''),
    'note', coalesce(trim(detail), ''), 'by', actor, 'actorName', actor_name, 'targetName', target_name, 'at', clock_timestamp());
  insert into records (kind,id,church_id,data) values ('securityIncidentEvents',event_id,c,result - 'id');

  if alert_title is not null then
    for target in select r.id from security_incident_roster(c) r where r.id <> actor
      and (event_type <> 'assign' or r.id = person)
    loop
      insert into records (kind,id,church_id,owner,data) values ('notifications',gen_random_uuid()::text,c,target::text,jsonb_build_object(
        'userId',target,'at',clock_timestamp(),'read',false,'kind','security','title',alert_title,
        'body',concat_ws(' · ',inc.data->>'category',inc.data->>'room'),'link','#security-incidents-' || incident_id));
    end loop;
  end if;
  return result;
end $$;
revoke execute on function security_incident_event(text,text,text,text,text,text) from public, anon;
grant execute on function security_incident_event(text,text,text,text,text,text) to authenticated;

-- Version 18: Customizable and assignable accident / incident reports.
-- Run after upgrade-17.sql.

create or replace function can_read_incident_report(c text, assignee text, creator text) returns boolean
language sql stable security definer set search_path = public as $$
  select security_access(c, auth.uid()) = 3 or
    (security_access(c, auth.uid()) = 2 and auth.uid()::text in (assignee, creator))
$$;
revoke execute on function can_read_incident_report(text,text,text) from public, anon;
grant execute on function can_read_incident_report(text,text,text) to authenticated;

create policy "read incident report records" on records for select to authenticated using (
  (kind = 'securityIncidentFormTemplates' and can_respond_to_incidents(church_id)) or
  (kind = 'securityIncidentReports' and can_read_incident_report(church_id, owner, data->>'createdBy'))
);
create policy "restrict incident report reads" on records as restrictive for select using (
  kind not in ('securityIncidentFormTemplates', 'securityIncidentReports') or
  (kind = 'securityIncidentFormTemplates' and can_respond_to_incidents(church_id)) or
  (kind = 'securityIncidentReports' and can_read_incident_report(church_id, owner, data->>'createdBy'))
);
create policy "incident report inserts use RPC" on records as restrictive for insert
  with check (kind not in ('securityIncidentFormTemplates', 'securityIncidentReports'));
create policy "incident report updates use RPC" on records as restrictive for update
  using (kind not in ('securityIncidentFormTemplates', 'securityIncidentReports'))
  with check (kind not in ('securityIncidentFormTemplates', 'securityIncidentReports'));
create policy "incident report records cannot be deleted" on records as restrictive for delete
  using (kind not in ('securityIncidentFormTemplates', 'securityIncidentReports'));

create index records_incident_reports on records (church_id, (data->>'incidentId')) where kind = 'securityIncidentReports';

create or replace function security_incident_template(c text, template_id text, name text, fields jsonb, make_default boolean, expected_at text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  previous records%rowtype;
  field jsonb;
  result jsonb;
  actor uuid := auth.uid();
begin
  if security_access(c, actor) <> 3 then raise exception 'Only the head of security or a church administrator can edit forms'; end if;
  if template_id is null or template_id !~ '^[a-zA-Z0-9-]{8,48}$' then raise exception 'Invalid form ID'; end if;
  if coalesce(length(btrim(name)), 0) not between 1 and 100 or jsonb_typeof(fields) is distinct from 'array' then
    raise exception 'Enter a form name and include at least one question';
  end if;
  if jsonb_array_length(fields) not between 1 and 30 or length(fields::text) > 30000 then raise exception 'Include 1 to 30 questions'; end if;
  for field in select value from jsonb_array_elements(fields) loop
    if coalesce(field->>'id', '') !~ '^[a-zA-Z][a-zA-Z0-9-]{0,47}$'
      or coalesce(length(btrim(field->>'label')), 0) not between 1 and 150
      or coalesce(field->>'type', '') not in ('short', 'long', 'date', 'time', 'number', 'choice')
      or (field ? 'required' and jsonb_typeof(field->'required') <> 'boolean')
      or (field->>'type' = 'choice' and jsonb_typeof(field->'options') is distinct from 'array')
    then raise exception 'Check the question labels and answer types'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(fields)) <> jsonb_array_length(fields) then
    raise exception 'Each question needs a distinct ID';
  end if;

  perform 1 from churches where id = c for update;
  select * into previous from records where kind = 'securityIncidentFormTemplates' and id = template_id;
  if found and previous.church_id <> c then raise exception 'This form is unavailable'; end if;
  if previous.data->>'updatedAt' is distinct from expected_at then
    if previous.data->>'name' = btrim(name) and previous.data->'fields' = fields
      and previous.data->'isDefault' = to_jsonb(coalesce(make_default, false)) then
      return previous.data || jsonb_build_object('id', template_id);
    end if;
    raise exception 'This form changed. Close and reopen it before editing again.';
  end if;
  result := jsonb_build_object('name', btrim(name), 'fields', fields, 'isDefault', coalesce(make_default, false),
    'updatedAt', clock_timestamp(), 'updatedBy', actor);
  if make_default then
    update records set data = data || jsonb_build_object('isDefault', false, 'updatedAt', clock_timestamp())
      where kind = 'securityIncidentFormTemplates' and church_id = c and id <> template_id and data->>'isDefault' = 'true';
  end if;
  insert into records(kind, id, church_id, data) values ('securityIncidentFormTemplates', template_id, c, result)
    on conflict (kind, id) do update set data = excluded.data where records.church_id = c;
  if not found then raise exception 'This form is unavailable'; end if;
  return result || jsonb_build_object('id', template_id);
end $$;
revoke execute on function security_incident_template(text,text,text,jsonb,boolean,text) from public, anon;
grant execute on function security_incident_template(text,text,text,jsonb,boolean,text) to authenticated;

create or replace function security_incident_report(c text, report_id text, action text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  previous records%rowtype;
  template jsonb;
  incident_id text;
  assignee uuid;
  assignee_name text;
  answers jsonb;
  field jsonb;
  answer text;
  result jsonb;
  stamp timestamptz := clock_timestamp();
  actor uuid := auth.uid();
  access_level int := security_access(c, actor);
begin
  if access_level < 2 then raise exception 'Incident response access is required'; end if;
  if report_id is null or report_id !~ '^[a-zA-Z0-9-]{8,48}$' then raise exception 'Invalid report ID'; end if;
  select * into previous from records where kind = 'securityIncidentReports' and id = report_id for update;
  if found and previous.church_id <> c then raise exception 'This report is unavailable'; end if;

  if action = 'create' then
    incident_id := payload->>'incidentId';
    perform 1 from records where kind = 'securityIncidents' and church_id = c and id = incident_id
      and coalesce(data->>'kind', '') <> 'DRILL_INJECT' for update;
    if not found then raise exception 'This incident is unavailable'; end if;
    select * into previous from records where kind = 'securityIncidentReports' and id = report_id for update;
    if found then
      if previous.church_id = c and previous.data->>'createdBy' = actor::text and previous.data->>'incidentId' = incident_id
        and previous.data->>'templateId' = payload->>'templateId' then
        return previous.data || jsonb_build_object('id', report_id);
      end if;
      raise exception 'This report ID is already in use';
    end if;
    select r.id, r.name into assignee, assignee_name from security_incident_roster(c) r where r.id::text = payload->>'assignedTo';
    if assignee is null then raise exception 'Choose an assignee with incident access'; end if;
    if payload->>'templateId' = 'standard' then
      template := '{
        "name":"Standard accident / incident report",
        "fields":[
          {"id":"summary","label":"Accident / incident summary","type":"long","required":true},
          {"id":"people","label":"People involved","type":"long","required":true},
          {"id":"injuries","label":"Injuries, medical care, or property damage","type":"long"},
          {"id":"witnesses","label":"Witnesses and contact information","type":"long"},
          {"id":"actions","label":"Steps taken to resolve the incident","type":"long","required":true},
          {"id":"services","label":"Emergency services involvement","type":"choice","options":["None","Police","Fire","EMS","Multiple services"]},
          {"id":"procedures","label":"Policies or procedures followed","type":"long"},
          {"id":"prevention","label":"Corrective or preventive action","type":"long"},
          {"id":"followup","label":"Follow-up required","type":"long"}
        ]
      }'::jsonb;
    else
      select data into template from records where church_id = c and kind = 'securityIncidentFormTemplates' and id = payload->>'templateId';
    end if;
    if template is null then raise exception 'This form is unavailable'; end if;
    result := jsonb_build_object('incidentId', incident_id, 'templateId', payload->>'templateId',
      'templateName', template->>'name', 'fields', template->'fields', 'values', '{}'::jsonb,
      'assignedTo', assignee, 'assignedName', assignee_name, 'status', 'draft', 'createdBy', actor, 'createdAt', stamp,
      'updatedBy', actor, 'updatedAt', stamp);
    insert into records(kind, id, church_id, owner, data)
      values ('securityIncidentReports', report_id, c, assignee::text, result);
  else
    if previous.id is null then raise exception 'This report is unavailable'; end if;
    if access_level <> 3 and previous.owner is distinct from actor::text then raise exception 'Only the assignee or a security lead can edit this report'; end if;
    if action in ('review', 'reassign') and access_level <> 3 then raise exception 'Only a security lead can review or reassign reports'; end if;
    if coalesce(payload->>'requestId', '') !~ '^[a-zA-Z0-9-]{8,48}$' then raise exception 'Invalid update ID'; end if;
    if previous.data->>'lastUpdateId' = payload->>'requestId' and previous.data->>'updatedBy' = actor::text then
      return previous.data || jsonb_build_object('id', report_id);
    end if;
    if previous.data->>'updatedAt' is distinct from payload->>'expectedAt' then raise exception 'This report changed. Close and reopen it before editing again.'; end if;
    if previous.data->>'status' = 'reviewed' then raise exception 'This report is locked'; end if;
    result := previous.data;
    incident_id := result->>'incidentId';
    if action = 'reassign' then
      if result->>'status' <> 'draft' then raise exception 'Only draft reports can be reassigned'; end if;
      select r.id, r.name into assignee, assignee_name from security_incident_roster(c) r where r.id::text = payload->>'assignedTo';
      if assignee is null then raise exception 'Choose an assignee with incident access'; end if;
      if previous.owner = assignee::text then return previous.data || jsonb_build_object('id', report_id); end if;
      result := result || jsonb_build_object('assignedTo', assignee, 'assignedName', assignee_name);
    elsif action = 'review' then
      if result->>'status' <> 'submitted' then raise exception 'Submit the report before marking it reviewed'; end if;
      result := result || jsonb_build_object('status', 'reviewed', 'reviewedAt', stamp, 'reviewedBy', actor);
    elsif action in ('draft', 'submit') then
      if result->>'status' <> 'draft' then raise exception 'This report has already been submitted'; end if;
      if jsonb_typeof(payload->'values') is distinct from 'object' then raise exception 'Enter the report answers'; end if;
      answers := '{}'::jsonb;
      for field in select value from jsonb_array_elements(result->'fields') loop
        answer := btrim(coalesce(payload->'values'->>(field->>'id'), ''));
        if action = 'submit' and field->'required' = 'true'::jsonb and answer = '' then
          raise exception 'Complete % before submitting', field->>'label';
        end if;
        if length(answer) > (case when field->>'type' = 'long' then 5000 else 500 end)
          or (answer <> '' and field->>'type' = 'choice' and not (field->'options' ? answer)) then
          raise exception 'Check the answer for %', field->>'label';
        end if;
        answers := answers || jsonb_build_object(field->>'id', answer);
      end loop;
      result := result || jsonb_build_object('values', answers);
      if action = 'submit' then result := result || jsonb_build_object('status', 'submitted', 'submittedAt', stamp, 'submittedBy', actor); end if;
    else
      raise exception 'Unknown report action';
    end if;
    result := result || jsonb_build_object('updatedAt', stamp, 'updatedBy', actor, 'lastUpdateId', payload->>'requestId');
    update records set data = result, owner = coalesce(assignee::text, previous.owner)
      where kind = 'securityIncidentReports' and id = report_id and church_id = c;
  end if;

  if assignee is not null and assignee <> actor then
    insert into records(kind,id,church_id,owner,data)
      values ('notifications', gen_random_uuid()::text, c, assignee::text, jsonb_build_object(
        'userId', assignee, 'at', stamp, 'read', false, 'kind', 'security', 'title', 'Incident report assigned to you',
        'body', 'Open Security Command to complete the report.', 'link', '#security-incidents-' || incident_id));
  end if;
  return result || jsonb_build_object('id', report_id);
end $$;
revoke execute on function security_incident_report(text,text,text,jsonb) from public, anon;
grant execute on function security_incident_report(text,text,text,jsonb) to authenticated;

-- Version 19: Explicit security roles and customizable declaration levels.
-- Run after upgrade-18.sql. This does not enroll any members or increase existing supervisor overrides.

-- Internal access tiers gate tools independently of a person's direct declaration level.
create or replace function security_access(c text, person uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case a.data->>'role' when 'head' then 3 when 'supervisor' then 2 when 'staff' then 2 when 'volunteer' then 1 else 0 end
    from memberships m
    left join records a on a.church_id = m.church_id and a.kind = 'securityAccessAssignments' and a.id = c || ':' || person::text
    where m.church_id = c and m.user_id = person and m.role_key not like 'device:%' and church_live(c)
  ), 0)
$$;
revoke execute on function security_access(text, uuid) from public, anon, authenticated;

create or replace function on_security_team(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select security_access(c, auth.uid()) > 0
$$;

create or replace function can_manage_security_access(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select church_live(c) and (is_primary(c) or can(c, 'manage.church') or exists (
    select 1 from memberships where church_id = c and user_id = auth.uid() and role_key = 'admin'
  ))
$$;

create or replace function can_review_security_protocol(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select security_access(c, auth.uid()) = 3 or can_manage_security_access(c)
$$;

create or replace function security_direct_level(c text, person uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare assignment jsonb; role_name text; cap text;
begin
  if security_access(c, person) = 0 then return 0; end if;
  select data into assignment from records where church_id = c and kind = 'securityAccessAssignments' and id = c || ':' || person::text;
  role_name := assignment->>'role';
  cap := case when assignment ? 'levelOverride' then assignment->>'levelOverride'
    when role_name = 'supervisor' then assignment->>'maxLevel' end;
  if cap ~ '^[0-5]$' then return cap::int; end if;
  select data->>role_name into cap from records where church_id = c and kind = 'securityRoleDefaults' and id = c;
  if cap ~ '^[0-5]$' then return cap::int; end if;
  return case role_name when 'volunteer' then 1 when 'staff' then 2 when 'supervisor' then 4 when 'head' then 5 else 0 end;
end $$;
revoke execute on function can_manage_security_access(text), can_review_security_protocol(text), security_direct_level(text,uuid) from public, anon, authenticated;

create or replace function security_set_role_level(c text, role_name text, max_level int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare levels jsonb;
begin
  if not can_manage_security_access(c) then raise exception 'Only church administrators can change security role defaults'; end if;
  if role_name is null or role_name not in ('volunteer','staff','supervisor','head')
    or max_level is null or max_level not between 0 and 5 then raise exception 'Choose a valid security role and level'; end if;
  perform 1 from churches where id = c for update;
  insert into records(kind, id, church_id, data) values ('securityRoleDefaults', c, c, jsonb_build_object(role_name, max_level))
    on conflict (kind, id) do update set data = records.data || excluded.data
    returning data into levels;
  return levels;
end $$;
revoke execute on function security_set_role_level(text,text,int) from public, anon;
grant execute on function security_set_role_level(text,text,int) to authenticated;

create or replace function security_assign_access(c text, person uuid, role_name text, max_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare assignment jsonb;
begin
  if not can_manage_security_access(c) then raise exception 'Only church administrators can assign access'; end if;
  perform 1 from churches where id = c for update;
  if not exists (select 1 from memberships where church_id = c and user_id = person and role_key not like 'device:%') then
    raise exception 'Choose a member of this church';
  end if;
  if role_name is null or role_name not in ('','volunteer','staff','supervisor','head')
    or (max_level is not null and max_level not between 0 and 5) then raise exception 'Choose a valid security role and limit'; end if;
  assignment := jsonb_build_object('userId', person, 'role', nullif(role_name, ''),
    'levelOverride', case when role_name <> '' then max_level end);
  insert into records (kind, id, church_id, owner, data) values ('securityAccessAssignments', c || ':' || person::text, c, person::text, assignment)
    on conflict (kind,id) do update set data = excluded.data;
  return assignment;
end $$;
revoke execute on function security_assign_access(text, uuid, text, int) from public, anon;
grant execute on function security_assign_access(text, uuid, text, int) to authenticated;

-- Management can see grants and pending requests without gaining operational record access.
create or replace function security_record_read(k text, c text, own text) returns boolean
language sql stable security definer set search_path = public as $$
  select case k
    when 'securityRoleDefaults' then is_member(c)
    when 'securityAccessAssignments' then is_member(c) and (own = auth.uid()::text or can_review_security_protocol(c))
    when 'securityProtocolRequests' then is_member(c) and (own = auth.uid()::text or can_review_security_protocol(c))
    when 'securityMessages' then coalesce(own = auth.uid()::text, false) or security_access(c, auth.uid()) >= 1
    when 'securityIncidents' then coalesce(own = auth.uid()::text, false) or security_access(c, auth.uid()) >= 2
    when 'securityDrills' then security_access(c, auth.uid()) = 3
    when 'securityRollCall' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station') or can(c, 'manage.classes') or can(c, 'teach.classes')
    when 'securityReunifications' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station')
    else true end
$$;

create or replace function security_record_write(k text, c text, own text, d jsonb, op text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when k in ('securityRoleDefaults','securityAccessAssignments','securityProtocolRequests') then false
    when k = 'securityMessages' then security_access(c, auth.uid()) >= 1
      or (own = auth.uid()::text and d->>'by' = own and is_member(c) and op in ('insert','update'))
    when k = 'securityIncidents' then security_access(c, auth.uid()) >= 2
      or (own = auth.uid()::text and d->>'by' = own and is_member(c) and op in ('insert','update'))
    when k = 'securityDrills' then security_access(c, auth.uid()) = 3
    when k in ('securityRollCall','securityReunifications') then security_record_read(k, c, own)
    else true end
$$;
revoke execute on function security_record_read(text,text,text), security_record_write(text,text,text,jsonb,text) from public, anon;
grant execute on function security_record_read(text,text,text), security_record_write(text,text,text,jsonb,text) to authenticated;

create policy "read security access management records" on records for select to authenticated using (
  kind in ('securityRoleDefaults','securityAccessAssignments','securityProtocolRequests') and security_record_read(kind, church_id, owner)
);
create policy "restrict security record reads to assigned access" on records as restrictive for select to authenticated
  using (kind not like 'security%' or security_record_read(kind, church_id, owner));
create policy "restrict security record inserts to assigned access" on records as restrictive for insert to authenticated
  with check (kind not like 'security%' or security_record_write(kind, church_id, owner, data, 'insert'));
create policy "restrict security record updates to assigned access" on records as restrictive for update to authenticated
  using (kind not like 'security%' or security_record_write(kind, church_id, owner, data, 'update'))
  with check (kind not like 'security%' or security_record_write(kind, church_id, owner, data, 'update'));
create policy "restrict security record deletes to assigned access" on records as restrictive for delete to authenticated
  using (kind not like 'security%' or security_record_write(kind, church_id, owner, data, 'delete'));

-- Version 21: Live Security Command radio and private messages (upgrade-21.sql).

create table if not exists public.security_radio_floor (
  church_id text primary key references public.churches(id) on delete cascade,
  transmission uuid not null,
  sender uuid not null,
  recipient uuid,
  sender_name text not null,
  expires_at timestamptz not null,
  idle_until timestamptz not null,
  last_seq integer not null default -1
);
alter table public.security_radio_floor enable row level security;
revoke all on public.security_radio_floor from public, anon, authenticated;

create or replace function public.security_radio_roster(c text) returns table(id uuid, name text)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(p.name, ''), 'Security team member')
  from memberships m left join profiles p on p.id = m.user_id
  where m.church_id = c and security_access(c, auth.uid()) > 0 and security_access(c, m.user_id) > 0
  order by 2, 1
$$;

create or replace function public.can_hear_security_radio(channel text) returns boolean
language sql stable security definer set search_path = public as $$
  select channel = 'security-radio:' || split_part(channel, ':', 2) || ':' || auth.uid()::text
    and security_access(split_part(channel, ':', 2), auth.uid()) > 0
$$;
drop policy if exists "security radio receives own broadcast" on realtime.messages;
create policy "security radio receives own broadcast" on realtime.messages for select to authenticated using (
  extension = 'broadcast' and public.can_hear_security_radio(coalesce(realtime.topic(), topic))
);
drop policy if exists "security radio inbox is private" on realtime.messages;
create policy "security radio inbox is private" on realtime.messages as restrictive for select to authenticated using (
  (coalesce(realtime.topic(), '') not like 'security-radio:%' and coalesce(topic, '') not like 'security-radio:%')
  or (extension = 'broadcast' and public.can_hear_security_radio(coalesce(realtime.topic(), topic)))
);
drop policy if exists "security radio broadcast is server only" on realtime.messages;
create policy "security radio broadcast is server only" on realtime.messages as restrictive for insert to authenticated
  with check (coalesce(realtime.topic(), '') not like 'security-radio:%' and coalesce(topic, '') not like 'security-radio:%');

create or replace function public.security_radio_start(c text, target uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  chosen uuid := gen_random_uuid();
  label text;
  until_at timestamptz := clock_timestamp() + interval '30 seconds';
begin
  if security_access(c, actor) = 0 then raise exception 'Security Command access is required'; end if;
  if target is not null and (target = actor or security_access(c, target) = 0) then
    raise exception 'Choose an assigned security team member';
  end if;
  select name into label from profiles where id = actor;
  insert into security_radio_floor(church_id, transmission, sender, recipient, sender_name, expires_at, idle_until)
  values(c, chosen, actor, target, coalesce(nullif(label,''), 'Security team member'), until_at, clock_timestamp() + interval '4 seconds')
  on conflict (church_id) do update set transmission = excluded.transmission, sender = excluded.sender,
    recipient = excluded.recipient, sender_name = excluded.sender_name, expires_at = excluded.expires_at,
    idle_until = excluded.idle_until, last_seq = -1
    where least(security_radio_floor.expires_at, security_radio_floor.idle_until) <= clock_timestamp();
  if not found then raise exception 'The radio is busy'; end if;
  return jsonb_build_object('id', chosen, 'expiresAt', until_at);
end $$;

-- Relay from the server so a client cannot claim another sender's identity. Recheck the
-- recipient grants on each frame, including after revocation on an already connected device.
create or replace function public.security_radio_frame(c text, transmission_id uuid, seq int, encoded text)
returns void language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  session security_radio_floor%rowtype;
  member uuid;
  payload jsonb;
begin
  if security_access(c, actor) = 0 then raise exception 'Security Command access is required'; end if;
  if encoded is not null and (seq is null or seq not between 0 and 160 or length(encoded) not between 4 and 2136
    or length(encoded) % 4 <> 0 or encoded !~ '^[A-Za-z0-9+/]+={0,2}$') then raise exception 'Invalid radio frame'; end if;
  select * into session from security_radio_floor where church_id = c and transmission = transmission_id and sender = actor for update;
  if not found or least(session.expires_at, session.idle_until) <= clock_timestamp() then
    if encoded is null then return; end if;
    raise exception 'This transmission ended';
  end if;
  if encoded is null then
    delete from security_radio_floor where church_id = c;
    if session.last_seq < 0 then return; end if;
  else
    if seq <= session.last_seq then return; end if;
    if session.recipient is not null and security_access(c, session.recipient) = 0 then raise exception 'That recipient no longer has radio access'; end if;
    update security_radio_floor set last_seq = seq, idle_until = clock_timestamp() + interval '4 seconds'
      where church_id = c;
  end if;
  payload := jsonb_build_object('id', transmission_id, 'by', actor, 'name', session.sender_name,
    'direct', session.recipient is not null, 'seq', seq, 'audio', encoded, 'ended', encoded is null);
  for member in select r.id from security_radio_roster(c) r where r.id <> actor and (session.recipient is null or r.id = session.recipient)
  loop
    perform realtime.send(payload, 'radio', 'security-radio:' || c || ':' || member::text, true);
  end loop;
end $$;

create or replace function public.can_read_security_radio_message(c text, sender text, recipient text) returns boolean
language sql stable security definer set search_path = public as $$
  select security_access(c, auth.uid()) > 0 and
    (recipient is null or recipient = auth.uid()::text or sender = auth.uid()::text)
$$;
drop policy if exists "read assigned security radio messages" on public.records;
create policy "read assigned security radio messages" on public.records for select to authenticated using (
  kind = 'securityRadioMessages' and can_read_security_radio_message(church_id, owner, data->>'recipientId')
);
drop policy if exists "restrict security radio message and notice reads" on public.records;
create policy "restrict security radio message and notice reads" on public.records as restrictive for select to authenticated using (
  (kind <> 'securityRadioMessages' or can_read_security_radio_message(church_id, owner, data->>'recipientId'))
  and (kind <> 'notifications' or data->>'kind' is distinct from 'security-radio' or can_read_security_radio_message(church_id, owner, owner))
);
drop policy if exists "security radio messages use RPC on insert" on public.records;
create policy "security radio messages use RPC on insert" on public.records as restrictive for insert to authenticated
  with check (kind <> 'securityRadioMessages' and (kind <> 'notifications' or data->>'kind' is distinct from 'security-radio'));
drop policy if exists "security radio messages use RPC on update" on public.records;
create policy "security radio messages use RPC on update" on public.records as restrictive for update to authenticated
  using (kind <> 'securityRadioMessages' and (kind <> 'notifications' or data->>'kind' is distinct from 'security-radio'))
  with check (kind <> 'securityRadioMessages' and (kind <> 'notifications' or data->>'kind' is distinct from 'security-radio'));
drop policy if exists "security radio messages are immutable on delete" on public.records;
create policy "security radio messages are immutable on delete" on public.records as restrictive for delete to authenticated using (
  kind <> 'securityRadioMessages' and (kind <> 'notifications' or data->>'kind' is distinct from 'security-radio' or owner = auth.uid()::text)
);

create or replace function public.security_radio_read(c text, notice_id text) returns void
language sql security definer set search_path = public as $$
  update records set data = jsonb_set(data, '{read}', 'true')
  where church_id = c and kind = 'notifications' and id = notice_id and owner = auth.uid()::text
    and data->>'kind' = 'security-radio' and data->>'read' is distinct from 'true' and security_access(c, auth.uid()) > 0
$$;

create or replace function public.security_radio_message(c text, message_id text, target uuid, body jsonb, reply_to text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  previous records%rowtype;
  original records%rowtype;
  label text;
  result jsonb;
  member uuid;
  text_body text := btrim(coalesce(body->>'text', ''));
  voice text := coalesce(body->>'voiceUrl', '');
  attachment text := coalesce(body->>'mediaUrl', '');
  media_kind text := coalesce(body->>'mediaKind', '');
  priority text := case when body->>'priority' = 'urgent' then 'urgent' else 'routine' end;
  sent_at timestamptz := clock_timestamp();
begin
  if security_access(c, actor) = 0 then raise exception 'Security Command access is required'; end if;
  if message_id is null or message_id !~ '^[a-zA-Z0-9-]{8,48}$' then raise exception 'Invalid message ID'; end if;
  if target is not null and (target = actor or security_access(c, target) = 0) then raise exception 'Choose an assigned security team member'; end if;
  if length(text_body) > 800 or length(voice) + length(attachment) > 4000000 then raise exception 'Keep messages to 800 characters and use a smaller attachment'; end if;
  if text_body = '' and voice = '' and attachment = '' then raise exception 'Enter a message or add an attachment'; end if;
  if voice <> '' and voice !~ '^data:audio/[-a-zA-Z0-9.+]+(;codecs=[a-zA-Z0-9.,_-]+)?;base64,[A-Za-z0-9+/=]+$' then raise exception 'Invalid voice recording'; end if;
  if attachment <> '' and not (media_kind in ('image','video') and
    attachment ~ ('^data:' || media_kind || '/[-a-zA-Z0-9.+]+;base64,[A-Za-z0-9+/=]+$') and
    attachment !~ '^data:image/svg[+]xml') then raise exception 'Invalid attachment'; end if;
  if reply_to is not null then
    select * into original from records where kind = 'securityRadioMessages' and church_id = c and id = reply_to;
    if not found or not can_read_security_radio_message(c, original.owner, original.data->>'recipientId')
      or target::text is distinct from original.owner then raise exception 'This message cannot be replied to'; end if;
  end if;
  select name into label from profiles where id = actor;
  label := coalesce(nullif(label,''), 'Security team member');
  result := jsonb_build_object('by', actor, 'senderName', label, 'recipientId', target,
    'text', text_body, 'voiceUrl', voice, 'mediaUrl', attachment, 'mediaKind', media_kind,
    'priority', priority, 'replyTo', reply_to, 'at', sent_at);
  insert into records(kind,id,church_id,owner,data) values ('securityRadioMessages',message_id,c,actor::text,result)
    on conflict (kind,id) do nothing;
  if not found then
    select * into previous from records where kind = 'securityRadioMessages' and id = message_id;
    if previous.church_id = c and previous.owner = actor::text
      and previous.data - 'at' - 'senderName' = result - 'at' - 'senderName' then return previous.data || jsonb_build_object('id',message_id); end if;
    raise exception 'This message ID is already in use';
  end if;
  for member in select r.id from security_radio_roster(c) r where r.id <> actor and (target is null or r.id = target)
  loop
    insert into records(kind,id,church_id,owner,data) values ('notifications',gen_random_uuid()::text,c,member::text,jsonb_build_object(
      'userId', member, 'at', sent_at, 'read', false, 'kind', 'security-radio', 'title', 'Security message · ' || label,
      'body', coalesce(nullif(left(text_body,140),''), 'Sent an attachment'), 'link', '#security-message-' || message_id,
      'radioMessageId', message_id, 'senderId', actor));
  end loop;
  return result || jsonb_build_object('id',message_id);
end $$;

revoke execute on function public.security_radio_roster(text), public.can_hear_security_radio(text),
  public.security_radio_start(text,uuid), public.security_radio_frame(text,uuid,int,text),
  public.can_read_security_radio_message(text,text,text), public.security_radio_read(text,text),
  public.security_radio_message(text,text,uuid,jsonb,text) from public, anon;
grant execute on function public.security_radio_roster(text), public.can_hear_security_radio(text),
  public.security_radio_start(text,uuid), public.security_radio_frame(text,uuid,int,text),
  public.can_read_security_radio_message(text,text,text), public.security_radio_read(text,text),
  public.security_radio_message(text,text,uuid,jsonb,text) to authenticated;

create or replace function security_protocol(c text, action text, level_no int default null,
  request_id text default null, alert jsonb default null, incident_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ch churches%rowtype;
  pending records%rowtype;
  actor uuid := auth.uid();
  access_level int;
  max_level int;
  rid text;
  approved_alert jsonb;
  recipient uuid;
  current_alert jsonb;
  protocol jsonb;
begin
  if actor is null then raise exception 'Sign in to use Security Command'; end if;
  select * into ch from churches where id = c for update;
  access_level := security_access(c, actor);
  if action = 'declare' and access_level = 0 then raise exception 'Assign a security role before declaring a protocol'; end if;
  current_alert := ch.data->'activeAlert';
  max_level := security_direct_level(c, actor);

  if action in ('approve', 'decline', 'clear') and not can_review_security_protocol(c) then
    raise exception 'Only the head of security or a church administrator can review requests or issue All Clear';
  end if;
  if action in ('approve', 'decline') then
    select * into pending from records where church_id = c and kind = 'securityProtocolRequests' and id = request_id for update;
    if not found or pending.data->>'status' <> 'pending' then raise exception 'This request is no longer pending'; end if;
    if pending.owner = actor::text or pending.data->>'requestedBy' = actor::text then
      raise exception 'Another reviewer must decide your request';
    end if;
    if action = 'decline' then
      update records set data = data || jsonb_build_object('status', 'declined', 'reviewedBy', actor, 'reviewedAt', now())
        where kind = pending.kind and id = pending.id;
      return jsonb_build_object('status', 'declined', 'id', pending.id);
    end if;
    level_no := (pending.data->>'level')::int;
    incident_id := pending.data->>'incidentId';
  end if;
  if action = 'clear' then
    if current_alert->>'active' is distinct from 'true' or current_alert->>'isDrill' = 'true' then
      raise exception 'There is no live protocol to clear';
    end if;
    perform set_config('our_faithful.security_transition', '1', true);
    update churches set data = jsonb_set(data, '{activeAlert}', 'null'::jsonb) where id = c;
    return jsonb_build_object('status', 'cleared', 'previousAlert', current_alert);
  end if;

  if action is null or action not in ('declare', 'approve') or level_no is null or level_no not between 1 and 5 then
    raise exception 'Choose a valid security protocol';
  end if;
  if nullif(incident_id, '') is not null and not exists (
    select 1 from records where kind = 'securityIncidents' and church_id = c and id = incident_id
  ) then raise exception 'The incident is not available at this church'; end if;
  if action = 'declare' and level_no > max_level then
    if exists (select 1 from records where church_id = c and kind = 'securityProtocolRequests' and owner = actor::text
      and data->>'status' = 'pending' and data->>'level' = level_no::text
      and data->>'incidentId' is not distinct from nullif(incident_id, '')) then
      raise exception 'An equivalent request is already waiting for review';
    end if;
    rid := gen_random_uuid()::text;
    insert into records (kind, id, church_id, owner, data) values (
      'securityProtocolRequests', rid, c, actor::text,
      jsonb_build_object('requestedBy', actor, 'at', now(), 'level', level_no, 'incidentId', nullif(incident_id, ''), 'status', 'pending'));
    for recipient in select ch.owner_id where ch.owner_id <> actor union select m.user_id from memberships m
      where m.church_id = c and m.user_id <> actor and (security_access(c, m.user_id) = 3 or m.role_key = 'admin'
        or exists (select 1 from roles r where r.church_id = c and r.key = m.role_key and r.perms->>'manage.church' = 'true')) loop
      insert into records (kind, id, church_id, owner, data) values ('notifications', gen_random_uuid()::text, c, recipient::text,
        jsonb_build_object('userId', recipient, 'at', now(), 'read', false, 'kind', 'security',
          'title', 'Security protocol approval requested', 'body', format('Review the request to activate Level %s.', level_no), 'link', '#security-access'));
    end loop;
    return jsonb_build_object('status', 'pending', 'id', rid, 'at', now());
  end if;

  if coalesce((ch.data->'activeDrill'->>'active')::boolean, false) then
    raise exception 'End the active drill before activating a live protocol';
  end if;
  if current_alert->>'active' = 'true' and current_alert->>'isDrill' is distinct from 'true'
      and current_alert->>'level' ~ '^[1-5]$' and (current_alert->>'level')::int >= level_no then
    raise exception 'An equal or higher security protocol is already active';
  end if;
  if jsonb_typeof(alert) is distinct from 'object' or alert->>'level' is distinct from level_no::text then
    raise exception 'The activation does not match the requested level';
  end if;
  select p into protocol from jsonb_array_elements(coalesce(ch.data->'securityProtocols', '[]'::jsonb)) p where p->>'level' = level_no::text limit 1;
  approved_alert := alert || jsonb_build_object('overrideDisplays', coalesce(protocol->'overrideDisplays', to_jsonb(level_no = 5)),
    'requireDoorCheck', coalesce(protocol->'requireDoorCheck', to_jsonb(level_no >= 3)),
    'requireRollCall', coalesce(protocol->'requireRollCall', to_jsonb(level_no in (3, 5))), 'showHomeBanner', true) || jsonb_build_object('active', true, 'isDrill', false, 'level', level_no, 'incidentId', nullif(incident_id, ''),
    'startedAt', now(), 'startedBy', actor);
  perform set_config('our_faithful.security_transition', '1', true);
  update churches set data = jsonb_set(data, '{activeAlert}', approved_alert) where id = c;
  if action = 'approve' then
    update records set data = data || jsonb_build_object('status', 'approved', 'reviewedBy', actor, 'reviewedAt', now())
      where kind = pending.kind and id = pending.id;
  end if;
  return jsonb_build_object('status', 'active', 'alert', approved_alert);
end $$;

-- ---------- Version 20: the media library (same as upgrade-20.sql) ----------

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


-- Version 23: assigned door checks for an active alert or drill.
create or replace function public.can_read_door_check(c text, assignee text) returns boolean
language sql stable security definer set search_path = public as $$
  select church_live(c) and (security_access(c, auth.uid()) >= 2 or
    (assignee = auth.uid()::text and exists (
      select 1 from memberships where church_id = c and user_id = auth.uid() and role_key not like 'device:%'
    )))
$$;
revoke execute on function public.can_read_door_check(text, text) from public, anon;
grant execute on function public.can_read_door_check(text, text) to authenticated;

drop policy if exists "read assigned door checks" on public.records;
create policy "read assigned door checks" on public.records for select to authenticated
  using (kind = 'securityDoorChecks' and can_read_door_check(church_id, owner));
drop policy if exists "restrict door check reads" on public.records;
create policy "restrict door check reads" on public.records as restrictive for select to authenticated
  using (kind <> 'securityDoorChecks' or can_read_door_check(church_id, owner));
drop policy if exists "door checks require sign-in" on public.records;
create policy "door checks require sign-in" on public.records as restrictive for select to anon
  using (kind <> 'securityDoorChecks');
drop policy if exists "door checks use RPC on insert" on public.records;
create policy "door checks use RPC on insert" on public.records as restrictive for insert
  with check (kind <> 'securityDoorChecks');
drop policy if exists "door checks use RPC on update" on public.records;
create policy "door checks use RPC on update" on public.records as restrictive for update
  using (kind <> 'securityDoorChecks') with check (kind <> 'securityDoorChecks');
drop policy if exists "door checks cannot be deleted by clients" on public.records;
create policy "door checks cannot be deleted by clients" on public.records as restrictive for delete
  using (kind <> 'securityDoorChecks');

create or replace function public.security_record_door_check(c text, door_id text, started_at text, outcome text, note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  church_data jsonb;
  alert jsonb;
  door jsonb;
  assignee text;
  check_id text;
  prior jsonb;
  result jsonb;
  checked_at timestamptz;
  actor_name text;
  issue_title text;
  is_drill boolean;
  recipient uuid;
begin
  if actor is null or not exists (
    select 1 from memberships where church_id = c and user_id = actor and role_key not like 'device:%'
  ) or not church_live(c) then raise exception 'Only current church members can submit door checks'; end if;
  note := btrim(coalesce(note, ''));
  if outcome is null or outcome not in ('locked', 'issue') or
    (outcome = 'issue' and (note = '' or char_length(note) > 140)) then
    raise exception 'Choose a valid result and describe any issue in 140 characters or fewer';
  end if;
  if outcome = 'locked' then note := ''; end if;

  -- Serialize check submissions with alert changes and entryway assignment changes.
  select data into church_data from churches where id = c for update;
  alert := church_data->'activeAlert';
  if started_at is null or alert->>'startedAt' is distinct from started_at
      or alert->>'active' is distinct from 'true' or alert->>'requireDoorCheck' is distinct from 'true' then
    raise exception 'This door check is no longer active';
  end if;
  select d into door from jsonb_array_elements(coalesce(church_data->'securityDoors', '[]'::jsonb)) as d
    where d->>'id' = door_id and d->>'requiresCheck' is distinct from 'false';
  if not found then raise exception 'This entryway does not require an active check'; end if;
  assignee := nullif(door->>'assignedTo', '');
  if assignee is distinct from actor::text and security_access(c, actor) < 2 then
    raise exception 'You can only check an entryway assigned to you';
  end if;

  check_id := md5(jsonb_build_array(c, started_at, door_id)::text);
  select data into prior from records where kind = 'securityDoorChecks' and id = check_id;
  if prior->>'status' = outcome and prior->>'issueNote' = note then return prior; end if;
  checked_at := clock_timestamp();
  select name into actor_name from profiles where id = actor;
  actor_name := coalesce(nullif(actor_name, ''), 'Church member');
  result := jsonb_build_object('doorId', door_id, 'startedAt', started_at, 'status', outcome,
    'verifiedBy', actor_name, 'verifiedAt', checked_at, 'issueNote', note);
  insert into records (kind, id, church_id, owner, data)
    values ('securityDoorChecks', check_id, c, assignee, result)
    on conflict (kind, id) do update set owner = excluded.owner, data = excluded.data, updated_at = checked_at, updated_by = actor;

  if outcome = 'issue' then
    is_drill := alert->>'isDrill' = 'true';
    issue_title := (case when is_drill then '[Drill] ' else '' end) || 'Unsecured door: ' || (door->>'name');
    insert into records (kind, id, church_id, owner, data)
      values ('securityMessages', gen_random_uuid()::text, c, actor::text,
        jsonb_build_object('by', actor, 'senderName', actor_name, 'priority', 'urgent', 'isDrill', coalesce(is_drill, false),
          'text', issue_title || ' — ' || note, 'at', checked_at));
    for recipient in select user_id from memberships where church_id = c and security_access(c, user_id) > 0 loop
      insert into records (kind, id, church_id, owner, data)
        values ('notifications', gen_random_uuid()::text, c, recipient::text,
          jsonb_build_object('userId', recipient, 'at', checked_at, 'read', false, 'kind', 'security',
            'title', issue_title, 'body', actor_name || ': ' || note, 'link',
            case when security_access(c, recipient) >= 2 then '#security-doors' else '#security' end));
    end loop;
  end if;
  return result;
end $$;
revoke execute on function public.security_record_door_check(text, text, text, text, text) from public, anon;
grant execute on function public.security_record_door_check(text, text, text, text, text) to authenticated;
