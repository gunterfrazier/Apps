-- Our Faithful Church App: upgrade from version 5 to 6 (shared training churches).
-- If you ran schema.sql before this change, run this once in the SQL editor. New projects only need schema.sql.
-- It replaces two functions and adds one; tables and data stay as they are.

-- A training church can't connect a payment processor, so no money moves in one.
create or replace function payment_key_set(c text, p text, s text) returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if exists (select 1 from churches where id = c and data ? 'training') then raise exception 'A training church can''t connect a payment processor'; end if;
  select secret_id into sid from payment_keys where church_id = c and provider = p;
  if sid is null then
    sid := vault.create_secret(s, 'payments/' || c || '/' || p || '/' || gen_random_uuid(), 'Payment processor keys');
    insert into payment_keys (church_id, provider, secret_id) values (c, p, sid);
  else
    perform vault.update_secret(sid, s);
    update payment_keys set updated_at = now() where church_id = c and provider = p;
  end if;
end $$;

-- Payment status is the server's; a training church stays one, and a real church can't become one.
create or replace function guard_church() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; need text;
begin
  if auth.uid() is null then return new; end if;   -- server functions
  -- Payment status belongs to the server: whatever a browser sends, keep what the server last set.
  new.data := new.data - 'stripe' - 'payments';
  if tg_op = 'INSERT' then return new; end if;
  if old.data ? 'stripe' then new.data := new.data || jsonb_build_object('stripe', old.data->'stripe'); end if;
  if old.data ? 'payments' then new.data := new.data || jsonb_build_object('payments', old.data->'payments'); end if;
  -- A training church is one from the start and stays one; a real church can't be turned into one.
  new.data := new.data - 'training';
  if old.data ? 'training' then new.data := new.data || jsonb_build_object('training', old.data->'training'); end if;
  if new.owner_id is distinct from old.owner_id and old.owner_id <> auth.uid() then raise exception 'Only the primary account holder can hand over the account'; end if;
  if (new.name, new.handle) is distinct from (old.name, old.handle) and not can(old.id, 'manage.church') then raise exception 'Your role cannot change the church name or ID'; end if;
  for k in select key from jsonb_each(new.data) union select key from jsonb_each(old.data) loop
    if new.data->k is distinct from old.data->k then
      need := case
        when k in ('landing', 'banner') then 'manage.page'
        when k in ('funds', 'textGive', 'taxId', 'givingLink') then 'view.giving'
        when k in ('teams', 'positions') then 'schedule.teams'
        when k in ('followupSteps', 'followupLead') then 'manage.followup'
        when k = 'podcast' then 'manage.sermons'
        when k = 'kidsRooms' then 'manage.classes'
        else 'manage.church' end;
      if not can(old.id, need) then raise exception 'Your role cannot change %', k; end if;
    end if;
  end loop;
  return new;
end $$;

-- A training church's managers can clear it and start fresh.
create or replace function reset_training_church(c text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from churches where id = c and data ? 'training') then raise exception 'Only a training church can be reset'; end if;
  if not can(c, 'manage.church') then raise exception 'Ask an administrator of the training church to reset it'; end if;
  delete from records where church_id = c;
  delete from checkouts where church_id = c;
  delete from payments where church_id = c;
end $$;

revoke execute on function payment_key_set(text, text, text) from public, anon, authenticated;
grant execute on function payment_key_set(text, text, text) to service_role;
revoke execute on function reset_training_church(text) from public, anon;
grant execute on function reset_training_church(text) to authenticated;
