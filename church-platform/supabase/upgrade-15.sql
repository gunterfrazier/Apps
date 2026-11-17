-- Our Faithful Church App: upgrade a version 14 database to version 15. Run once in the Supabase SQL editor, after upgrade-14.sql.
-- (A new project doesn't need this: schema.sql already includes it.)
--
-- Version 15 adds community boards, targeted push notifications, arrival check-in by location, the treasurer's ledger,
-- volunteer sub claiming and shift swaps, and campus safety (SOS and 911 alerts, protocols, roll call, drills and
-- reunification). It keeps every rule versions 1 to 14 put in place and only adds what the new features need:
--   * a new permission, "Security team" (security.team), given to the Administrator, Pastor and Staff roles;
--   * on_team() and on_security_team(), used by the rules below;
--   * who can read and write the new record kinds (boards, boardPosts, pushCampaigns, expenses, budgets, batches and the
--     five security kinds), with each change marked in rec_read and rec_write;
--   * treasurers can record gifts by hand (cash, checks and others) and correct the ones they recorded; gifts recorded by
--     the payment processor still can't be changed in the app;
--   * teammates can claim a sub request or swap a shift on their own team, and can only change who serves and their answer;
--   * board posts: members react, reply, sign up and vote on posts, and can't change or remove what others wrote;
--   * church settings for safety (alerts, drills, doors, protocols) belong to the security team, gift categories to
--     people who see giving, and the live sermon to people who present or manage sermons;
--   * indexes for the new kinds.
-- Expense receipts are kept inside the expense record, so they're as private as the expense; no storage changes.

-- ---------- 1. The Security team permission ----------
update roles set perms = perms || '{"security.team": true}'::jsonb where key in ('admin', 'pastor', 'staff') and not perms ? 'security.team';

-- ---------- 2. Helpers ----------
/** Is the signed-in person an approved member of this volunteer team? */
create or replace function on_team(c text, team text) returns boolean language sql stable security definer set search_path = public as $$
  select team is not null and exists (select 1 from records m where m.kind = 'teamMembers' and m.church_id = c and m.owner = auth.uid()::text
    and lower(m.data->>'team') = lower(team) and coalesce(m.data->>'status', 'approved') <> 'requested')
$$;
/** The security team: the Security team permission, church admins, or anyone serving on a security, safety, medical,
 *  first aid, greeter or usher team. Keep in step with isSecurityMember() in src/js/98b-safety.js. */
create or replace function on_security_team(c text) returns boolean language sql stable security definer set search_path = public as $$
  select is_member(c) and (can(c, 'security.team') or can(c, 'manage.church') or exists (select 1 from records m where m.kind = 'teamMembers'
    and m.church_id = c and m.owner = auth.uid()::text and coalesce(m.data->>'status', 'approved') <> 'requested'
    and m.data->>'team' ~* '(security|safety|medical|first.?aid|greeter|usher)'))
$$;

-- ---------- 3. Church settings: who can change each one ----------
-- As in version 14, plus: giftCategories (people who see giving), livePew (presenting or managing sermons), and the
-- safety settings (the security team).
create or replace function guard_church() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; need text; lifecycle boolean := coalesce(current_setting('our_faithful.lifecycle', true), '') = '1';
begin
  if not lifecycle then
    new.data := new.data - 'deactivation';
    if tg_op = 'UPDATE' and old.data ? 'deactivation' then new.data := new.data || jsonb_build_object('deactivation', old.data->'deactivation'); end if;
  end if;
  if auth.uid() is null then return new; end if;
  new.data := new.data - 'stripe' - 'payments';
  if tg_op = 'INSERT' then return new; end if;
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
        when k in ('activeAlert', 'activeDrill', 'drillPlanner', 'securityProtocols', 'securityDoors', 'securityAeds', 'medicalResponders') then 'security.team'
        else 'manage.church' end;
      if not (case need
          when 'live.sermon' then can(old.id, 'present') or can(old.id, 'manage.sermons')
          when 'security.team' then on_security_team(old.id)
          else can(old.id, need) end)
      then raise exception 'Your role cannot change %', k; end if;
    end if;
  end loop;
  return new;
end $$;

-- ---------- 4. Who can read each kind of record ----------
create or replace function rec_read(k text, c text, loc text, own text, d jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select case
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
    when k in ('checkins', 'serving') then (can(c, 'checkin.station') or (k = 'serving' and (can(c, 'schedule.teams') or can(c, 'view.reports')))) and sees_location(c, loc)
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
    when k in ('securityIncidents', 'securityMessages', 'securityDrills') then on_security_team(c)
    -- Roll call and reunification: the security team and the people with children and classes.
    when k = 'securityRollCall' then on_security_team(c) or can(c, 'checkin.station') or can(c, 'manage.classes') or can(c, 'teach.classes')
    when k = 'securityReunifications' then on_security_team(c) or can(c, 'checkin.station')
    else false end $$;

-- ---------- 5. Who can add, change or remove each kind of record ----------
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
    when k in ('securityIncidents', 'securityMessages') then on_security_team(c) or (own = auth.uid()::text and d->>'by' = own and is_member(c) and op in ('insert', 'update'))
    when k = 'securityDrills' then on_security_team(c)
    when k = 'securityRollCall' then on_security_team(c) or can(c, 'checkin.station') or can(c, 'manage.classes') or can(c, 'teach.classes')
    when k = 'securityReunifications' then on_security_team(c) or can(c, 'checkin.station')
    else false end $$;

-- ---------- 6. Changes to someone else's record ----------
-- As in version 14 (devices, prayers), plus assignments a teammate claims or swaps and board posts others react to.
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

-- ---------- 7. Indexes for the new kinds ----------
create index if not exists records_boards_church_idx on public.records (church_id) where kind = 'boards';
create index if not exists records_board_posts_board_idx on public.records (church_id, (data->>'boardId')) where kind = 'boardPosts';
create index if not exists records_expenses_church_date_idx on public.records (church_id, (data->>'date')) where kind = 'expenses';
create index if not exists records_budgets_church_idx on public.records (church_id) where kind = 'budgets';
create index if not exists records_batches_church_date_idx on public.records (church_id, (data->>'date')) where kind = 'batches';
create index if not exists records_push_campaigns_church_idx on public.records (church_id) where kind = 'pushCampaigns';
create index if not exists records_team_members_owner_idx on public.records (church_id, owner) where kind = 'teamMembers';
create index if not exists records_security_idx on public.records (church_id, kind)
  where kind in ('securityIncidents', 'securityMessages', 'securityRollCall', 'securityDrills', 'securityReunifications');
