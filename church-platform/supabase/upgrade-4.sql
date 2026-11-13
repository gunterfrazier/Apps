-- Our Faithful Church App: upgrade from version 3 to 4 (digital signage and church devices).
-- If you ran schema.sql before this change, run this once in the SQL editor. New projects only need schema.sql.
-- It replaces six functions; tables, data and policies stay as they are.

-- Signed-in church devices (kiosks, screens, the booth) have a membership with role_key 'device:<type>' instead of a role.
create or replace function device_perms(t text) returns text[] language sql immutable set search_path = public as $$
  select case t when 'kiosk' then array['checkin.station', 'use.checkin'] when 'display' then array['present'] when 'stage' then array['present']
    when 'overlay' then array['present'] when 'booth' then array['present'] else array[]::text[] end $$;

create or replace function can(c text, perm text) returns boolean language sql stable security definer set search_path = public as
  $$ select is_primary(c) or exists (select 1 from memberships m join roles r on r.church_id = m.church_id and r.key = m.role_key
       where m.church_id = c and m.user_id = auth.uid() and coalesce((r.perms->>perm)::boolean, false))
     or exists (select 1 from memberships m where m.church_id = c and m.user_id = auth.uid() and m.role_key like 'device:%' and perm = any(device_perms(substr(m.role_key, 8)))) $$;

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
    when k = 'bookings' then can(c, 'book.rooms') or can(c, 'manage.locations')
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
    when k in ('teamMembers', 'blockouts') then own = auth.uid()::text or can(c, 'schedule.teams')
    when k = 'event_regs' then (own = auth.uid()::text and is_member(c)) or can(c, 'manage.content')
    when k = 'gathering_regs' then (own = auth.uid()::text and is_member(c)) or can(c, 'manage.classes') or leads(d->>'_parent')
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
    when k = 'channels' then d->'members' ? auth.uid()::text and can(c, 'use.chat')
    when k = 'messages' then own = auth.uid()::text and in_channel(c, d->>'channelId')
    when k = 'notifications' then (op = 'insert' and is_member(c)) or own = auth.uid()::text
    when k = 'deliveries' then (op = 'insert' and is_member(c) and d->>'status' = 'queued') or can(c, 'manage.integrations')
    when k = 'integrations' then can(c, 'manage.integrations')
    -- Devices are paired and removed by the device-pair function; a paired device can only update when it was last seen.
    when k = 'devices' then can(c, 'manage.devices') or (op = 'update' and own = auth.uid()::text)
    when k = 'signage' then can(c, 'manage.devices')
    else false end $$;

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

-- The API roles: see the end of schema.sql.
revoke execute on function guard_church(), guard_membership(), guard_records(), touch() from public, anon, authenticated;
