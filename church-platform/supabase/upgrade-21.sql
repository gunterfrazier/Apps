-- Version 21: Live Security Command radio and private messages.
-- Requires upgrade-19.sql. If upgrading the media library in the same rollout, run upgrade-20.sql first.

begin;

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

commit;
