-- Schedules for the server functions. Run in the SQL editor after deploying them (see SETUP.md, step 9).
-- 1. Replace YOUR-PROJECT with your project's reference (the part before .supabase.co).
-- 2. Replace PASTE-THE-SAME-RANDOM-TEXT with the CRON_SECRET you set with `supabase secrets set`.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('PASTE-THE-SAME-RANDOM-TEXT', 'our_faithful_cron_secret');

select cron.schedule('our-faithful-webhooks', '* * * * *', $$
  select net.http_post(url := 'https://YOUR-PROJECT.supabase.co/functions/v1/webhooks',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'our_faithful_cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb) $$);

select cron.schedule('our-faithful-reminders', '7 * * * *', $$
  select net.http_post(url := 'https://YOUR-PROJECT.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'our_faithful_cron_secret'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb) $$);
