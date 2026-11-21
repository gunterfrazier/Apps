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
