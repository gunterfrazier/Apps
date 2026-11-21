-- Incident response timeline. Run after upgrade-16.sql.
begin;

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

commit;
