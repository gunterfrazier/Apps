-- Our Faithful Church App: upgrade from version 7 to 8 (approvals).
-- If you ran schema.sql before this change, run this once in the SQL editor. New projects only need schema.sql.
-- It adds one function and replaces another; tables and data stay as they are.

-- Volunteers the church lets join a team without waiting: everyone, or chosen people (Admin, Approvals).
create or replace function volunteer_preapproved(c text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case ch.data->'approvals'->'volunteers'->>'pre' when 'all' then true
      when 'some' then coalesce(ch.data->'approvals'->'volunteers'->'people', '[]'::jsonb) ? auth.uid()::text else false end
    from churches ch where ch.id = c), false) $$;

-- Who can add, change or remove each kind of record: joining a volunteer team, or a class or group whose leader
-- approves each request, is a request until someone approves it (unless the church pre-approved the volunteer).
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
