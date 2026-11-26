-- Push notifications: run once in the SQL editor after deploying the push function (SETUP.md step 7).
-- Replace YOUR-PROJECT below with your project's ID. Safe to run again.
--
-- Nothing to generate or paste: the push function makes its own key pair the first time it runs and keeps it in
-- Supabase Vault, and the password this trigger sends it is made here and kept in Vault too.

-- The password the trigger sends with each notification, so only this database can ask the function to send.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'our_faithful_push_hook') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'our_faithful_push_hook', 'Sent with new notifications to the push function');
  end if;
end $$;

-- For the push function only (it runs as the server): the password and the keys.
create or replace function push_config() returns jsonb language sql stable security definer set search_path = public, vault as $$
  select jsonb_build_object(
    'hook', (select decrypted_secret from vault.decrypted_secrets where name = 'our_faithful_push_hook'),
    'keys', (select decrypted_secret::jsonb from vault.decrypted_secrets where name = 'our_faithful_push_keys')) $$;
-- Keeps the first key pair the function makes. Later calls change nothing, so devices stay subscribed.
create or replace function push_keys_save(k jsonb) returns boolean language plpgsql security definer set search_path = public, vault as $$
begin
  if exists (select 1 from vault.secrets where name = 'our_faithful_push_keys') then return false; end if;
  perform vault.create_secret(k::text, 'our_faithful_push_keys', 'Web Push (VAPID) keys for push notifications');
  return true;
exception when unique_violation then return false;   -- two first runs at once: the other one's keys are kept
end $$;
revoke execute on function push_config() from public, anon, authenticated;
revoke execute on function push_keys_save(jsonb) from public, anon, authenticated;
grant execute on function push_config() to service_role;
grant execute on function push_keys_save(jsonb) to service_role;

-- Each new notification goes to the push function. A failure here never stops the notification being saved.
create or replace function notify_push() returns trigger language plpgsql security definer set search_path = public, vault as $$
begin
  if new.owner is not null then
    begin
      perform net.http_post(
        url := 'https://YOUR-PROJECT.supabase.co/functions/v1/push',
        headers := jsonb_build_object('content-type', 'application/json',
          'x-hook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'our_faithful_push_hook')),
        body := jsonb_build_object('type', 'INSERT', 'table', 'records', 'record', to_jsonb(new)));
    exception when others then raise warning 'push not queued: %', sqlerrm;
    end;
  end if;
  return null;
end $$;
revoke execute on function notify_push() from public, anon, authenticated;
drop trigger if exists records_push on records;
create trigger records_push after insert on records for each row when (new.kind = 'notifications') execute function notify_push();
