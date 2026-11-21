-- Version 16: Security Command permissions and protocol approval. Run after upgrade-15.sql.

begin;

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

commit;
