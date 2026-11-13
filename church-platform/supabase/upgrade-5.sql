-- Our Faithful Church App: upgrade from version 4 to 5 (each church chooses its payment processor).
-- If you ran schema.sql before this change, run this once in the SQL editor. New projects only need schema.sql.
-- It adds two server-only tables and three functions, and lets giving staff set a link to another giving service.

create table if not exists checkouts (id text primary key, church_id text not null references churches on delete cascade, provider text not null, provider_ref text,
  user_id uuid, kind text, ref text, amount numeric(12, 2), meta jsonb not null default '{}', status text not null default 'open', created_at timestamptz not null default now());
create index if not exists checkouts_provider_ref on checkouts (provider, provider_ref);
create table if not exists payment_keys (church_id text not null references churches on delete cascade, provider text not null, secret_id uuid not null,
  updated_at timestamptz not null default now(), primary key (church_id, provider));
alter table checkouts enable row level security;
alter table payment_keys enable row level security;
grant select, insert, update, delete on checkouts, payment_keys to service_role;

-- ---------- Payment processor keys ----------
-- Server functions save and read each church's keys through these; the keys themselves live encrypted in Vault.
create or replace function payment_key_set(c text, p text, s text) returns void language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select secret_id into sid from payment_keys where church_id = c and provider = p;
  if sid is null then
    sid := vault.create_secret(s, 'payments/' || c || '/' || p || '/' || gen_random_uuid(), 'Payment processor keys');
    insert into payment_keys (church_id, provider, secret_id) values (c, p, sid);
  else
    perform vault.update_secret(sid, s);
    update payment_keys set updated_at = now() where church_id = c and provider = p;
  end if;
end $$;
create or replace function payment_key_get(c text, p text) returns text language sql stable security definer set search_path = public as $$
  select d.decrypted_secret from payment_keys k join vault.decrypted_secrets d on d.id = k.secret_id where k.church_id = c and k.provider = p $$;
-- Removing a church's keys (or the church) removes the encrypted copy too.
create or replace function payment_key_forget() returns trigger language plpgsql security definer set search_path = public as $$
begin delete from vault.secrets where id = old.secret_id; return old; end $$;
drop trigger if exists payment_keys_forget on payment_keys;
create trigger payment_keys_forget after delete on payment_keys for each row execute function payment_key_forget();

-- Payment processor status is set by the server only (a browser's copy is ignored); the link to another giving service
-- is set by giving staff.
create or replace function guard_church() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; need text;
begin
  if auth.uid() is null then return new; end if;   -- server functions
  -- Payment status belongs to the server: whatever a browser sends, keep what the server last set.
  new.data := new.data - 'stripe' - 'payments';
  if tg_op = 'INSERT' then return new; end if;
  if old.data ? 'stripe' then new.data := new.data || jsonb_build_object('stripe', old.data->'stripe'); end if;
  if old.data ? 'payments' then new.data := new.data || jsonb_build_object('payments', old.data->'payments'); end if;
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

drop trigger if exists churches_guard on churches;
create trigger churches_guard before insert or update on churches for each row execute function guard_church();

revoke all on checkouts, payment_keys from anon, authenticated;
revoke execute on function payment_key_set(text, text, text), payment_key_get(text, text), payment_key_forget() from public, anon, authenticated;
grant execute on function payment_key_set(text, text, text), payment_key_get(text, text) to service_role;
