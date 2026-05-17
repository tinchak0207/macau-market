-- Daily warm-up job for Macau Local Radar
-- Replace the URL and secret placeholders before running.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('macau_market_daily_refresh')
where exists (
  select 1
  from cron.job
  where jobname = 'macau_market_daily_refresh'
);

select
  cron.schedule(
    'macau_market_daily_refresh',
    '10 6 * * *',
    $$
    select
      net.http_post(
        url := 'https://YOUR_APP_DOMAIN/api/internal/refresh-daily',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_APP_CRON_SECRET'
        ),
        body := '{}'::jsonb
      );
    $$
  );
