-- Version 23: assigned door checks for an active alert or drill.
begin;

create or replace function public.can_read_door_check(c text, assignee text) returns boolean
language sql stable security definer set search_path = public as $$
  select church_live(c) and (security_access(c, auth.uid()) >= 2 or
    (assignee = auth.uid()::text and exists (
      select 1 from memberships where church_id = c and user_id = auth.uid() and role_key not like 'device:%'
    )))
$$;
revoke execute on function public.can_read_door_check(text, text) from public, anon;
grant execute on function public.can_read_door_check(text, text) to authenticated;

drop policy if exists "read assigned door checks" on public.records;
create policy "read assigned door checks" on public.records for select to authenticated
  using (kind = 'securityDoorChecks' and can_read_door_check(church_id, owner));
drop policy if exists "restrict door check reads" on public.records;
create policy "restrict door check reads" on public.records as restrictive for select to authenticated
  using (kind <> 'securityDoorChecks' or can_read_door_check(church_id, owner));
drop policy if exists "door checks require sign-in" on public.records;
create policy "door checks require sign-in" on public.records as restrictive for select to anon
  using (kind <> 'securityDoorChecks');
drop policy if exists "door checks use RPC on insert" on public.records;
create policy "door checks use RPC on insert" on public.records as restrictive for insert
  with check (kind <> 'securityDoorChecks');
drop policy if exists "door checks use RPC on update" on public.records;
create policy "door checks use RPC on update" on public.records as restrictive for update
  using (kind <> 'securityDoorChecks') with check (kind <> 'securityDoorChecks');
drop policy if exists "door checks cannot be deleted by clients" on public.records;
create policy "door checks cannot be deleted by clients" on public.records as restrictive for delete
  using (kind <> 'securityDoorChecks');

create or replace function public.security_record_door_check(c text, door_id text, started_at text, outcome text, note text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  church_data jsonb;
  alert jsonb;
  door jsonb;
  assignee text;
  check_id text;
  prior jsonb;
  result jsonb;
  checked_at timestamptz;
  actor_name text;
  issue_title text;
  is_drill boolean;
  recipient uuid;
begin
  if actor is null or not exists (
    select 1 from memberships where church_id = c and user_id = actor and role_key not like 'device:%'
  ) or not church_live(c) then raise exception 'Only current church members can submit door checks'; end if;
  note := btrim(coalesce(note, ''));
  if outcome is null or outcome not in ('locked', 'issue') or
    (outcome = 'issue' and (note = '' or char_length(note) > 140)) then
    raise exception 'Choose a valid result and describe any issue in 140 characters or fewer';
  end if;
  if outcome = 'locked' then note := ''; end if;

  -- Serialize check submissions with alert changes and entryway assignment changes.
  select data into church_data from churches where id = c for update;
  alert := church_data->'activeAlert';
  if started_at is null or alert->>'startedAt' is distinct from started_at
      or alert->>'active' is distinct from 'true' or alert->>'requireDoorCheck' is distinct from 'true' then
    raise exception 'This door check is no longer active';
  end if;
  select d into door from jsonb_array_elements(coalesce(church_data->'securityDoors', '[]'::jsonb)) as d
    where d->>'id' = door_id and d->>'requiresCheck' is distinct from 'false';
  if not found then raise exception 'This entryway does not require an active check'; end if;
  assignee := nullif(door->>'assignedTo', '');
  if assignee is distinct from actor::text and security_access(c, actor) < 2 then
    raise exception 'You can only check an entryway assigned to you';
  end if;

  check_id := md5(jsonb_build_array(c, started_at, door_id)::text);
  select data into prior from records where kind = 'securityDoorChecks' and id = check_id;
  if prior->>'status' = outcome and prior->>'issueNote' = note then return prior; end if;
  checked_at := clock_timestamp();
  select name into actor_name from profiles where id = actor;
  actor_name := coalesce(nullif(actor_name, ''), 'Church member');
  result := jsonb_build_object('doorId', door_id, 'startedAt', started_at, 'status', outcome,
    'verifiedBy', actor_name, 'verifiedAt', checked_at, 'issueNote', note);
  insert into records (kind, id, church_id, owner, data)
    values ('securityDoorChecks', check_id, c, assignee, result)
    on conflict (kind, id) do update set owner = excluded.owner, data = excluded.data, updated_at = checked_at, updated_by = actor;

  if outcome = 'issue' then
    is_drill := alert->>'isDrill' = 'true';
    issue_title := (case when is_drill then '[Drill] ' else '' end) || 'Unsecured door: ' || (door->>'name');
    insert into records (kind, id, church_id, owner, data)
      values ('securityMessages', gen_random_uuid()::text, c, actor::text,
        jsonb_build_object('by', actor, 'senderName', actor_name, 'priority', 'urgent', 'isDrill', coalesce(is_drill, false),
          'text', issue_title || ' — ' || note, 'at', checked_at));
    for recipient in select user_id from memberships where church_id = c and security_access(c, user_id) > 0 loop
      insert into records (kind, id, church_id, owner, data)
        values ('notifications', gen_random_uuid()::text, c, recipient::text,
          jsonb_build_object('userId', recipient, 'at', checked_at, 'read', false, 'kind', 'security',
            'title', issue_title, 'body', actor_name || ': ' || note, 'link',
            case when security_access(c, recipient) >= 2 then '#security-doors' else '#security' end));
    end loop;
  end if;
  return result;
end $$;
revoke execute on function public.security_record_door_check(text, text, text, text, text) from public, anon;
grant execute on function public.security_record_door_check(text, text, text, text, text) to authenticated;

commit;
