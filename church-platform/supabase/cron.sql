-- Schedules for the server functions. Run in the SQL editor after deploying them (see SETUP.md, step 9).
-- Replace YOUR-PROJECT and keep your service role key in Vault rather than in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('YOUR-SERVICE-ROLE-KEY', 'service_role_key');

select cron.schedule('koinonia-webhooks', '* * * * *', $$
  select net.http_post(url := 'https://YOUR-PROJECT.supabase.co/functions/v1/webhooks',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb) $$);

select cron.schedule('koinonia-reminders', '7 * * * *', $$
  select net.http_post(url := 'https://YOUR-PROJECT.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb) $$);
