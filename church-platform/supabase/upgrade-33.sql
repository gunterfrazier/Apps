-- Version 33: A church's own game night questions (kind gameQuestions): quiz questions, names to unscramble, events to
-- put in order, people to guess and questions to fake out. Only people who can host game nights (or manage the church)
-- read or change them, so players can't look up the answers.
-- Run after upgrade-32.sql. New projects get the same from schema.sql.
begin;

create or replace function rec_read(k text, c text, loc text, own text, d jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when k in ('securityProtocolRequests', 'securityAccessAssignments') then is_member(c) and (own = auth.uid()::text or security_access(c, auth.uid()) = 3)
    when own is not null and own = auth.uid()::text then true
    when is_primary(c) then true
    when k = 'gameQuestions' then can(c, 'host.games') or can(c, 'manage.church')
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
    when k = 'recurring' then can(c, 'view.giving')
    -- New in 31: offering counters see the gifts in a batch while it's being counted and checked; depositors, the gifts in
    -- batches counted and waiting for the bank. Neither sees anyone's other giving.
    when k = 'gifts' then can(c, 'view.giving')
      or (can(c, 'count.offering') and offering_batch(c, d->>'batchId') in ('open', 'counted'))
      or (can(c, 'deposit.offering') and offering_batch(c, d->>'batchId') in ('counted', 'verified'))
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
    when k in ('expenses', 'budgets') then can(c, 'view.giving')
    -- New in 31: counting batches (dates, counters, totals; not who gave) for offering counters and depositors too.
    when k = 'batches' then can(c, 'view.giving') or can(c, 'count.offering') or can(c, 'deposit.offering')
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
    when k = 'gameQuestions' then can(c, 'host.games') or can(c, 'manage.church')
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
      -- New in 31: offering counters enter, fix and remove the cash and checks in a batch that's still open.
      or (can(c, 'count.offering') and d ? 'recordedBy' and d->>'method' in ('cash', 'check') and offering_batch(c, d->>'batchId') = 'open'
        and (op <> 'insert' or d->>'recordedBy' = auth.uid()::text))
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
    when k = 'budgets' then can(c, 'view.giving')
    -- New in 31: a counting batch goes open, counted, verified, closed (deposited). Counters start, count and remove an
    -- open batch; a second counter, not the one who counted it, verifies it; a depositor closes a verified batch with the
    -- deposit in their own name. A change is checked against the batch as it was and as it becomes, so a closed batch
    -- can't be reopened by a counter.
    when k = 'batches' then can(c, 'view.giving')
      or (can(c, 'count.offering') and (
        (op = 'delete' and coalesce(d->>'status', 'open') = 'open')
        or (op <> 'delete' and coalesce(d->>'status', 'open') in ('open', 'counted'))
        or (op <> 'delete' and d->>'status' = 'verified' and d->>'verifiedBy' = auth.uid()::text and d->>'countedBy' is distinct from auth.uid()::text)))
      or (can(c, 'deposit.offering') and op = 'update' and (d->>'status' = 'verified' or (d->>'status' = 'closed' and d->>'depositedBy' = auth.uid()::text)))
    -- Safety. Anyone at the church can raise an SOS or 911 alert (an incident and a message in their own name) and add their
    -- location to it; the security team handles the rest.
    when k = 'securityMessages' then security_access(c, auth.uid()) >= 1 or (own = auth.uid()::text and d->>'by' = own and is_member(c) and op in ('insert', 'update'))
    when k = 'securityIncidents' then security_access(c, auth.uid()) >= 2 or (own = auth.uid()::text and d->>'by' = own and is_member(c) and op in ('insert', 'update'))
    when k = 'securityDrills' then security_access(c, auth.uid()) = 3
    when k = 'securityRollCall' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station') or can(c, 'manage.classes') or can(c, 'teach.classes')
    when k = 'securityReunifications' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station')
    else false end $$;

commit;
