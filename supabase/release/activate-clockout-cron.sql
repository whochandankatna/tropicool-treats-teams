-- Run only after the Edge Function, schema, manager push verification and
-- Square dry run have been checked on the intended production project.
-- The secret stays in app_secrets and is never embedded in cron.job.command.
select cron.schedule(
  'check-clockouts',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://bbyfmxokfarsrifnmjxp.supabase.co/functions/v1/make-server-3ba8d4df/square/push/check-clockouts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-clockout-cron-key', (select value from public.app_secrets where key = 'clockout_cron_secret')
      ),
      body := '{"mode":"apply"}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);
