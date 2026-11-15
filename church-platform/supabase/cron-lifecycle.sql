-- Our Faithful Church App: the hourly job for deactivated church accounts. Run once in the Supabase SQL editor, after
-- schema.sql (or upgrade-9.sql) and after deploying the church-lifecycle function. Replace YOUR-PROJECT first.
--
-- Every hour the database adds the in-app reminders for primary account holders (180, 90, 30, 14, 7, 3 and 1 days
-- before the data is deleted) and removes churches that have been deactivated for a full year. Then it has the
-- church-lifecycle function send the emails and clear uploaded files.
-- No password to set for this one: the database hands the function a one-time pass each time.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('our-faithful-church-lifecycle', '23 * * * *',
  $$ select church_lifecycle_tick('https://YOUR-PROJECT.supabase.co/functions/v1/church-lifecycle') $$);

-- To see that it's running:  select * from cron.job_run_details order by start_time desc limit 5;
-- To run it by hand now:     select church_lifecycle_tick('https://YOUR-PROJECT.supabase.co/functions/v1/church-lifecycle');
-- To stop it:                select cron.unschedule('our-faithful-church-lifecycle');
