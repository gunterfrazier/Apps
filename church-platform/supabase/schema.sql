-- Koinonia: shared database for many churches (Supabase / Postgres).
-- A church is its own account, separate from any person's account, with one primary account holder.
-- Every church-owned row carries church_id. Row-level security checks the viewer's role permissions
-- and location access through the helper functions below. Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- ---------- People ----------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null, email text, phone text, household_label text,
  created_at timestamptz not null default now()
);
create table household_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  kind text not null default 'child' check (kind in ('child', 'adult')),
  birth date,
  notes text default ''                   -- allergies and care notes for name tags
);

-- ---------- Church accounts ----------
create table churches (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null check (handle ~ '^[a-z0-9-]{2,30}$'),   -- the church ID people search for
  name text not null,
  owner_id uuid not null references auth.users,                        -- the primary account holder
  email text, phone text, city text, tagline text default '',
  color text not null default '#2f5d50', logo_path text,               -- logo in Supabase Storage
  sign text[] default '{}',
  website text, social jsonb not null default '{}',                    -- { "instagram": "https://..." }
  modules jsonb not null default '{}',                                 -- features turned on or off: { "giving": false }
  defaults jsonb not null default '{}',                                -- default role, location access, directory listing, prayer privacy, parent check-out, fund
  kids_rooms jsonb not null default '[]', teams text[] default '{}', funds jsonb not null default '[]',
  landing jsonb not null default '{"showOnHome": true, "blocks": []}', -- landing page blocks (images in Storage)
  ccli text, veritas_url text,
  stripe_account text,                                                 -- the church's connected Stripe account
  created_at timestamptz not null default now()
);
create table roles (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  key text not null,                       -- 'admin', 'member', or a custom slug
  name text not null,
  rank int not null check (rank between 1 and 99),
  perms text[] not null default '{}',      -- e.g. {'use.prayer','build.sermons','manage.content'}
  builtin boolean not null default false,
  unique (church_id, key)
);
create table locations (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{1,12}$'),
  name text not null, address text default '',
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  rooms text[] default '{}', services jsonb not null default '[]',     -- [{ "day": 0, "time": "09:00", "label": "Early service" }]
  live_url text,
  unique (church_id, code)
);
create table memberships (
  church_id uuid references churches on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role_id uuid references roles on delete set null,
  all_locations boolean not null default false,
  location_ids uuid[] not null default '{}',   -- private locations this person can see
  listed boolean not null default false,       -- shown in the member directory
  joined_at timestamptz not null default now(),
  primary key (church_id, user_id)
);

-- ---------- Permission helpers used by every policy ----------
create or replace function is_primary(c uuid) returns boolean language sql stable security definer set search_path = public as
  $$ select exists (select 1 from churches where id = c and owner_id = auth.uid()) $$;
create or replace function is_member(c uuid) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or exists (select 1 from memberships where church_id = c and user_id = auth.uid()) $$;
create or replace function my_rank(c uuid) returns int language sql stable security definer set search_path = public as
  $$ select case when is_primary(c) then 100 else coalesce((select r.rank from memberships m join roles r on r.id = m.role_id where m.church_id = c and m.user_id = auth.uid()), 0) end $$;
