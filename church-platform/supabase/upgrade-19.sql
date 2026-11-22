-- Version 19: Explicit security roles and customizable declaration levels.
-- Run after upgrade-18.sql. This does not enroll any members or increase existing supervisor overrides.
-- Safe to rerun if version 19 was partially or fully applied. Replace its policies in one transaction.

begin;

-- Internal access tiers gate tools independently of a person's direct declaration level.
create or replace function security_access(c text, person uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select case a.data->>'role' when 'head' then 3 when 'supervisor' then 2 when 'staff' then 2 when 'volunteer' then 1 else 0 end
    from memberships m
    left join records a on a.church_id = m.church_id and a.kind = 'securityAccessAssignments' and a.id = c || ':' || person::text
    where m.church_id = c and m.user_id = person and m.role_key not like 'device:%' and church_live(c)
  ), 0)
$$;
revoke execute on function security_access(text, uuid) from public, anon, authenticated;

create or replace function on_security_team(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select security_access(c, auth.uid()) > 0
$$;

create or replace function can_manage_security_access(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select church_live(c) and (is_primary(c) or can(c, 'manage.church') or exists (
    select 1 from memberships where church_id = c and user_id = auth.uid() and role_key = 'admin'
  ))
$$;

create or replace function can_review_security_protocol(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select security_access(c, auth.uid()) = 3 or can_manage_security_access(c)
$$;

create or replace function security_direct_level(c text, person uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare assignment jsonb; role_name text; cap text;
begin
  if security_access(c, person) = 0 then return 0; end if;
  select data into assignment from records where church_id = c and kind = 'securityAccessAssignments' and id = c || ':' || person::text;
  role_name := assignment->>'role';
  cap := case when assignment ? 'levelOverride' then assignment->>'levelOverride'
    when role_name = 'supervisor' then assignment->>'maxLevel' end;
  if cap ~ '^[0-5]$' then return cap::int; end if;
  select data->>role_name into cap from records where church_id = c and kind = 'securityRoleDefaults' and id = c;
  if cap ~ '^[0-5]$' then return cap::int; end if;
  return case role_name when 'volunteer' then 1 when 'staff' then 2 when 'supervisor' then 4 when 'head' then 5 else 0 end;
end $$;
revoke execute on function can_manage_security_access(text), can_review_security_protocol(text), security_direct_level(text,uuid) from public, anon, authenticated;

create or replace function security_set_role_level(c text, role_name text, max_level int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare levels jsonb;
begin
  if not can_manage_security_access(c) then raise exception 'Only church administrators can change security role defaults'; end if;
  if role_name is null or role_name not in ('volunteer','staff','supervisor','head')
    or max_level is null or max_level not between 0 and 5 then raise exception 'Choose a valid security role and level'; end if;
  perform 1 from churches where id = c for update;
  insert into records(kind, id, church_id, data) values ('securityRoleDefaults', c, c, jsonb_build_object(role_name, max_level))
    on conflict (kind, id) do update set data = records.data || excluded.data
    returning data into levels;
  return levels;
end $$;
revoke execute on function security_set_role_level(text,text,int) from public, anon;
grant execute on function security_set_role_level(text,text,int) to authenticated;

create or replace function security_assign_access(c text, person uuid, role_name text, max_level int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare assignment jsonb;
begin
  if not can_manage_security_access(c) then raise exception 'Only church administrators can assign access'; end if;
  perform 1 from churches where id = c for update;
  if not exists (select 1 from memberships where church_id = c and user_id = person and role_key not like 'device:%') then
    raise exception 'Choose a member of this church';
  end if;
  if role_name is null or role_name not in ('','volunteer','staff','supervisor','head')
    or (max_level is not null and max_level not between 0 and 5) then raise exception 'Choose a valid security role and limit'; end if;
  assignment := jsonb_build_object('userId', person, 'role', nullif(role_name, ''),
    'levelOverride', case when role_name <> '' then max_level end);
  insert into records (kind, id, church_id, owner, data) values ('securityAccessAssignments', c || ':' || person::text, c, person::text, assignment)
    on conflict (kind,id) do update set data = excluded.data;
  return assignment;
end $$;
revoke execute on function security_assign_access(text, uuid, text, int) from public, anon;
grant execute on function security_assign_access(text, uuid, text, int) to authenticated;

-- Management can see grants and pending requests without gaining operational record access.
create or replace function security_record_read(k text, c text, own text) returns boolean
language sql stable security definer set search_path = public as $$
  select case k
    when 'securityRoleDefaults' then is_member(c)
    when 'securityAccessAssignments' then is_member(c) and (own = auth.uid()::text or can_review_security_protocol(c))
    when 'securityProtocolRequests' then is_member(c) and (own = auth.uid()::text or can_review_security_protocol(c))
    when 'securityMessages' then coalesce(own = auth.uid()::text, false) or security_access(c, auth.uid()) >= 1
    when 'securityIncidents' then coalesce(own = auth.uid()::text, false) or security_access(c, auth.uid()) >= 2
    when 'securityDrills' then security_access(c, auth.uid()) = 3
    when 'securityRollCall' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station') or can(c, 'manage.classes') or can(c, 'teach.classes')
    when 'securityReunifications' then security_access(c, auth.uid()) >= 2 or can(c, 'checkin.station')
    else true end
$$;

create or replace function security_record_write(k text, c text, own text, d jsonb, op text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when k in ('securityRoleDefaults','securityAccessAssignments','securityProtocolRequests') then false
    when k = 'securityMessages' then security_access(c, auth.uid()) >= 1
      or (own = auth.uid()::text and d->>'by' = own and is_member(c) and op in ('insert','update'))
    when k = 'securityIncidents' then security_access(c, auth.uid()) >= 2
      or (own = auth.uid()::text and d->>'by' = own and is_member(c) and op in ('insert','update'))
    when k = 'securityDrills' then security_access(c, auth.uid()) = 3
    when k in ('securityRollCall','securityReunifications') then security_record_read(k, c, own)
    else true end
$$;
revoke execute on function security_record_read(text,text,text), security_record_write(text,text,text,jsonb,text) from public, anon;
grant execute on function security_record_read(text,text,text), security_record_write(text,text,text,jsonb,text) to authenticated;

drop policy if exists "read security access management records" on public.records;
drop policy if exists "restrict security record reads to assigned access" on public.records;
drop policy if exists "restrict security record inserts to assigned access" on public.records;
drop policy if exists "restrict security record updates to assigned access" on public.records;
drop policy if exists "restrict security record deletes to assigned access" on public.records;

create policy "read security access management records" on public.records for select to authenticated using (
  kind in ('securityRoleDefaults','securityAccessAssignments','securityProtocolRequests') and security_record_read(kind, church_id, owner)
);
create policy "restrict security record reads to assigned access" on public.records as restrictive for select to authenticated
  using (kind not like 'security%' or security_record_read(kind, church_id, owner));
create policy "restrict security record inserts to assigned access" on public.records as restrictive for insert to authenticated
  with check (kind not like 'security%' or security_record_write(kind, church_id, owner, data, 'insert'));
create policy "restrict security record updates to assigned access" on public.records as restrictive for update to authenticated
  using (kind not like 'security%' or security_record_write(kind, church_id, owner, data, 'update'))
  with check (kind not like 'security%' or security_record_write(kind, church_id, owner, data, 'update'));
create policy "restrict security record deletes to assigned access" on public.records as restrictive for delete to authenticated
  using (kind not like 'security%' or security_record_write(kind, church_id, owner, data, 'delete'));

create or replace function security_protocol(c text, action text, level_no int default null,
  request_id text default null, alert jsonb default null, incident_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  ch churches%rowtype;
  pending records%rowtype;
  actor uuid := auth.uid();
  access_level int;
  max_level int;
  rid text;
  approved_alert jsonb;
  recipient uuid;
  current_alert jsonb;
  protocol jsonb;
begin
  if actor is null then raise exception 'Sign in to use Security Command'; end if;
  select * into ch from churches where id = c for update;
  access_level := security_access(c, actor);
  if action = 'declare' and access_level = 0 then raise exception 'Assign a security role before declaring a protocol'; end if;
  current_alert := ch.data->'activeAlert';
  max_level := security_direct_level(c, actor);

  if action in ('approve', 'decline', 'clear') and not can_review_security_protocol(c) then
    raise exception 'Only the head of security or a church administrator can review requests or issue All Clear';
  end if;
  if action in ('approve', 'decline') then
    select * into pending from records where church_id = c and kind = 'securityProtocolRequests' and id = request_id for update;
    if not found or pending.data->>'status' <> 'pending' then raise exception 'This request is no longer pending'; end if;
    if pending.owner = actor::text or pending.data->>'requestedBy' = actor::text then
      raise exception 'Another reviewer must decide your request';
    end if;
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
    for recipient in select ch.owner_id where ch.owner_id <> actor union select m.user_id from memberships m
      where m.church_id = c and m.user_id <> actor and (security_access(c, m.user_id) = 3 or m.role_key = 'admin'
        or exists (select 1 from roles r where r.church_id = c and r.key = m.role_key and r.perms->>'manage.church' = 'true')) loop
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

commit;
