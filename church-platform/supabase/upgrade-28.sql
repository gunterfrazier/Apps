-- Version 28: Private live channels. Slides, room presentations and booth commands move from open broadcast channels
-- (present:<church>) to private ones that Realtime checks against these rules:
--   live:<church>                 slides from the booth. Members of the church (people and its paired screens) hear
--                                 them; people and devices that can present send them.
--   live:<church>:room:<token>    a presentation in one room. Members hear it; it's sent by people who can present,
--                                 people who can present in any room, or whoever holds that room session.
--   control:<church>              commands to the booth (the phone remote now, the Stream Deck later). People and
--                                 devices that can present send and hear them; the control function sends with the
--                                 server's key, which these rules don't apply to.
-- For one release the app also keeps sending and hearing the old open channels, so screens and booths still on an
-- older copy of the app keep working. The next release stops using them.
-- Run after upgrade-27.sql. New projects get the same from schema.sql.
begin;

-- The church and room session named in a live channel's topic.
create or replace function public.live_topic_church(topic text) returns text language sql immutable set search_path = public as $$
  select split_part(topic, ':', 2)
$$;

-- Does the signed-in person (or device) hold this room session, and is it current?
create or replace function public.holds_room_session(c text, token text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from records r where r.kind = 'roomSessions' and r.church_id = c and r.owner = auth.uid()::text
    and r.data->>'token' = token and coalesce((r.data->>'until')::timestamptz, now()) > now() - interval '5 minutes')
$$;

create or replace function public.can_hear_live(topic text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when topic ~ '^live:[a-z0-9-]+(:room:[A-Za-z0-9_-]+)?$' then is_member(live_topic_church(topic))
    when topic ~ '^control:[a-z0-9-]+$' then can(live_topic_church(topic), 'present')
    else false end
$$;

create or replace function public.can_send_live(topic text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when topic ~ '^live:[a-z0-9-]+$' then can(live_topic_church(topic), 'present')
    when topic ~ '^live:[a-z0-9-]+:room:[A-Za-z0-9_-]+$' then can(live_topic_church(topic), 'present')
      or can(live_topic_church(topic), 'present.rooms') or holds_room_session(live_topic_church(topic), split_part(topic, ':', 4))
    when topic ~ '^control:[a-z0-9-]+$' then can(live_topic_church(topic), 'present')
    else false end
$$;

revoke execute on function public.holds_room_session(text, text), public.can_hear_live(text), public.can_send_live(text) from public, anon;
grant execute on function public.holds_room_session(text, text), public.can_hear_live(text), public.can_send_live(text) to authenticated;

drop policy if exists "live channels are heard by the church" on realtime.messages;
create policy "live channels are heard by the church" on realtime.messages for select to authenticated using (
  extension = 'broadcast' and public.can_hear_live(coalesce(realtime.topic(), topic))
);
drop policy if exists "live channels are sent by presenters" on realtime.messages;
create policy "live channels are sent by presenters" on realtime.messages for insert to authenticated with check (
  extension = 'broadcast' and public.can_send_live(coalesce(realtime.topic(), topic))
);

commit;