create or replace function can(c uuid, perm text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or exists (select 1 from memberships m join roles r on r.id = m.role_id where m.church_id = c and m.user_id = auth.uid() and perm = any(r.perms)) $$;
-- Church-wide rows (no location) and public locations are visible to all; private ones need access.
create or replace function sees_location(c uuid, loc uuid) returns boolean language sql stable security definer set search_path = public as
  $$ select loc is null or is_primary(c) or exists (select 1 from locations l where l.id = loc and l.visibility = 'public')
       or exists (select 1 from memberships m where m.church_id = c and m.user_id = auth.uid() and (m.all_locations or loc = any(m.location_ids))) $$;

-- ---------- Content ----------
create table announcements (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, location_id uuid references locations on delete set null,
  title text not null, body text not null, urgent boolean default false, posted_at timestamptz not null default now());
create table events (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, location_id uuid references locations on delete set null,
  title text not null, category text default 'Community', starts_at timestamptz not null, ends_at timestamptz not null, place text not null, description text default '',
  signup boolean default false, kids boolean default false, capacity int default 0);
create table sermons (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, location_id uuid references locations on delete set null,
  title text not null, series text default '', speaker text not null, preached_on date not null, service_time time, passage text not null, topic text default '',
  summary text default '', outline text[] default '{}', doc_id uuid, media_url text, minutes int default 35);
create table reading_plans (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade,
  name text not null, description text default '', days jsonb not null);
-- Classes, Sunday school sections and small groups share one table.
create table gatherings (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, location_id uuid references locations on delete set null,
  type text not null check (type in ('class', 'group')), category text not null, name text not null, description text default '', topic text default '', room text default '',
  schedule jsonb not null,                 -- { "kind": "weekly", "days": [0], "time": "09:00", "endTime": "10:15", "startDate": "...", "endDate": "..." } or { "kind": "once", "date": "...", ... }
  registration text not null default 'open' check (registration in ('none', 'open', 'approval')),
  capacity int default 0, age_min int, age_max int, leaders uuid[] not null default '{}', study_passage text, study_topic text);
create table gathering_members (id uuid primary key default gen_random_uuid(), gathering_id uuid not null references gatherings on delete cascade,
  user_id uuid not null references auth.users on delete cascade, child_id uuid references household_members on delete cascade,
  status text not null default 'in' check (status in ('in', 'requested')), created_at timestamptz not null default now(), unique (gathering_id, user_id, child_id));
create table event_registrations (event_id uuid references events on delete cascade, user_id uuid references auth.users on delete cascade,
  name text not null, email text, count int not null default 1 check (count between 1 and 12), kids uuid[] not null default '{}', created_at timestamptz not null default now(), primary key (event_id, user_id));

-- ---------- Builders, service plans and songs ----------
create table docs (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, location_id uuid references locations on delete set null,
  kind text not null check (kind in ('sermon', 'lesson', 'study')), title text not null, passage text, topic text, date date not null, time time,
  gathering_id uuid references gatherings on delete set null, author_id uuid references auth.users on delete set null,
  published boolean default false, share_with_parents boolean default false,
  blocks jsonb not null default '[]',      -- [{ "type": "scripture", "show": true, "notes": "private", ... }]
  resource text default '', updated_at timestamptz not null default now());
create table songs (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade,
  title text not null, author text, copyright text, ccli_song text, public_domain boolean default false, lyrics text not null, sort_order text);
create table service_plans (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, location_id uuid references locations on delete set null,
  title text not null, date date not null, time time not null, notes text default '', segments jsonb not null default '[]');
create table saved_segments (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, segment jsonb not null);

-- ---------- Prayer, cards, chat ----------
create table prayers (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, user_id uuid references auth.users on delete set null,
  text text not null check (length(text) <= 800), anonymous boolean default false, private boolean default false, hidden boolean default false,
  answered boolean default false, answer text default '', created_at timestamptz not null default now());
create table prayer_reactions (prayer_id uuid references prayers on delete cascade, user_id uuid references auth.users on delete cascade, primary key (prayer_id, user_id));
create table connect_cards (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, user_id uuid references auth.users on delete set null,
  reason text not null, message text default '', contact text not null, handled boolean default false, created_at timestamptz not null default now());
-- Group, class and parent channels are keyed by gathering; leadership by church; direct messages list their members.
create table channels (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade,
  kind text not null check (kind in ('group', 'parents', 'leaders', 'dm')), gathering_id uuid references gatherings on delete cascade, members uuid[] not null default '{}');
create table messages (id uuid primary key default gen_random_uuid(), channel_id uuid not null references channels on delete cascade, user_id uuid references auth.users on delete set null,
  text text not null check (length(text) <= 2000), created_at timestamptz not null default now());

-- ---------- Check-in and giving ----------
create table checkins (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, location_id uuid references locations on delete set null,
  user_id uuid not null references auth.users on delete cascade, child_id uuid not null references household_members on delete cascade,
  service_key text not null, room text not null, code text not null,
  checked_in_at timestamptz not null default now(), checked_out_at timestamptz, checked_out_by text check (checked_out_by in ('staff', 'parent')));
create table serving (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, user_id uuid not null references auth.users on delete cascade,
  team text not null, service_key text not null, created_at timestamptz not null default now());
-- Written only by the server (Stripe webhook), never directly by the app.
create table gifts (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, user_id uuid references auth.users on delete set null,
  fund_id text not null, amount_cents int not null check (amount_cents > 0), frequency text not null default 'once', method text not null default 'card',
  stripe_payment_id text unique, created_at timestamptz not null default now());

-- ---------- Integrations ----------
create table webhooks (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade,
  url text not null check (url ~ '^https://'), events text[] not null, secret text not null, active boolean not null default true, created_at timestamptz not null default now());
-- Filled by database triggers or server functions; a worker posts each one with an X-Koinonia-Signature header and retries failures.
create table webhook_deliveries (id uuid primary key default gen_random_uuid(), webhook_id uuid not null references webhooks on delete cascade, event text not null, body jsonb not null,
  status text not null default 'queued', attempts int not null default 0, last_error text, created_at timestamptz not null default now(), delivered_at timestamptz);
create table embeds (id uuid primary key default gen_random_uuid(), church_id uuid not null references churches on delete cascade, title text not null, url text not null, show_in_menu boolean default true);

-- ---------- Personal ----------
create table sermon_notes (user_id uuid references auth.users on delete cascade, sermon_id uuid references sermons on delete cascade, text text not null, updated_at timestamptz not null default now(), primary key (user_id, sermon_id));
create table plan_progress (user_id uuid references auth.users on delete cascade, plan_id uuid references reading_plans on delete cascade, started_at timestamptz not null default now(), done int[] not null default '{}', primary key (user_id, plan_id));

-- ---------- Row-level security ----------
do $$ declare t text; begin
  foreach t in array array['profiles','household_members','churches','roles','locations','memberships','announcements','events','sermons','reading_plans','gatherings','gathering_members',
    'event_registrations','docs','songs','service_plans','saved_segments','prayers','prayer_reactions','connect_cards','channels','messages','checkins','serving','gifts',
    'webhooks','webhook_deliveries','embeds','sermon_notes','plan_progress'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "members see listed profiles" on profiles for select using (exists (select 1 from memberships m where m.user_id = profiles.id and m.listed and is_member(m.church_id)));
create policy "own household" on household_members for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "check-in staff see kids" on household_members for select using (exists (select 1 from checkins c where c.child_id = household_members.id and can(c.church_id, 'checkin.station')));

-- Church accounts: anyone can find one; you create it as its primary; settings need manage.church.
create policy "find churches" on churches for select using (true);
create policy "register church" on churches for insert with check (owner_id = auth.uid());
create policy "edit church" on churches for update using (can(id, 'manage.church') or can(id, 'manage.page') or can(id, 'view.giving'));
create or replace function guard_owner() returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id and old.owner_id <> auth.uid() then raise exception 'Only the primary account holder can hand over the account'; end if;
  return new;
end $$;
create trigger churches_guard_owner before update on churches for each row execute function guard_owner();

-- Roles: you only change roles below your own; only the primary changes Administrator.
create policy "read roles" on roles for select using (is_member(church_id));
create policy "manage roles" on roles for all using (can(church_id, 'manage.roles') and rank < my_rank(church_id)) with check (can(church_id, 'manage.roles') and rank < my_rank(church_id));

create policy "read locations" on locations for select using (sees_location(church_id, id));
create policy "manage locations" on locations for all using (can(church_id, 'manage.locations')) with check (can(church_id, 'manage.locations'));

-- Memberships: join yourself with the church's default role; give roles only below your own.
create policy "see memberships" on memberships for select using (user_id = auth.uid() or (listed and is_member(church_id)) or can(church_id, 'manage.people') or can(church_id, 'manage.roles'));
create policy "join" on memberships for insert with check (user_id = auth.uid() and role_id = (select r.id from roles r join churches c on c.id = r.church_id where r.church_id = memberships.church_id and r.key = coalesce(c.defaults->>'roleId', 'member')));
create policy "change membership" on memberships for update using (user_id = auth.uid() or can(church_id, 'manage.people') or can(church_id, 'manage.roles'));
create policy "leave or remove" on memberships for delete using (user_id = auth.uid() or can(church_id, 'manage.people'));
create or replace function guard_membership() returns trigger language plpgsql as $$
begin
  if (new.role_id is distinct from old.role_id or new.all_locations is distinct from old.all_locations or new.location_ids is distinct from old.location_ids) then
    if not can(old.church_id, 'manage.roles') then raise exception 'Your role cannot change roles or location access'; end if;
    if not is_primary(old.church_id) and ((select rank from roles where id = new.role_id) >= my_rank(old.church_id) or (select rank from roles where id = old.role_id) >= my_rank(old.church_id)) then
      raise exception 'You can only give roles below your own'; end if;
  end if;
  return new;
end $$;
create trigger memberships_guard before update on memberships for each row execute function guard_membership();

-- Location-tagged content: readable where the viewer sees the location; written by the right permission.
do $$ declare t text; p text; begin
  for t, p in select * from (values ('announcements','manage.content'), ('events','manage.content'), ('sermons','manage.sermons'), ('gatherings','manage.classes'), ('service_plans','services.plan')) v loop
    execute format('create policy "read %1$s" on %1$s for select using (sees_location(church_id, location_id))', t);
    execute format('create policy "write %1$s" on %1$s for all using (can(church_id, %2$L) and sees_location(church_id, location_id)) with check (can(church_id, %2$L) and sees_location(church_id, location_id))', t, p);
  end loop;
end $$;
create policy "read plans" on reading_plans for select using (true);
create policy "write plans" on reading_plans for all using (can(church_id, 'manage.sermons')) with check (can(church_id, 'manage.sermons'));
create policy "leaders edit their gatherings" on gatherings for update using (auth.uid() = any(leaders) and (can(church_id, 'lead.groups') or can(church_id, 'teach.classes')));
create policy "team reads songs" on songs for select using (can(church_id, 'services.plan') or can(church_id, 'present'));
create policy "planners write songs" on songs for all using (can(church_id, 'services.plan')) with check (can(church_id, 'services.plan'));
create policy "team reads saved segments" on saved_segments for select using (can(church_id, 'services.plan') or can(church_id, 'present'));
create policy "planners write saved segments" on saved_segments for all using (can(church_id, 'services.plan')) with check (can(church_id, 'services.plan'));

-- Registrations
create policy "own gathering registrations" on gathering_members for all using (user_id = auth.uid()) with check (user_id = auth.uid() and exists (select 1 from gatherings g where g.id = gathering_id and g.registration <> 'none' and sees_location(g.church_id, g.location_id)
  and (status = 'requested' or g.registration = 'open')));
create policy "leaders manage rosters" on gathering_members for all using (exists (select 1 from gatherings g where g.id = gathering_id and (auth.uid() = any(g.leaders) or can(g.church_id, 'manage.classes'))));
create policy "own event registrations" on event_registrations for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "staff see event registrations" on event_registrations for select using (exists (select 1 from events e where e.id = event_id and can(e.church_id, 'manage.content')));

-- Builder documents: authors and the right builders edit; published ones are read by the right audience.
create policy "builders edit docs" on docs for all using (author_id = auth.uid() or (kind = 'sermon' and can(church_id, 'build.sermons'))
  or (kind <> 'sermon' and (can(church_id, 'manage.classes') or exists (select 1 from gatherings g where g.id = gathering_id and auth.uid() = any(g.leaders)))))
  with check (can(church_id, case kind when 'sermon' then 'build.sermons' when 'lesson' then 'build.lessons' else 'build.studies' end));
create policy "presenters read docs" on docs for select using (can(church_id, 'present'));
-- Members never read docs directly, because private blocks and notes live in the same row.
-- Serve published docs to members through this function, which strips them.
create or replace function published_doc(doc uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', d.id, 'kind', d.kind, 'title', d.title, 'passage', d.passage, 'topic', d.topic, 'date', d.date,
    'blocks', coalesce((select jsonb_agg(b - 'notes') from jsonb_array_elements(d.blocks) b where (b->>'show')::boolean and b->>'type' <> 'note'), '[]'::jsonb))
  from docs d where d.id = doc and d.published and is_member(d.church_id) and (d.gathering_id is null
    or exists (select 1 from gathering_members m where m.gathering_id = d.gathering_id and m.user_id = auth.uid())
    or exists (select 1 from gatherings g where g.id = d.gathering_id and auth.uid() = any(g.leaders))) $$;

-- Prayer wall
create policy "read prayers" on prayers for select using (user_id = auth.uid() or can(church_id, 'manage.prayer') or (is_member(church_id) and not private and not hidden));
create policy "post prayers" on prayers for insert with check (user_id = auth.uid() and can(church_id, 'use.prayer'));
create policy "edit prayers" on prayers for update using (user_id = auth.uid() or can(church_id, 'manage.prayer'));
create policy "delete prayers" on prayers for delete using (user_id = auth.uid() or can(church_id, 'manage.prayer'));
create policy "react" on prayer_reactions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "count reactions" on prayer_reactions for select using (true);
create policy "send cards" on connect_cards for insert with check (user_id = auth.uid());
create policy "read cards" on connect_cards for select using (can(church_id, 'manage.prayer'));
create policy "handle cards" on connect_cards for update using (can(church_id, 'manage.prayer'));

-- Chat: who belongs to each channel follows the gathering, the role, or the member list.
create or replace function in_channel(ch uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from channels c where c.id = ch and can(c.church_id, 'use.chat') and (
    (c.kind = 'dm' and auth.uid() = any(c.members))
    or (c.kind = 'leaders' and can(c.church_id, 'chat.leaders'))
    or (c.kind = 'group' and exists (select 1 from gatherings g where g.id = c.gathering_id and (auth.uid() = any(g.leaders) or exists (select 1 from gathering_members m where m.gathering_id = g.id and m.user_id = auth.uid() and m.child_id is null and m.status = 'in'))))
    or (c.kind = 'parents' and exists (select 1 from gatherings g where g.id = c.gathering_id and (auth.uid() = any(g.leaders) or exists (select 1 from gathering_members m where m.gathering_id = g.id and m.user_id = auth.uid() and m.child_id is not null and m.status = 'in'))))
  )) $$;
create policy "see channels" on channels for select using (in_channel(id));
create policy "start direct messages" on channels for insert with check (kind = 'dm' and auth.uid() = any(members) and can(church_id, 'use.chat'));
create policy "read messages" on messages for select using (in_channel(channel_id));
create policy "send messages" on messages for insert with check (user_id = auth.uid() and in_channel(channel_id));

-- Check-in: parents manage their own kids (parent check-out if the church allows it); the check-in team sees rosters.
create policy "own checkins" on checkins for select using (user_id = auth.uid());
create policy "check in own kids" on checkins for insert with check (user_id = auth.uid() and can(church_id, 'use.checkin'));
create policy "parent check-out" on checkins for update using (user_id = auth.uid() and coalesce((select (defaults->>'parentCheckout')::boolean from churches where id = church_id), false));
create policy "check-in team" on checkins for all using (can(church_id, 'checkin.station') and sees_location(church_id, location_id));
create policy "own serving" on serving for all using (user_id = auth.uid()) with check (user_id = auth.uid() and is_member(church_id));
create policy "team sees serving" on serving for select using (can(church_id, 'checkin.station'));

create policy "own gifts" on gifts for select using (user_id = auth.uid());
create policy "giving reports" on gifts for select using (can(church_id, 'view.giving'));

create policy "manage webhooks" on webhooks for all using (can(church_id, 'manage.integrations')) with check (can(church_id, 'manage.integrations'));
create policy "see deliveries" on webhook_deliveries for select using (exists (select 1 from webhooks w where w.id = webhook_id and can(w.church_id, 'manage.integrations')));
create policy "read embeds" on embeds for select using (is_member(church_id));
create policy "manage embeds" on embeds for all using (can(church_id, 'manage.integrations')) with check (can(church_id, 'manage.integrations'));

create policy "own notes" on sermon_notes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own progress" on plan_progress for all using (user_id = auth.uid()) with check (user_id = auth.uid());
